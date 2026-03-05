import { useEffect, useMemo, useRef, useState } from "react";
import FlashingPreview from "./FlashingPreview";
import { calculateGirth } from "../utils/geometry";
import { exportOrderToPdf, exportAllOrdersToPdf } from "../utils/pdf.jsx";
import { STANDARD_FLASHING_DESIGNS } from "../data/standardFlashings";
import "../styles/FlashingBuilder.css";

const SAVED_ORDERS_STORAGE_KEY = "roofing-app.saved-orders.v1";
const CUSTOM_FLASHING_STORAGE_KEY = "roofing-app.custom-flashings.v1";

const DRAW_WIDTH = 760;
const DRAW_HEIGHT = 320;
const GRID_SIZE = 20;

function copyFolds(folds) {
  return folds.map((fold) => ({ ...fold }));
}

function copyOrderItems(orderItems) {
  return orderItems.map((item) => ({ ...item }));
}

function pointsToFolds(points) {
  const folds = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const length = Math.round(Math.hypot(dx, dy));
    if (length <= 0) {
      continue;
    }
    const angle = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
    folds.push({ length, angle: Math.round(angle) });
  }
  return folds;
}

export default function FlashingBuilder({
  orderInfo,
  savedOrders: externalSavedOrders,
  onSavedOrdersChange,
  standardDesigns,
}) {
  const drawSurfaceRef = useRef(null);

  const [folds, setFolds] = useState([]);
  const [drawPoints, setDrawPoints] = useState([]);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [drawMode, setDrawMode] = useState(true);

  const [orderItems, setOrderItems] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");

  const baseDesigns =
    Array.isArray(standardDesigns) && standardDesigns.length > 0
      ? standardDesigns
      : STANDARD_FLASHING_DESIGNS;
  const [selectedDesignId, setSelectedDesignId] = useState(baseDesigns[0]?.id || "");
  const [customPresetName, setCustomPresetName] = useState("");
  const [customDesigns, setCustomDesigns] = useState(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FLASHING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn("Unable to read custom flashing designs", error);
      return [];
    }
  });

  const [specForm, setSpecForm] = useState({
    qty: 1,
    length: "",
    finish: "",
    ref: "",
  });

  const [localSavedOrders, setLocalSavedOrders] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_ORDERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn("Unable to read saved orders from localStorage", error);
      return [];
    }
  });
  const savedOrders = externalSavedOrders ?? localSavedOrders;
  const setSavedOrders = onSavedOrdersChange || setLocalSavedOrders;

  const allDesigns = useMemo(() => [...baseDesigns, ...customDesigns], [baseDesigns, customDesigns]);
  const resolvedSelectedDesignId = allDesigns.some((item) => item.id === selectedDesignId)
    ? selectedDesignId
    : allDesigns[0]?.id || "";
  const selectedDesign = allDesigns.find((item) => item.id === resolvedSelectedDesignId);
  const isSelectedCustomDesign = selectedDesign?.id?.startsWith("custom-");

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_ORDERS_STORAGE_KEY, JSON.stringify(savedOrders));
    } catch (error) {
      console.warn("Unable to write saved orders to localStorage", error);
    }
  }, [savedOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_FLASHING_STORAGE_KEY, JSON.stringify(customDesigns));
    } catch (error) {
      console.warn("Unable to write custom flashing designs", error);
    }
  }, [customDesigns]);

  const handleDrawAreaClick = (e) => {
    if (!drawMode || profileConfirmed) {
      return;
    }

    const rect = drawSurfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const normalizedX = (rawX / rect.width) * DRAW_WIDTH;
    const normalizedY = (rawY / rect.height) * DRAW_HEIGHT;
    const x = Math.max(
      0,
      Math.min(DRAW_WIDTH, Math.round(normalizedX / GRID_SIZE) * GRID_SIZE)
    );
    const y = Math.max(
      0,
      Math.min(DRAW_HEIGHT, Math.round(normalizedY / GRID_SIZE) * GRID_SIZE)
    );

    setDrawPoints((prev) => [...prev, { x, y }]);
    setConfirmed(false);
  };

  const undoPoint = () => {
    if (profileConfirmed) {
      return;
    }
    setDrawPoints((prev) => prev.slice(0, -1));
  };

  const clearPoints = () => {
    setDrawPoints([]);
    setFolds([]);
    setProfileConfirmed(false);
    setConfirmed(false);
  };

  const completeProfile = () => {
    if (drawPoints.length < 2 && folds.length === 0) {
      alert("Add at least two points in the drawing area.");
      return;
    }

    if (drawPoints.length >= 2) {
      const nextFolds = pointsToFolds(drawPoints);
      if (nextFolds.length === 0) {
        alert("Could not build segments from points.");
        return;
      }
      setFolds(nextFolds);
    }

    setProfileConfirmed(true);
  };

  const updateFold = (index, field, value) => {
    const updated = [...folds];
    updated[index][field] = value === "" ? "" : Number(value);
    setFolds(updated);
    setConfirmed(false);
  };

  const addFold = () => {
    if (!profileConfirmed) {
      return;
    }
    setFolds([...folds, { length: 50, angle: 0 }]);
    setConfirmed(false);
  };

  const removeFold = (index) => {
    if (!profileConfirmed) {
      return;
    }
    setFolds(folds.filter((_, i) => i !== index));
    setConfirmed(false);
  };

  const applyStandardDesign = () => {
    const design = allDesigns.find((item) => item.id === resolvedSelectedDesignId);
    if (!design) {
      return;
    }
    setFolds(copyFolds(design.folds));
    setDrawPoints([]);
    setProfileConfirmed(true);
    setConfirmed(false);
  };

  const addCustomPreset = () => {
    const name = customPresetName.trim();
    if (!name) {
      alert("Enter a preset name first.");
      return;
    }
    if (folds.length === 0) {
      alert("Create or load a profile before saving a custom preset.");
      return;
    }
    const newPreset = {
      id: `custom-${Date.now()}`,
      name,
      folds: copyFolds(folds),
    };
    setCustomDesigns((prev) => [...prev, newPreset]);
    setSelectedDesignId(newPreset.id);
    setCustomPresetName(newPreset.name);
  };

  const updateCustomPreset = () => {
    if (!isSelectedCustomDesign) {
      return;
    }
    const name = customPresetName.trim();
    if (!name) {
      alert("Preset name cannot be empty.");
      return;
    }
    setCustomDesigns((prev) =>
      prev.map((item) =>
        item.id === resolvedSelectedDesignId ? { ...item, name, folds: copyFolds(folds) } : item
      )
    );
  };

  const deleteCustomPreset = () => {
    if (!isSelectedCustomDesign) {
      return;
    }
    const next = customDesigns.filter((item) => item.id !== resolvedSelectedDesignId);
    setCustomDesigns(next);
    setSelectedDesignId(baseDesigns[0]?.id || "");
    setCustomPresetName("");
  };

  const addLengthToDrawing = () => {
    const qty = Number(specForm.qty) || 0;
    const length = Number(specForm.length) || 0;
    if (qty <= 0 || length <= 0) {
      alert("Quantity and length are required.");
      return;
    }
    setOrderItems((prev) => [
      ...prev,
      { qty, length, ref: specForm.ref || "", finish: specForm.finish || "" },
    ]);
    setSpecForm((prev) => ({ ...prev, length: "", qty: 1, ref: "", finish: "" }));
    setConfirmed(false);
  };

  const removeOrderItem = (index) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
    setConfirmed(false);
  };

  const confirmOrder = () => {
    if (!profileConfirmed || folds.length === 0) {
      alert("Complete the profile first.");
      return;
    }
    if (orderItems.length === 0) {
      alert("Add at least one quantity/length line.");
      return;
    }
    setConfirmed(true);
    setSavedOrders((prev) => [
      ...prev,
      {
        folds: copyFolds(folds),
        orderItems: copyOrderItems(orderItems),
        orderInfo: { ...orderInfo, notes: overallNotes },
        timestamp: Date.now(),
      },
    ]);
  };

  const resetDrawing = () => {
    setFolds([]);
    setDrawPoints([]);
    setOrderItems([]);
    setSpecForm({ qty: 1, length: "", finish: "", ref: "" });
    setOverallNotes("");
    setProfileConfirmed(false);
    setConfirmed(false);
  };

  const totalMaterialMm = orderItems.reduce((sum, item) => {
    const qty = Number(item.qty) || 0;
    const length = Number(item.length) || 0;
    return sum + qty * length;
  }, 0);
  const foldCount = Math.max(0, folds.length - 1);
  const drawPolyline = drawPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flashing-builder-page">
      <div className="flashing-builder-layout">
        <section className="fb-panel">
          <div className="fb-section">
            <div className="fb-toolbar">
              <button
                className={`fb-btn ${drawMode ? "fb-btn-primary" : "fb-btn-muted"}`}
                onClick={() => setDrawMode(true)}
              >
                Draw
              </button>
              <button
                className={`fb-btn ${!drawMode ? "fb-btn-primary" : "fb-btn-muted"}`}
                onClick={() => setDrawMode(false)}
              >
                Pan
              </button>
              <button className="fb-btn fb-btn-muted" onClick={undoPoint} disabled={profileConfirmed || drawPoints.length === 0}>
                Undo Point
              </button>
              <button className="fb-btn fb-btn-danger" onClick={clearPoints} disabled={profileConfirmed || drawPoints.length === 0}>
                Clear
              </button>
              <button className="fb-btn fb-btn-warning" onClick={completeProfile}>
                Complete Profile
              </button>
            </div>

            <div
              ref={drawSurfaceRef}
              className={`fb-draw-surface ${drawMode && !profileConfirmed ? "draw-enabled" : ""}`}
              onClick={handleDrawAreaClick}
            >
              <svg viewBox={`0 0 ${DRAW_WIDTH} ${DRAW_HEIGHT}`} className="fb-draw-svg">
                <defs>
                  <pattern id="smallGrid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                    <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={DRAW_WIDTH} height={DRAW_HEIGHT} fill="url(#smallGrid)" />
                {drawPoints.length > 1 && (
                  <polyline points={drawPolyline} fill="none" stroke="#0f172a" strokeWidth="3" />
                )}
                {drawPoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#ef4444" />
                ))}
              </svg>
            </div>

            <div className="fb-preview-foot">
              <div>Girth: {calculateGirth(folds)} mm</div>
              <div>Folds: {foldCount}F</div>
              <div>{profileConfirmed ? "Profile confirmed" : "Click points, then complete profile"}</div>
            </div>

            <div className="fb-preview-wrap">
              <FlashingPreview folds={folds} />
            </div>

            <div className="fb-design-row">
              <label htmlFor="standard-design">Standard design catalog</label>
              <select
                id="standard-design"
                value={resolvedSelectedDesignId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedDesignId(nextId);
                  const nextDesign = allDesigns.find((item) => item.id === nextId);
                  setCustomPresetName(nextDesign?.id?.startsWith("custom-") ? nextDesign.name : "");
                }}
              >
                {allDesigns.map((design) => (
                  <option key={design.id} value={design.id}>
                    {design.name}
                  </option>
                ))}
              </select>
              <button className="fb-btn fb-btn-muted" onClick={applyStandardDesign}>
                Load
              </button>
            </div>

            <div className="fb-custom-row">
              <input
                type="text"
                value={customPresetName}
                onChange={(e) => setCustomPresetName(e.target.value)}
                placeholder="Catalog design name"
              />
              <button className="fb-btn fb-btn-primary" onClick={addCustomPreset}>
                Add
              </button>
              <button
                className="fb-btn fb-btn-muted"
                onClick={updateCustomPreset}
                disabled={!isSelectedCustomDesign}
              >
                Update
              </button>
              <button
                className="fb-btn fb-btn-danger"
                onClick={deleteCustomPreset}
                disabled={!isSelectedCustomDesign}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="fb-section">
            <h2>Adjust Segments</h2>
            {!profileConfirmed && (
              <p className="fb-info">Complete profile to enable manual segment adjustments.</p>
            )}
            <div className="fb-grid-head fb-grid-segments">
              <span>Segment</span>
              <span>Length (mm)</span>
              <span>Direction (deg)</span>
              <span />
            </div>
            {folds.map((fold, index) => (
              <div key={index} className="fb-grid-row fb-grid-segments">
                <span className="fb-seg-label">Segment {index + 1}</span>
                <input
                  type="number"
                  value={fold.length}
                  onChange={(e) => updateFold(index, "length", e.target.value)}
                  placeholder="Length"
                  disabled={!profileConfirmed}
                />
                <input
                  type="number"
                  value={fold.angle}
                  onChange={(e) => updateFold(index, "angle", e.target.value)}
                  placeholder="Direction"
                  disabled={!profileConfirmed}
                />
                <button
                  className="fb-btn fb-btn-danger"
                  onClick={() => removeFold(index)}
                  disabled={!profileConfirmed}
                >
                  Delete
                </button>
              </div>
            ))}
            <button className="fb-btn fb-btn-primary" onClick={addFold} disabled={!profileConfirmed}>
              Add Segment
            </button>
          </div>
        </section>

        <aside className="fb-spec-panel">
          <div className="fb-section">
            <h2>Add Specifications</h2>
            <div className="fb-spec-grid">
              <div>
                <label>Quantity</label>
                <input
                  type="number"
                  value={specForm.qty}
                  onChange={(e) => setSpecForm((prev) => ({ ...prev, qty: e.target.value }))}
                />
              </div>
              <div>
                <label>Length (mm)</label>
                <input
                  type="number"
                  value={specForm.length}
                  placeholder="e.g. 2400"
                  onChange={(e) => setSpecForm((prev) => ({ ...prev, length: e.target.value }))}
                />
              </div>
            </div>
            <div className="fb-spec-field">
              <label>Color / Finish</label>
              <input
                type="text"
                value={specForm.finish}
                placeholder="e.g. Monument"
                onChange={(e) => setSpecForm((prev) => ({ ...prev, finish: e.target.value }))}
              />
            </div>

            <div className="fb-spec-field">
              <label>REF</label>
              <input
                type="text"
                value={specForm.ref}
                placeholder="Reference"
                onChange={(e) => setSpecForm((prev) => ({ ...prev, ref: e.target.value }))}
              />
            </div>
            <button className="fb-btn fb-btn-neutral" onClick={addLengthToDrawing}>
              Add Length to this Drawing
            </button>

            <div className="fb-spec-field">
              <label>Overall Notes</label>
              <textarea
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="Special instructions..."
              />
            </div>

            <div className="fb-items-list">
              {orderItems.map((item, idx) => (
                <div key={idx}>
                  <span>Qty {item.qty}</span>
                  <span>{item.length} mm</span>
                  <span>{item.ref || "-"}</span>
                  <span>{item.finish || item.label || "-"}</span>
                  <button className="fb-btn fb-btn-danger" onClick={() => removeOrderItem(idx)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="fb-total-line">
              Total material: {totalMaterialMm} mm ({(totalMaterialMm / 1000).toFixed(2)} m)
            </div>
            <button className="fb-btn fb-btn-confirm" onClick={confirmOrder} disabled={orderItems.length === 0}>
              Confirm Flashing Drawing & Specs
            </button>

            {confirmed && (
              <div className="fb-btn-group">
                <button className="fb-btn fb-btn-muted" onClick={resetDrawing}>
                  New Drawing
                </button>
                <button
                  className="fb-btn fb-btn-primary"
                  onClick={async () => {
                    const latest = savedOrders[savedOrders.length - 1];
                    if (!latest) {
                      return;
                    }
                    await exportOrderToPdf(latest);
                  }}
                >
                  Export Latest PDF
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {savedOrders.length > 0 && (
        <section className="fb-section fb-saved-section">
          <div className="fb-header">
            <h2>Saved Drawings</h2>
            <div className="fb-btn-group">
              <button
                className="fb-btn fb-btn-primary"
                onClick={async () => {
                  try {
                    await exportAllOrdersToPdf(savedOrders);
                  } catch (err) {
                    console.error("Export failed", err);
                    alert("Export failed: " + err.message);
                  }
                }}
              >
                Export All PDF
              </button>
              <button className="fb-btn fb-btn-muted" onClick={() => setSavedOrders([])}>
                Clear
              </button>
            </div>
          </div>

          <ul className="fb-saved-list">
            {savedOrders.map((order, idx) => (
              <li key={idx}>
                <div>
                  {calculateGirth(order.folds)} mm | {order.orderItems.length} items
                </div>
                <button
                  className="fb-btn fb-btn-muted"
                  onClick={async () => {
                    try {
                      await exportOrderToPdf(order);
                    } catch (err) {
                      console.error("Export failed", err);
                      alert("Export failed: " + err.message);
                    }
                  }}
                >
                  Export PDF
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
