import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import Home from "./Home";
import FlashingBuilder from "./FlashingBuilder";
import FlashingPreview from "./FlashingPreview";
import { calculateGirth } from "../utils/geometry";
import { exportCombinedOrderToPdf } from "../utils/orderFormPdf";
import "../styles/OrderDetail.css";

const ORDER_STATUS_LABELS = { draft: "Draft", sent: "Sent", delivered: "Delivered" };

const fmt = (n) =>
  n != null
    ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n)
    : "—";

function groupByCategory(items) {
  return items.reduce((acc, row) => {
    const key = `${row.category}::${row.subcategory || "General"}`;
    if (!acc[key]) acc[key] = { category: row.category, subcategory: row.subcategory || "General", items: [] };
    acc[key].items.push(row);
    return acc;
  }, {});
}

export default function OrderDetail({ orderId, jobId, onBack, suppliers, standardFlashingDesigns }) {
  const [order, setOrder] = useState(null);
  const [job, setJob] = useState(null);
  const [standardSelections, setStandardSelections] = useState([]);
  const [flashingOrders, setFlashingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("items");

  const [orderForm, setOrderForm] = useState({
    supplier_id: "",
    roof_colour: "",
    fascia_colour: "",
    gutter_colour: "",
    delivery_date: "",
    notes: "",
    status: "draft",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [orderRes, jobRes, itemsRes, flashingsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("jobs").select("job_number, builder, site_address").eq("id", jobId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("sort_order"),
      supabase.from("flashing_items").select("*").eq("order_id", orderId).order("sort_order"),
    ]);

    if (orderRes.data) {
      const o = orderRes.data;
      setOrder(o);
      setOrderForm({
        supplier_id: o.supplier_id || "",
        roof_colour: o.roof_colour || "",
        fascia_colour: o.fascia_colour || "",
        gutter_colour: o.gutter_colour || "",
        delivery_date: o.delivery_date || "",
        notes: o.notes || "",
        status: o.status || "draft",
      });
    }

    setJob(jobRes.data || null);

    setStandardSelections(
      (itemsRes.data || []).map((row) => ({
        id: row.id,
        category: row.category,
        subcategory: row.subcategory,
        item: row.item,
        qty: row.qty,
        length: row.length,
      }))
    );

    setFlashingOrders(
      (flashingsRes.data || []).map((row) => ({
        id: row.id,
        folds: Array.isArray(row.folds_json) ? row.folds_json : [],
        orderItems: Array.isArray(row.order_items_json) ? row.order_items_json : [],
      }))
    );

    setLoading(false);
  }, [orderId, jobId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOrderFormChange = (e) => {
    const { name, value } = e.target;
    setOrderForm((p) => ({ ...p, [name]: value }));
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const { data: updatedOrder, error: orderError } = await supabase
        .from("orders")
        .update({
          supplier_id: orderForm.supplier_id || null,
          roof_colour: orderForm.roof_colour,
          fascia_colour: orderForm.fascia_colour,
          gutter_colour: orderForm.gutter_colour,
          delivery_date: orderForm.delivery_date || null,
          notes: orderForm.notes,
          status: orderForm.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select("*")
        .single();

      if (orderError) throw orderError;
      setOrder(updatedOrder);

      await supabase.from("order_items").delete().eq("order_id", orderId);
      if (standardSelections.length > 0) {
        const rows = standardSelections.map((sel, i) => ({
          order_id: orderId,
          category: sel.category,
          subcategory: sel.subcategory || "General",
          item: sel.item,
          qty: parseFloat(sel.qty) || 0,
          length: sel.length !== "" && sel.length != null ? parseFloat(sel.length) : null,
          sort_order: i,
        }));
        const { error: itemsError } = await supabase.from("order_items").insert(rows);
        if (itemsError) throw itemsError;
      }

      await supabase.from("flashing_items").delete().eq("order_id", orderId);
      if (flashingOrders.length > 0) {
        const rows = flashingOrders.map((fo, i) => ({
          order_id: orderId,
          folds_json: fo.folds || [],
          order_items_json: fo.orderItems || [],
          sort_order: i,
        }));
        const { error: flashError } = await supabase.from("flashing_items").insert(rows);
        if (flashError) throw flashError;
      }

      alert("Order saved.");
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    const supplier = suppliers.find((s) => s.id === orderForm.supplier_id);
    await exportCombinedOrderToPdf({
      orderInfo: {
        builder: job?.builder || "",
        address: job?.site_address || "",
        orderNumber: order?.order_number || "",
        deliveryDate: order?.delivery_date || "",
        roofColour: order?.roof_colour || "",
        fasciaColour: order?.fascia_colour || "",
        gutterColour: order?.gutter_colour || "",
        notes: order?.notes || "",
      },
      supplier,
      standardSelections,
      flashingOrders,
      createdAt: Date.now(),
    });
  };

  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";

  if (loading) return <div className="order-detail-loading">Loading order...</div>;
  if (!order) return <div className="order-detail-loading">Order not found.</div>;

  const TABS = [
    { key: "items", label: "Standard Items" },
    { key: "flashings", label: "Custom Flashings" },
    { key: "summary", label: "Summary" },
  ];

  const groupedSelections = Object.values(groupByCategory(standardSelections));

  return (
    <div className="order-detail-page">
      <div className="order-detail-breadcrumb">
        <button className="breadcrumb-back" onClick={onBack}>← {job?.job_number || "Job"}</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{order.order_number || "Order"}</span>
      </div>

      <div className="order-detail-head">
        <div>
          <h1 className="order-detail-title">{order.order_number || "Order"}</h1>
          <p className="order-detail-subtitle">{job?.builder} — {job?.site_address}</p>
        </div>
        <div className="order-detail-head-meta">
          <span className={`status-badge ${order.status}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
          {order.supplier_id && <span className="order-supplier-chip">{getSupplierName(order.supplier_id)}</span>}
        </div>
      </div>

      <div className="order-detail-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="order-detail-body">
        {activeTab === "items" && (
          <Home
            embedded={true}
            standardSelections={standardSelections}
            onStandardSelectionsChange={setStandardSelections}
          />
        )}

        {activeTab === "flashings" && (
          <FlashingBuilder
            orderInfo={{
              builder: job?.builder || "",
              address: job?.site_address || "",
              orderNumber: order.order_number || "",
              deliveryDate: order.delivery_date || "",
              roofColour: order.roof_colour || "",
              fasciaColour: order.fascia_colour || "",
              gutterColour: order.gutter_colour || "",
            }}
            savedOrders={flashingOrders}
            onSavedOrdersChange={setFlashingOrders}
            standardDesigns={standardFlashingDesigns}
          />
        )}

        {activeTab === "summary" && (
          <div className="summary-tab">
            <section className="summary-section">
              <h3 className="summary-section-title">Order Details</h3>
              <div className="summary-form-grid">
                <div className="form-row">
                  <label>Supplier</label>
                  <select name="supplier_id" value={orderForm.supplier_id} onChange={handleOrderFormChange}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Delivery Date</label>
                  <input type="date" name="delivery_date" value={orderForm.delivery_date} onChange={handleOrderFormChange} />
                </div>
                <div className="form-row">
                  <label>Roof Colour</label>
                  <input name="roof_colour" value={orderForm.roof_colour} onChange={handleOrderFormChange} placeholder="e.g. Ironstone" />
                </div>
                <div className="form-row">
                  <label>Fascia Colour</label>
                  <input name="fascia_colour" value={orderForm.fascia_colour} onChange={handleOrderFormChange} />
                </div>
                <div className="form-row">
                  <label>Gutter Colour</label>
                  <input name="gutter_colour" value={orderForm.gutter_colour} onChange={handleOrderFormChange} />
                </div>
                <div className="form-row">
                  <label>Status</label>
                  <select name="status" value={orderForm.status} onChange={handleOrderFormChange}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
                <div className="form-row form-row-full">
                  <label>Notes</label>
                  <textarea name="notes" rows={3} value={orderForm.notes} onChange={handleOrderFormChange} />
                </div>
              </div>
            </section>

            {standardSelections.length > 0 && (
              <section className="summary-section">
                <h3 className="summary-section-title">Standard Items ({standardSelections.length})</h3>
                <div className="summary-items-table-wrap">
                  <table className="summary-items-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Sub</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Length</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedSelections.map((group) =>
                        group.items.map((item, i) => (
                          <tr key={i}>
                            <td>{i === 0 ? group.category : ""}</td>
                            <td>{i === 0 ? group.subcategory : ""}</td>
                            <td>{item.item}</td>
                            <td>{item.qty}</td>
                            <td>{item.length != null && item.length !== "" ? `${item.length}mm` : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {flashingOrders.length > 0 && (
              <section className="summary-section">
                <h3 className="summary-section-title">Custom Flashings ({flashingOrders.length})</h3>
                <div className="flashings-summary-list">
                  {flashingOrders.map((fo, idx) => (
                    <div key={idx} className="flashing-summary-card">
                      <div className="flashing-summary-preview">
                        <FlashingPreview folds={fo.folds || []} width={200} height={80} />
                      </div>
                      <div className="flashing-summary-info">
                        <div className="flashing-summary-meta">
                          <span>Flashing {idx + 1}</span>
                          <span>Girth: {calculateGirth(fo.folds || [])}mm</span>
                          <span>{fo.orderItems?.length || 0} line(s)</span>
                        </div>
                        {fo.orderItems?.map((item, ii) => (
                          <div key={ii} className="flashing-summary-line">
                            Qty {item.qty} × {item.length}mm — {item.ref || "No ref"} — {item.finish || ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="summary-actions">
              <button className="btn btn-secondary" onClick={handleExportPdf}>Export PDF</button>
              <button className="btn btn-primary" onClick={handleSaveOrder} disabled={saving}>
                {saving ? "Saving..." : "Save Order"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
