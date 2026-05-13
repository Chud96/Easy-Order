import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import "../styles/JobsList.css";

const STATUS_ORDER = ["quoted", "ordered", "scheduled", "in_progress", "complete", "invoiced"];
const STATUS_LABELS = {
  quoted: "Quoted",
  ordered: "Ordered",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  invoiced: "Invoiced",
};

function generateJobNumber(existingJobs) {
  const year = new Date().getFullYear();
  const nums = existingJobs
    .map((j) => {
      const m = j.job_number?.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter(Boolean);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `J${year}-${String(next).padStart(3, "0")}`;
}

const EMPTY_FORM = {
  job_number: "",
  builder: "",
  site_address: "",
  total_amount: "",
  notes: "",
  status: "quoted",
};

export default function JobsList({ onSelectJob, userId }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("jobs")
      .select("id, job_number, builder, site_address, total_amount, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn("Could not load jobs", error);
        setJobs(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  const openNewForm = () => {
    setForm({ ...EMPTY_FORM, job_number: generateJobNumber(jobs) });
    setShowForm(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.builder.trim() || !form.site_address.trim()) {
      alert("Builder and site address are required.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("jobs")
      .insert([{
        owner_id: userId,
        job_number: form.job_number.trim(),
        builder: form.builder.trim(),
        site_address: form.site_address.trim(),
        total_amount: parseFloat(form.total_amount) || 0,
        status: form.status,
        notes: form.notes.trim(),
      }])
      .select("id, job_number, builder, site_address, total_amount, status, created_at")
      .single();
    setSaving(false);
    if (error) { alert(`Could not create job: ${error.message}`); return; }
    setJobs((prev) => [data, ...prev]);
    setShowForm(false);
    setForm(EMPTY_FORM);
    onSelectJob(data.id);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this job and all its orders, POs, contracts and invoices? This cannot be undone.")) return;
    const { error } = await supabase.from("jobs").delete().eq("id", id).eq("owner_id", userId);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const filteredJobs = jobs.filter((j) => {
    const matchStatus = filterStatus === "all" || j.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      j.job_number?.toLowerCase().includes(q) ||
      j.builder?.toLowerCase().includes(q) ||
      j.site_address?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const fmt = (n) =>
    n != null
      ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n)
      : "—";

  return (
    <div className="jobs-list-page">
      <div className="jobs-list-header">
        <h1 className="jobs-list-title">Jobs</h1>
        <button className="btn btn-primary" onClick={openNewForm}>+ New Job</button>
      </div>

      <div className="jobs-list-controls">
        <input
          className="jobs-search"
          placeholder="Search jobs, builders, addresses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="jobs-filter-tabs">
          <button
            className={filterStatus === "all" ? "active" : ""}
            onClick={() => setFilterStatus("all")}
          >
            All
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={filterStatus === s ? "active" : ""}
              onClick={() => setFilterStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jobs-loading">Loading jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="jobs-empty">
          {jobs.length === 0 ? (
            <>
              <p>No jobs yet.</p>
              <button className="btn btn-primary" onClick={openNewForm}>Create your first job</button>
            </>
          ) : (
            <p>No jobs match your filter.</p>
          )}
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Job #</th>
                <th>Builder</th>
                <th>Site Address</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id} onClick={() => onSelectJob(job.id)} className="jobs-table-row">
                  <td className="job-number-cell">{job.job_number || "—"}</td>
                  <td className="job-builder-cell">{job.builder}</td>
                  <td className="job-address-cell">{job.site_address}</td>
                  <td>
                    <span className={`status-badge ${job.status}`}>
                      {STATUS_LABELS[job.status] || job.status}
                    </span>
                  </td>
                  <td className="job-amount-cell">{fmt(job.total_amount)}</td>
                  <td className="job-date-cell">
                    {new Date(job.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={(e) => handleDelete(e, job.id)}
                    >
                      Delete
                    </button>
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
            <h2 className="modal-title">New Job</h2>
            <form onSubmit={handleCreate} className="job-form">
              <div className="form-row">
                <label>Job Number</label>
                <input name="job_number" value={form.job_number} onChange={handleFormChange} placeholder="J2025-001" />
              </div>
              <div className="form-row">
                <label>Builder / Customer *</label>
                <input name="builder" value={form.builder} onChange={handleFormChange} required placeholder="Builder name" />
              </div>
              <div className="form-row">
                <label>Site Address *</label>
                <input name="site_address" value={form.site_address} onChange={handleFormChange} required placeholder="123 Example St, Suburb" />
              </div>
              <div className="form-row">
                <label>Total Job Amount ($)</label>
                <input
                  name="total_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.total_amount}
                  onChange={handleFormChange}
                  placeholder="0.00"
                />
              </div>
              <div className="form-row">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleFormChange}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={3} placeholder="Optional notes..." />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creating..." : "Create Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
