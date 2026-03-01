import { useState } from "react";
import "../styles/Home.css";
import { STANDARD_ITEMS_BY_CATEGORY } from "../data/standardItems";

const QTY_ONLY_CATEGORIES = new Set([
  "Fascia Accessories",
  "Gutter Accessories",
  "Battens",
  "Insulation",
]);
const ORDER_DRAFTS_STORAGE_KEY = "roofing-app.order-drafts.v1";
const createLineId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const DEFAULT_ORDER_INFO = {
  builder: "",
  orderNumber: "",
  address: "",
  orderDate: new Date().toISOString().split("T")[0],
  deliveryDate: "",
  roofColour: "",
  fasciaColour: "",
  gutterColour: "",
  notes: "",
  supplierId: "",
};

function normalizeCategoryDefinitions(source) {
  return Object.entries(source).map(([category, value]) => {
    if (Array.isArray(value)) {
      return {
        category,
        subcategories: [{ name: "General", items: value }],
      };
    }

    if (value && typeof value === "object") {
      const subcategories = Object.entries(value)
        .filter(([, items]) => Array.isArray(items))
        .map(([name, items]) => ({ name, items }));

      if (subcategories.length > 0) {
        return { category, subcategories };
      }
    }

    return {
      category,
      subcategories: [{ name: "General", items: [] }],
    };
  });
}

const CATEGORY_DEFINITIONS = normalizeCategoryDefinitions(STANDARD_ITEMS_BY_CATEGORY);

function makeCategorySubKey(category, subcategory) {
  return `${category}::${subcategory}`;
}

function buildDefaultSelectedSubcategoryByCategory() {
  return Object.fromEntries(
    CATEGORY_DEFINITIONS.map((item) => [item.category, item.subcategories[0]?.name || "General"])
  );
}

function buildDefaultSelectedItemByCategoryAndSubcategory() {
  const entries = CATEGORY_DEFINITIONS.flatMap((item) =>
    item.subcategories.map((sub) => [makeCategorySubKey(item.category, sub.name), sub.items[0] || ""])
  );
  return Object.fromEntries(entries);
}

export default function Home({
  onStartOrder,
  suppliers = [],
  embedded = false,
  orderInfo: externalOrderInfo,
  onOrderInfoChange,
  standardSelections = [],
  onStandardSelectionsChange,
}) {
  const [view, setView] = useState(embedded ? "newOrder" : "menu");

  const [localOrderInfo, setLocalOrderInfo] = useState(DEFAULT_ORDER_INFO);
  const orderInfo = externalOrderInfo || localOrderInfo;
  const setOrderInfo = onOrderInfoChange || setLocalOrderInfo;

  const [selectedLines, setSelectedLines] = useState(() =>
    (standardSelections || []).map((item) => ({
      id: createLineId(),
      category: item.category,
      subcategory: item.subcategory || "General",
      item: item.item,
      qty: String(item.qty),
      length: item.length === "" ? "" : String(item.length),
    }))
  );
  const [selectedSubcategoryByCategory, setSelectedSubcategoryByCategory] = useState(
    buildDefaultSelectedSubcategoryByCategory
  );
  const [selectedItemByCategoryAndSubcategory, setSelectedItemByCategoryAndSubcategory] = useState(
    buildDefaultSelectedItemByCategoryAndSubcategory
  );
  const [selectionConfirmed, setSelectionConfirmed] = useState((standardSelections || []).length > 0);
  const [savedDrafts, setSavedDrafts] = useState(() => {
    try {
      const raw = localStorage.getItem(ORDER_DRAFTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn("Unable to read order drafts", error);
      return [];
    }
  });

  const selectedSupplierId = orderInfo.supplierId || suppliers[0]?.id || "";

  const setConfirmedSelections = (nextSelections) => {
    if (onStandardSelectionsChange) {
      onStandardSelectionsChange(nextSelections);
    }
  };

  const requiresLength = (category) => !QTY_ONLY_CATEGORIES.has(category);

  const groupLinesByProduct = (lines) => {
    return lines.reduce((acc, line) => {
      const key = `${line.subcategory || "General"}::${line.item}`;
      if (!acc[key]) {
        acc[key] = {
          subcategory: line.subcategory || "General",
          item: line.item,
          lines: [],
        };
      }
      acc[key].lines.push(line);
      return acc;
    }, {});
  };

  const addProductLine = (category, subcategory, item) => {
    if (!item) {
      return;
    }
    setSelectionConfirmed(false);
    setConfirmedSelections([]);
    setSelectedLines((prev) => [
      ...prev,
      { id: createLineId(), category, subcategory, item, qty: "", length: "" },
    ]);
  };

  const updateLine = (id, field, value) => {
    setSelectionConfirmed(false);
    setConfirmedSelections([]);
    setSelectedLines((prev) => {
      const next = prev.map((line) => (line.id === id ? { ...line, [field]: value } : line));
      const editedLine = next.find((line) => line.id === id);
      if (!editedLine) {
        return next;
      }

      const isComplete =
        editedLine.qty !== "" &&
        (requiresLength(editedLine.category) ? editedLine.length !== "" : true);
      if (!isComplete) {
        return next;
      }

      const hasBlankForSameProduct = next.some(
        (line) =>
          line.category === editedLine.category &&
          line.subcategory === editedLine.subcategory &&
          line.item === editedLine.item &&
          (line.qty === "" || (requiresLength(line.category) && line.length === ""))
      );

      if (!hasBlankForSameProduct) {
        next.push({
          id: createLineId(),
          category: editedLine.category,
          subcategory: editedLine.subcategory,
          item: editedLine.item,
          qty: "",
          length: "",
        });
      }

      return next;
    });
  };

  const removeLine = (id) => {
    setSelectionConfirmed(false);
    setConfirmedSelections([]);
    setSelectedLines((prev) => prev.filter((line) => line.id !== id));
  };

  const completedSelections = selectedLines
    .filter(
      (line) => line.qty !== "" && (requiresLength(line.category) ? line.length !== "" : true)
    )
    .map((line) => ({
      category: line.category,
      subcategory: line.subcategory || "General",
      item: line.item,
      qty: Number(line.qty),
      length: requiresLength(line.category) ? Number(line.length) : "",
    }))
    .filter((line) => line.qty > 0 && (requiresLength(line.category) ? line.length > 0 : true));

  const confirmSelections = () => {
    if (completedSelections.length === 0) {
      alert("Add at least one line with Qty and Len before confirming.");
      return;
    }
    setSelectionConfirmed(true);
    setConfirmedSelections(completedSelections);
  };

  const saveDrafts = (drafts) => {
    setSavedDrafts(drafts);
    try {
      localStorage.setItem(ORDER_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.warn("Unable to save order drafts", error);
    }
  };

  const handleSaveDraft = () => {
    const draft = {
      id: createLineId(),
      savedAt: Date.now(),
      orderInfo,
      selectedLines,
      selectedSubcategoryByCategory,
      selectedItemByCategoryAndSubcategory,
      selectionConfirmed,
    };
    saveDrafts([draft, ...savedDrafts]);
    alert("Order draft saved.");
  };

  const handleLoadDraft = (draftId) => {
    const draft = savedDrafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }

    setOrderInfo(draft.orderInfo);
    setSelectedLines(draft.selectedLines || []);
    setSelectedSubcategoryByCategory({
      ...buildDefaultSelectedSubcategoryByCategory(),
      ...(draft.selectedSubcategoryByCategory || {}),
    });
    setSelectedItemByCategoryAndSubcategory({
      ...buildDefaultSelectedItemByCategoryAndSubcategory(),
      ...(draft.selectedItemByCategoryAndSubcategory || {}),
    });
    const nextConfirmed = Boolean(draft.selectionConfirmed);
    setSelectionConfirmed(nextConfirmed);
    if (nextConfirmed) {
      const loadedCompletedSelections = (draft.selectedLines || [])
        .filter(
          (line) =>
            line.qty !== "" && (requiresLength(line.category) ? line.length !== "" : true)
        )
        .map((line) => ({
          category: line.category,
          subcategory: line.subcategory || "General",
          item: line.item,
          qty: Number(line.qty),
          length: requiresLength(line.category) ? Number(line.length) : "",
        }))
        .filter(
          (line) => line.qty > 0 && (requiresLength(line.category) ? line.length > 0 : true)
        );
      setConfirmedSelections(loadedCompletedSelections);
    } else {
      setConfirmedSelections([]);
    }
    setView("newOrder");
  };

  const handleDeleteDraft = (draftId) => {
    saveDrafts(savedDrafts.filter((draft) => draft.id !== draftId));
  };

  const handleStart = () => {
    onStartOrder({
      ...orderInfo,
      supplier: suppliers.find((item) => item.id === selectedSupplierId) || null,
      standardSelections: completedSelections,
      standardCategory: completedSelections[0]?.category || "",
      standardItem: completedSelections[0]?.item || "",
    });
  };

  if (!embedded && view === "menu") {
    return (
      <div className="home-container">
        <div className="home-card">
          <h1>Roofing Order</h1>
          <p className="home-subtitle">Choose what you want to do.</p>

          <div className="home-actions">
            <button className="action-btn" onClick={() => setView("newOrder")}>
              New Order
            </button>
          </div>
          <div className="saved-drafts">
            <h3>Saved Orders</h3>
            {savedDrafts.length === 0 ? (
              <p className="saved-drafts-empty">No saved orders yet.</p>
            ) : (
              <ul className="saved-drafts-list">
                {savedDrafts.map((draft) => (
                  <li key={draft.id}>
                    <button className="saved-drafts-load" onClick={() => handleLoadDraft(draft.id)}>
                      {draft.orderInfo?.orderNumber || "Untitled Order"} |{" "}
                      {new Date(draft.savedAt).toLocaleString()}
                    </button>
                    <button className="saved-drafts-delete" onClick={() => handleDeleteDraft(draft.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>Standard Items</h1>
        <p className="home-subtitle">Choose standard items by category.</p>

        <div className="standard-items-section">
          <h2>Standard items</h2>
          <div className="category-grid">
            {CATEGORY_DEFINITIONS.map((def) => {
              const category = def.category;
              const subcategories = def.subcategories;
              const selectedSubcategory = selectedSubcategoryByCategory[category] || subcategories[0]?.name || "General";
              const items = subcategories.find((s) => s.name === selectedSubcategory)?.items || [];
              const itemKey = makeCategorySubKey(category, selectedSubcategory);
              const selectedItem = selectedItemByCategoryAndSubcategory[itemKey] || items[0] || "";

              const linesForCategory = selectedLines.filter((line) => line.category === category);

              return (
                <div key={category} className="category-box">
                  <h3>{category}</h3>

                  {subcategories.length > 1 && (
                    <select
                      className="item-select"
                      value={selectedSubcategory}
                      onChange={(e) => {
                        const nextSubcategory = e.target.value;
                        const nextItems =
                          subcategories.find((s) => s.name === nextSubcategory)?.items || [];
                        const nextItem = nextItems[0] || "";

                        setSelectedSubcategoryByCategory((prev) => ({
                          ...prev,
                          [category]: nextSubcategory,
                        }));
                        setSelectedItemByCategoryAndSubcategory((prev) => ({
                          ...prev,
                          [makeCategorySubKey(category, nextSubcategory)]: nextItem,
                        }));
                      }}
                      disabled={selectionConfirmed}
                    >
                      {subcategories.map((sub) => (
                        <option key={sub.name} value={sub.name}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    className="item-select"
                    value={selectedItem}
                    onChange={(e) =>
                      setSelectedItemByCategoryAndSubcategory((prev) => ({
                        ...prev,
                        [itemKey]: e.target.value,
                      }))
                    }
                    disabled={selectionConfirmed}
                  >
                    {items.map((itemName) => (
                      <option key={itemName} value={itemName}>
                        {itemName}
                      </option>
                    ))}
                  </select>
                  <button
                    className="add-item-btn"
                    type="button"
                    onClick={() => addProductLine(category, selectedSubcategory, selectedItem)}
                    disabled={selectionConfirmed || !selectedItem}
                  >
                    Add Item
                  </button>

                  <div className="category-selected-list">
                    {linesForCategory.length === 0 ? (
                      <p className="empty-lines">No selected items in this category yet.</p>
                    ) : (
                      <div className="line-list">
                        {Object.values(groupLinesByProduct(linesForCategory)).map((group) => (
                          <div key={`${group.subcategory}-${group.item}`} className="item-group-block">
                            <div className="line-item-header">
                              {group.subcategory && group.subcategory !== "General"
                                ? `${group.subcategory}: ${group.item}`
                                : group.item}
                            </div>
                            {group.lines.map((line) => (
                              <div
                                key={line.id}
                                className={`line-row no-item ${
                                  requiresLength(category) ? "" : "qty-only"
                                }`.trim()}
                              >
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Qty"
                                  value={line.qty}
                                  onChange={(e) => updateLine(line.id, "qty", e.target.value)}
                                  disabled={selectionConfirmed}
                                />
                                {requiresLength(category) && (
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Len"
                                    value={line.length}
                                    onChange={(e) => updateLine(line.id, "length", e.target.value)}
                                    disabled={selectionConfirmed}
                                  />
                                )}
                                <button
                                  className="remove-line-btn"
                                  onClick={() => removeLine(line.id)}
                                  disabled={selectionConfirmed}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectionConfirmed && (
            <p className="confirmed-note">
              Selections confirmed. Click "Edit selections" to make changes.
            </p>
          )}
          <div className="selection-actions">
            <button
              className="confirm-btn"
              type="button"
              onClick={confirmSelections}
              disabled={selectionConfirmed || completedSelections.length === 0}
            >
              Confirm selections
            </button>
            <button
              className="edit-btn"
              type="button"
              onClick={() => {
                setSelectionConfirmed(false);
                setConfirmedSelections([]);
              }}
              disabled={!selectionConfirmed}
            >
              Edit selections
            </button>
          </div>
        </div>

        <div className="home-actions">
          <button className="action-btn secondary-btn" onClick={handleSaveDraft}>
            Save Order Draft
          </button>
          <button className="start-btn" onClick={handleStart}>
            Go to Flashing Builder Page
          </button>
          {!embedded && (
            <button className="back-btn" onClick={() => setView("menu")}>
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
