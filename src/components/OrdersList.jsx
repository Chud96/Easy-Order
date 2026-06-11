import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { ORDER_STATUS_LABELS } from "../utils/statuses";
import "../styles/JobsList.css";

const ORDER_STATUS_ORDER = ["draft", "sent", "delivered", "in_progress", "complete"];

function generateStandaloneOrderNumber(existingOrders) {
  const nums = existingOrders
    .filter((o) => !o.job_id)
    .map((o) => {
      const m = o.order_number?.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `ORD-${String(next).padStart(3, "0")}`;
}

const EMPTY_FORM = {
  order_number: "",
  builder: "",
  site_address: "",
  supplier_id: "",
  delivery_date: "",
  notes: "",
};

export default function OrdersList({ onSelectOrder, suppliers, userId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, supplier_id, status, delivery_date, job_id, builder, site_address, created_at, jobs(builder, site_address)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) console.warn("Could not load orders", error);
      setOrders(data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [userId]);

  const openNewForm = () => {
    setForm({ ...EMPTY_FORM, order_number: generateStandaloneOrderNumber(orders) });
    setShowForm(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.builder.trim() && !form.site_address.trim()) {
      alert("Enter a builder/customer or site address.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("orders")
      .insert([{
        owner_id: userId,
        job_id: null,
        order_number: form.order_number.trim(),
        builder: form.builder.trim(),
        site_address: form.site_address.trim(),
        supplier_id: form.supplier_id || null,
        delivery_date: form.delivery_date || null,
        notes: form.notes.trim(),
        status: "draft",
      }])
      .select("id")
      .single();
    setSaving(false);
    if (error) { alert(`Could not create order: ${error.message}`); return; }
    setShowForm(false);
    setForm(EMPTY_FORM);
    onSelectOrder(data.id);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this order and all its items? This cannot be undone.")) return;
    const { error } = await supabase.from("orders").delete().eq("id", id).eq("owner_id", userId);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";

  const filteredOrders = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    const builder = o.jobs?.builder || o.builder || "";
    const site = o.jobs?.site_address || o.site_address || "";
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.order_number?.toLowerCase().includes(q) ||
      builder.toLowerCase().includes(q) ||
      site.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="jobs-list-page">
      <div className="jobs-list-header">
        <h1 className="jobs-list-title">Orders</h1>
        <button className="btn btn-primary" onClick={openNewForm}>+ New Standalone Order</button>
      </div>

      <div className="jobs-list-controls">
        <input
          className="jobs-search"
          placeholder="Search orders, builders, addresses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="jobs-filter-tabs">
          <button className={filterStatus === "all" ? "active" : ""} onClick={() => setFilterStatus("all")}>All</button>
          {ORDER_STATUS_ORDER.map((s) => (
            <button key={s} className={filterStatus === s ? "active" : ""} onClick={() => setFilterStatus(s)}>
              {ORDER_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jobs-loading">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="jobs-empty">
          {orders.length === 0 ? (
            <>
              <p>No orders yet.</p>
              <button className="btn btn-primary" onClick={openNewForm}>Create a standalone order</button>
            </>
          ) : (
            <p>No orders match your filter.</p>
          )}
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Builder / Customer</th>
                <th>Site Address</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Delivery</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.id} onClick={() => onSelectOrder(o.id)} className="jobs-table-row">
                  <td className="job-number-cell">{o.order_number || "—"}</td>
                  <td className="job-builder-cell">{o.jobs?.builder || o.builder || "—"}</td>
                  <td className="job-address-cell">{o.jobs?.site_address || o.site_address || "—"}</td>
                  <td>{getSupplierName(o.supplier_id)}</td>
                  <td>
                    <span className={`status-badge ${o.status}`}>
                      {ORDER_STATUS_LABELS[o.status] || o.status}
                    </span>
                  </td>
                  <td className="job-date-cell">{o.delivery_date || "—"}</td>
                  <td className="job-date-cell">{o.job_id ? "Job" : "Standalone"}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={(e) => handleDelete(e, o.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Standalone Order</h2>
            <form onSubmit={handleCreate} className="job-form">
              <div className="form-row">
                <label>Order Number</label>
                <input name="order_number" value={form.order_number} onChange={handleFormChange} placeholder="ORD-001" />
              </div>
              <div className="form-row">
                <label>Builder / Customer</label>
                <input name="builder" value={form.builder} onChange={handleFormChange} placeholder="Builder or customer name" />
              </div>
              <div className="form-row">
                <label>Site Address</label>
                <input name="site_address" value={form.site_address} onChange={handleFormChange} placeholder="123 Example St, Suburb" />
              </div>
              <div className="form-row">
                <label>Supplier</label>
                <select name="supplier_id" value={form.supplier_id} onChange={handleFormChange}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Delivery Date</label>
                <input type="date" name="delivery_date" value={form.delivery_date} onChange={handleFormChange} />
              </div>
              <div className="form-row">
                <label>Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={3} placeholder="Optional notes..." />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creating..." : "Create & Edit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
