import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../utils/format";
import { JOB_STATUS_ORDER, JOB_STATUS_LABELS } from "../utils/statuses";
import "../styles/Dashboard.css";

function toISODate(d) {
  return d.toISOString().split("T")[0];
}

// Monday of the current week (00:00).
function weekStartDate() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  now.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return now;
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Dashboard({ userId, onSelectJob, onViewChange }) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [jobsRes, invoicesRes, ordersRes, scheduleRes] = await Promise.all([
        supabase.from("jobs").select("id, job_number, builder, site_address, total_amount, status").eq("owner_id", userId),
        supabase.from("invoices").select("id, job_id, amount, status, type, due_date").eq("owner_id", userId),
        supabase
          .from("orders")
          .select("id, order_number, delivery_date, status, job_id, jobs(builder, site_address), suppliers(name)")
          .eq("owner_id", userId),
        supabase.from("schedule_entries").select("id, builder, address, info, start_date, span, category, workers, job_id").eq("owner_id", userId),
      ]);
      if (!active) return;
      setJobs(jobsRes.data || []);
      setInvoices(invoicesRes.data || []);
      setOrders(ordersRes.data || []);
      setSchedule(scheduleRes.data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [userId]);

  if (loading) {
    return <div className="dash-loading">Loading dashboard…</div>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toISODate(today);
  const weekStart = weekStartDate();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(weekEnd);

  // ── KPIs ──
  const activeJobs = jobs.filter((j) => j.status !== "invoiced" && j.status !== "complete");
  const pipelineValue = jobs
    .filter((j) => j.status !== "invoiced")
    .reduce((s, j) => s + (parseFloat(j.total_amount) || 0), 0);

  const sentInvoices = invoices.filter((i) => i.status === "sent");
  const awaitingAmount = sentInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const overdueInvoices = sentInvoices.filter((i) => i.due_date && i.due_date < todayStr);
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  // ── Jobs by status ──
  const statusCounts = JOB_STATUS_ORDER.map((s) => ({
    status: s,
    label: JOB_STATUS_LABELS[s],
    count: jobs.filter((j) => j.status === s).length,
  }));

  // ── Upcoming deliveries (today onwards) ──
  const upcomingDeliveries = orders
    .filter((o) => o.delivery_date && o.delivery_date >= todayStr && o.status !== "complete")
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 8);

  // ── This week's schedule ──
  const weekSchedule = schedule
    .filter((e) => {
      if (!e.start_date) return false;
      const startDay = new Date(e.start_date + "T00:00:00");
      const endDay = new Date(startDay);
      endDay.setDate(startDay.getDate() + Math.max(1, e.span || 1) - 1);
      return toISODate(startDay) <= weekEndStr && toISODate(endDay) >= weekStartStr;
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const jobAddress = (jobId) => jobs.find((j) => j.id === jobId)?.site_address;

  return (
    <div className="dash">
      {/* KPI cards */}
      <div className="dash-kpis">
        <div className="dash-kpi" onClick={() => onViewChange("jobs")}>
          <span className="dash-kpi-label">Active Jobs</span>
          <span className="dash-kpi-value">{activeJobs.length}</span>
          <span className="dash-kpi-sub">{jobs.length} total</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Pipeline Value</span>
          <span className="dash-kpi-value">{formatCurrency(pipelineValue, 0)}</span>
          <span className="dash-kpi-sub">excl. invoiced jobs</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Awaiting Payment</span>
          <span className="dash-kpi-value">{formatCurrency(awaitingAmount, 0)}</span>
          <span className="dash-kpi-sub">{sentInvoices.length} invoice(s) sent</span>
        </div>
        <div className={`dash-kpi ${overdueInvoices.length ? "dash-kpi-alert" : ""}`}>
          <span className="dash-kpi-label">Overdue Invoices</span>
          <span className="dash-kpi-value">{overdueInvoices.length}</span>
          <span className="dash-kpi-sub">{formatCurrency(overdueAmount, 0)} overdue</span>
        </div>
      </div>

      <div className="dash-grid">
        {/* Jobs by status */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Jobs by Status</h3>
          <div className="dash-status-list">
            {statusCounts.map((s) => (
              <div key={s.status} className="dash-status-row">
                <span className={`status-badge ${s.status}`}>{s.label}</span>
                <span className="dash-status-count">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming deliveries */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Upcoming Deliveries</h3>
          {upcomingDeliveries.length === 0 ? (
            <p className="dash-empty">No scheduled deliveries.</p>
          ) : (
            <ul className="dash-list">
              {upcomingDeliveries.map((o) => (
                <li
                  key={o.id}
                  className={o.job_id ? "dash-list-item clickable" : "dash-list-item"}
                  onClick={() => o.job_id && onSelectJob(o.job_id)}
                >
                  <div className="dash-list-main">
                    <span className="dash-list-title">{o.order_number || "Order"}</span>
                    <span className="dash-list-sub">{o.jobs?.builder || o.jobs?.site_address || "—"}{o.suppliers?.name ? ` · ${o.suppliers.name}` : ""}</span>
                  </div>
                  <span className="dash-list-date">{fmtShortDate(o.delivery_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* This week's schedule */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">
            This Week
            <button className="dash-link-btn" onClick={() => onViewChange("schedule")}>Open board →</button>
          </h3>
          {weekSchedule.length === 0 ? (
            <p className="dash-empty">Nothing scheduled this week.</p>
          ) : (
            <ul className="dash-list">
              {weekSchedule.map((e) => (
                <li
                  key={e.id}
                  className={e.job_id ? "dash-list-item clickable" : "dash-list-item"}
                  onClick={() => e.job_id && onSelectJob(e.job_id)}
                >
                  <div className="dash-list-main">
                    <span className="dash-list-title">{e.builder || "—"}</span>
                    <span className="dash-list-sub">{e.category}{e.workers?.length ? ` · ${e.workers.length} crew` : " · unassigned"}</span>
                  </div>
                  <span className="dash-list-date">{fmtShortDate(e.start_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overdue / awaiting invoices */}
        <div className="dash-panel">
          <h3 className="dash-panel-title">Invoices Awaiting Payment</h3>
          {sentInvoices.length === 0 ? (
            <p className="dash-empty">No outstanding invoices.</p>
          ) : (
            <ul className="dash-list">
              {sentInvoices
                .slice()
                .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
                .slice(0, 8)
                .map((inv) => {
                  const overdue = inv.due_date && inv.due_date < todayStr;
                  return (
                    <li
                      key={inv.id}
                      className={inv.job_id ? "dash-list-item clickable" : "dash-list-item"}
                      onClick={() => inv.job_id && onSelectJob(inv.job_id)}
                    >
                      <div className="dash-list-main">
                        <span className="dash-list-title">{jobAddress(inv.job_id) || "Job"}</span>
                        <span className={`dash-list-sub ${overdue ? "dash-overdue" : ""}`}>
                          {overdue ? "Overdue · " : ""}{inv.due_date ? `due ${fmtShortDate(inv.due_date)}` : "no due date"}
                        </span>
                      </div>
                      <span className="dash-list-date">{formatCurrency(inv.amount, 0)}</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
