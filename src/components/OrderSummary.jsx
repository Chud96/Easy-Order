import { useMemo } from "react";
import FlashingPreview from "./FlashingPreview";
import { calculateGirth } from "../utils/geometry";
import { exportCombinedOrderToPdf, saveOrderFormRecord } from "../utils/orderFormPdf";
import "../styles/OrderSummary.css";

function groupStandardSelections(rows) {
  return rows.reduce((acc, row) => {
    const category = row.category || "Other";
    const subcategory = row.subcategory || "General";
    const key = `${category}::${subcategory}`;
    if (!acc[key]) {
      acc[key] = { category, subcategory, items: [] };
    }
    acc[key].items.push(row);
    return acc;
  }, {});
}

export default function OrderSummary({
  orderInfo,
  onChange,
  suppliers,
  standardSelections = [],
  flashingOrders = [],
  savedOrderSessions = [],
  onSaveAndExitOrder,
  onResumeSavedOrder,
  onDeleteSavedOrder,
}) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onChange((prev) => ({ ...prev, [name]: value }));
  };

  const supplierId = orderInfo?.supplierId || suppliers[0]?.id || "";
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) || null;

  const groupedStandardSelections = useMemo(
    () => Object.values(groupStandardSelections(standardSelections)),
    [standardSelections]
  );

  const handlePrintPdf = async () => {
    const payload = {
      orderInfo,
      supplier: selectedSupplier,
      standardSelections,
      flashingOrders,
      createdAt: Date.now(),
    };
    const saved = saveOrderFormRecord(payload);
    if (!saved) {
      alert("Could not save order record locally, but PDF will still open.");
    }
    await exportCombinedOrderToPdf(payload);
  };

  const handleEmailSupplier = async () => {
    if (!selectedSupplier) {
      alert("Please select a supplier first.");
      return;
    }

    await handlePrintPdf();

    const standardLines = standardSelections.map(
      (item) =>
        `- ${item.category} | ${item.subcategory || "General"} | ${item.item} | Qty ${item.qty}${
          item.length !== "" ? ` | Len ${item.length}` : ""
        }`
    );
    const flashingLines = flashingOrders.map(
      (order, index) =>
        `- Flashing ${index + 1}: ${order.orderItems?.length || 0} lines, Girth ${calculateGirth(order.folds || [])} mm`
    );

    const subject = `Order ${orderInfo?.orderNumber || "(No Number)"} - ${orderInfo?.deliveryDate || ""}`;
    const body = [
      `Builder: ${orderInfo?.builder || ""}`,
      `Order Number: ${orderInfo?.orderNumber || ""}`,
      `Order Date: ${orderInfo?.orderDate || ""}`,
      `Delivery Date: ${orderInfo?.deliveryDate || ""}`,
      `Address: ${orderInfo?.address || ""}`,
      "",
      "Standard Items:",
      ...(standardLines.length > 0 ? standardLines : ["- None"]),
      "",
      "Custom Flashings:",
      ...(flashingLines.length > 0 ? flashingLines : ["- None"]),
      "",
      `Notes: ${orderInfo?.notes || ""}`,
      "",
      "A print-ready PDF has been opened. Attach it before sending.",
    ].join("\n");

    const mailtoUrl = `mailto:${selectedSupplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="summary-wrap">
      <div className="summary-card">
        <h2>Order Summary</h2>
        <p>Enter job details and supplier for this order.</p>

        <div className="summary-grid">
          <label>
            Builder
            <input name="builder" value={orderInfo?.builder || ""} onChange={handleChange} />
          </label>
          <label>
            Order Number
            <input name="orderNumber" value={orderInfo?.orderNumber || ""} onChange={handleChange} />
          </label>
          <label>
            Order Date
            <input type="date" name="orderDate" value={orderInfo?.orderDate || ""} onChange={handleChange} />
          </label>
          <label>
            Delivery Date
            <input
              type="date"
              name="deliveryDate"
              value={orderInfo?.deliveryDate || ""}
              onChange={handleChange}
            />
          </label>
          <label className="full">
            Address
            <input name="address" value={orderInfo?.address || ""} onChange={handleChange} />
          </label>
          <label className="full">
            Supplier
            <select name="supplierId" value={supplierId} onChange={handleChange}>
              {suppliers.length === 0 ? (
                <option value="">No suppliers configured</option>
              ) : (
                suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.email})
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Roof Colour
            <input name="roofColour" value={orderInfo?.roofColour || ""} onChange={handleChange} />
          </label>
          <label>
            Fascia Colour
            <input name="fasciaColour" value={orderInfo?.fasciaColour || ""} onChange={handleChange} />
          </label>
          <label>
            Gutter Colour
            <input name="gutterColour" value={orderInfo?.gutterColour || ""} onChange={handleChange} />
          </label>
          <label className="full">
            Notes
            <textarea name="notes" value={orderInfo?.notes || ""} onChange={handleChange} />
          </label>
        </div>

        <div className="summary-actions">
          <button className="summary-btn" onClick={handlePrintPdf}>
            Print Combined PDF
          </button>
          <button
            className="summary-btn secondary"
            onClick={handleEmailSupplier}
            disabled={!selectedSupplier}
          >
            Email Supplier
          </button>
          <button
            className="summary-btn secondary"
            onClick={onSaveAndExitOrder}
            disabled={!onSaveAndExitOrder}
          >
            Save & Exit Order
          </button>
        </div>

        <div className="summary-sections">
          <section className="summary-section">
            <h3>Saved Order Sessions</h3>
            {savedOrderSessions.length === 0 ? (
              <p>No saved sessions yet.</p>
            ) : (
              <ul className="summary-saved-list">
                {savedOrderSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      className="summary-saved-load"
                      onClick={() => onResumeSavedOrder?.(session.id)}
                    >
                      {session.orderInfo?.orderNumber || "Untitled Order"} |{" "}
                      {new Date(session.savedAt).toLocaleDateString()}
                    </button>
                    <button
                      className="summary-saved-delete"
                      onClick={() => onDeleteSavedOrder?.(session.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="summary-section">
            <h3>Standard Item Selections</h3>
            {groupedStandardSelections.length === 0 ? (
              <p>No confirmed standard selections yet.</p>
            ) : (
              <div className="summary-standard-list">
                {groupedStandardSelections.map((group) => (
                  <div key={`${group.category}-${group.subcategory}`} className="summary-standard-group">
                    <h4>
                      {group.subcategory && group.subcategory !== "General"
                        ? `${group.category} - ${group.subcategory}`
                        : group.category}
                    </h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Len</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, index) => (
                          <tr key={`${item.item}-${index}`}>
                            <td>{item.item}</td>
                            <td>{item.qty}</td>
                            <td>{item.length === "" ? "-" : item.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="summary-section">
            <h3>Custom Flashing Drawings</h3>
            {flashingOrders.length === 0 ? (
              <p>No confirmed flashing drawings yet.</p>
            ) : (
              <div className="summary-flashing-list">
                {flashingOrders.map((order, index) => (
                  <article key={`${order.timestamp || index}`} className="summary-flashing-item">
                    <div className="summary-flashing-head">
                      <strong>Flashing {index + 1}</strong>
                      <span>Girth {calculateGirth(order.folds || [])} mm</span>
                    </div>
                    <div className="summary-flashing-grid">
                      <div className="summary-drawing-wrap">
                        <FlashingPreview folds={order.folds || []} />
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th>Qty</th>
                            <th>Len</th>
                            <th>Finish</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(order.orderItems || []).map((item, itemIndex) => (
                            <tr key={itemIndex}>
                              <td>{item.qty}</td>
                              <td>{item.length}</td>
                              <td>{item.label || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
