import { useMemo, useRef, useState } from "react";
import "../styles/ScheduleBoard.css";

const SCHEDULE_STORAGE_KEY = "roofing-app.schedule-board.v1";
const DEFAULT_DAY_COUNT = 28;
const DAY_WIDTH = 213; // px per day column
const LABEL_WIDTH = 180; // px for left label column
const ROW_HEIGHT = 88; // px per row

const CATEGORY_ROW_COUNTS = {
  Measures: 4,
  Orders: 6,
  "Fascia & Gutter": 4,
  Rail: 3,
  Roofing: 10,
  "Maintenance & Flashings": 6,
};
const CATEGORY_NAMES = Object.keys(CATEGORY_ROW_COUNTS);

const GRID_ROWS = CATEGORY_NAMES.flatMap((category) =>
  Array.from({ length: CATEGORY_ROW_COUNTS[category] }, (_, i) => ({ category, rowInCategory: i }))
);
const TOTAL_ROWS = GRID_ROWS.length;

const WORKERS = [
  "Lochlan","Daniel","Jayco","Josh","Jordy","Jason",
  "Tyler","Mitch","Jeremy","Duff","Shayne","Will","Cyrus",
];

const COLORS = [
  { id: "blue",   label: "Blue",   bg: "#c5d5ee", border: "#7a9dcb" },
  { id: "aqua",   label: "Aqua",   bg: "#8adce8", border: "#42afc0" },
  { id: "green",  label: "Green",  bg: "#b8e8c4", border: "#4daa6c" },
  { id: "sand",   label: "Sand",   bg: "#eee4cf", border: "#c4a97a" },
  { id: "lime",   label: "Lime",   bg: "#e2edaa", border: "#9ab040" },
  { id: "pink",   label: "Pink",   bg: "#f5ccd4", border: "#d0788a" },
  { id: "gray",   label: "Gray",   bg: "#d2d7de", border: "#8a97a8" },
];

// ── Date helpers ────────────────────────────────────────────────────────────
function getScheduleStartDate() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  // Start from Monday of current week
  const mon = new Date(now);
  const d = now.getDay();
  mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
  return mon;
}

function todayDayIndex() {
  const start = getScheduleStartDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - start) / 86400000);
}

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

// ── Grid helpers ─────────────────────────────────────────────────────────────
function getGridRowIndex(category, rowInCategory) {
  const idx = GRID_ROWS.findIndex(
    (r) => r.category === category && r.rowInCategory === rowInCategory
  );
  if (idx >= 0) return idx;
  const catStart = GRID_ROWS.findIndex((r) => r.category === category);
  return catStart >= 0 ? catStart : 0;
}

function resolveGridPosition(rowIdx) {
  const i = Math.max(0, Math.min(TOTAL_ROWS - 1, rowIdx));
  return GRID_ROWS[i] || GRID_ROWS[0];
}

// ── Storage ──────────────────────────────────────────────────────────────────
const BLANK_EVENT = {
  builder: "", address: "", info: "", color: "blue",
  day: 0, span: 1, category: CATEGORY_NAMES[0], rowInCategory: 0, workers: [],
};

function normalizeEvent(e, i) {
  const category = CATEGORY_NAMES.includes(e.category) ? e.category : CATEGORY_NAMES[0];
  const maxRows = CATEGORY_ROW_COUNTS[category];
  return {
    id: e.id || `evt-${Date.now()}-${i}`,
    builder:       e.builder || e.title || "",
    address:       e.address || e.details || "",
    info:          e.info || [e.supplier, e.orderNumber, e.deliveryDate].filter(Boolean).join(" · ") || "",
    color:         e.color || "blue",
    day:           Math.max(0, Number.isFinite(e.day) ? e.day : 0),
    span:          Math.max(1, Number.isFinite(e.span) ? e.span : 1),
    category,
    rowInCategory: Math.min(Math.max(0, Number.isFinite(e.rowInCategory) ? e.rowInCategory : 0), maxRows - 1),
    workers:       Array.isArray(e.workers) ? e.workers : [],
  };
}

function readSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map(normalizeEvent);
  } catch {
    return [];
  }
}

function writeSchedule(events) {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(events));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScheduleBoard() {
  const [events, setEvents] = useState(readSchedule);
  const [dayCount, setDayCount] = useState(DEFAULT_DAY_COUNT);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(BLANK_EVENT);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // {day, rowIdx}
  const [hoverWorkerEventId, setHoverWorkerEventId] = useState(null);

  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const draggingIdRef = useRef(null);

  const totalDays = Math.max(dayCount, ...events.map((e) => e.day + e.span), 1);
  const gridTemplate = `${LABEL_WIDTH}px repeat(${totalDays}, ${DAY_WIDTH}px)`;

  const days = useMemo(() => {
    const start = getScheduleStartDate();
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [totalDays]);

  const scrollToDay = (dayIdx) => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.max(0, LABEL_WIDTH + dayIdx * DAY_WIDTH - el.clientWidth / 2);
    el.scrollTo({ left: target, behavior: "smooth" });
  };

  // ── Coordinate hit test ──────────────────────────────────────────────────
  const getHit = (clientX, clientY) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = clientX - rect.left - LABEL_WIDTH;
    const y = clientY - rect.top;
    const day = Math.floor(x / DAY_WIDTH);
    const rowIdx = Math.floor(y / ROW_HEIGHT);
    if (day < 0 || rowIdx < 0 || rowIdx >= TOTAL_ROWS) return null;
    return { day: Math.min(day, totalDays - 1), rowIdx };
  };

  // ── Drag: move event ─────────────────────────────────────────────────────
  const startDrag = (e, eventId) => {
    if (e.button !== 0) return;
    if (e.target?.closest?.(".sb-event-workers")) return;
    e.preventDefault();
    e.stopPropagation();
    draggingIdRef.current = eventId;
    setDraggingId(eventId);

    const onMove = (ev) => {
      const hit = getHit(ev.clientX, ev.clientY);
      setDropTarget(hit);
    };
    const onUp = (ev) => {
      const hit = getHit(ev.clientX, ev.clientY);
      const eventId = draggingIdRef.current; // capture before clearing
      draggingIdRef.current = null;
      setDraggingId(null);
      setDropTarget(null);
      window.removeEventListener("pointermove", onMove);
      if (hit && eventId) {
        const pos = resolveGridPosition(hit.rowIdx);
        setEvents((prev) => {
          const next = prev.map((item) =>
            item.id === eventId
              ? { ...item, day: hit.day, category: pos.category, rowInCategory: pos.rowInCategory }
              : item
          );
          writeSchedule(next);
          return next;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ── Worker drag ──────────────────────────────────────────────────────────
  const handleWorkerDrop = (e, targetId) => {
    e.preventDefault();
    const workerName = e.dataTransfer.getData("text/worker");
    const sourceId = e.dataTransfer.getData("text/source-event");
    if (!workerName) return;
    setEvents((prev) => {
      const next = prev.map((item) => ({ ...item, workers: [...(item.workers || [])] }));
      if (sourceId) {
        const src = next.find((i) => i.id === sourceId);
        if (src) src.workers = src.workers.filter((w) => w !== workerName);
      }
      const tgt = next.find((i) => i.id === targetId);
      if (tgt && !tgt.workers.includes(workerName)) tgt.workers.push(workerName);
      writeSchedule(next);
      return next;
    });
    setHoverWorkerEventId(null);
  };

  const removeWorker = (eventId, workerName) => {
    setEvents((prev) => {
      const next = prev.map((item) =>
        item.id === eventId
          ? { ...item, workers: item.workers.filter((w) => w !== workerName) }
          : item
      );
      writeSchedule(next);
      return next;
    });
  };

  // ── Modal helpers ────────────────────────────────────────────────────────
  const openAddModal = (day = todayDayIndex(), rowIdx = 0) => {
    const pos = resolveGridPosition(rowIdx);
    setDraft({ ...BLANK_EVENT, day, category: pos.category, rowInCategory: pos.rowInCategory });
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (event) => {
    setDraft({ ...BLANK_EVENT, ...event });
    setEditingId(event.id);
    setShowModal(true);
  };

  const toggleDraftWorker = (name) => {
    setDraft((p) => ({
      ...p,
      workers: p.workers.includes(name) ? p.workers.filter((w) => w !== name) : [...p.workers, name],
    }));
  };

  const saveEvent = () => {
    if (!draft.builder.trim()) { alert("Builder name is required."); return; }
    const event = {
      ...draft,
      builder: draft.builder.trim(),
      address: draft.address.trim(),
      info: draft.info.trim(),
      day: Number(draft.day),
      span: Math.max(1, Number(draft.span) || 1),
      rowInCategory: Number(draft.rowInCategory),
    };
    if (editingId) {
      setEvents((prev) => {
        const next = prev.map((e) => (e.id === editingId ? { ...e, ...event } : e));
        writeSchedule(next);
        return next;
      });
    } else {
      const newEvent = { ...event, id: `evt-${Date.now()}` };
      setEvents((prev) => {
        const next = [...prev, newEvent];
        writeSchedule(next);
        return next;
      });
    }
    setShowModal(false);
  };

  const deleteEvent = () => {
    if (!editingId) return;
    if (!window.confirm("Remove this event from the schedule?")) return;
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== editingId);
      writeSchedule(next);
      return next;
    });
    setShowModal(false);
  };

  const clearSchedule = () => {
    if (!window.confirm("Clear the entire schedule? This cannot be undone.")) return;
    setEvents([]);
    writeSchedule([]);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const todayIdx = todayDayIndex();
  const unassigned = events.filter((e) => !e.workers?.length).length;

  return (
    <div className="sb-wrap">
      {/* Toolbar */}
      <div className="sb-toolbar">
        <div className="sb-toolbar-left">
          <button className="sb-btn sb-btn-primary" onClick={() => openAddModal()}>+ Add Entry</button>
          <button className="sb-btn" onClick={() => scrollToDay(todayIdx)}>Today</button>
          <button className="sb-btn" onClick={() => { const el = scrollRef.current; if (el) el.scrollBy({ left: -7 * DAY_WIDTH, behavior: "smooth" }); }}>← Week</button>
          <button className="sb-btn" onClick={() => { const el = scrollRef.current; if (el) el.scrollBy({ left: 7 * DAY_WIDTH, behavior: "smooth" }); }}>Week →</button>
          <button className="sb-btn" onClick={() => setDayCount((p) => p + 28)}>+ 4 Weeks</button>
        </div>
        <div className="sb-toolbar-right">
          <span className="sb-stat">{events.length} entries</span>
          {unassigned > 0 && <span className="sb-stat sb-stat-warn">{unassigned} unassigned</span>}
          <button className="sb-btn sb-btn-danger" onClick={clearSchedule}>Clear All</button>
        </div>
      </div>

      {/* Crew pool */}
      <div className="sb-crew-pool">
        <span className="sb-crew-label">Crew</span>
        {WORKERS.map((w) => (
          <span
            key={w}
            className="sb-crew-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/worker", w);
              e.dataTransfer.setData("text/source-event", "");
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {w}
          </span>
        ))}
        <span className="sb-crew-hint">Drag names onto entries to assign crew</span>
      </div>

      {/* Grid */}
      <div className="sb-scroll" ref={scrollRef}>
        {/* Day header — sticky top */}
        <div className="sb-header" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="sb-header-label">Section</div>
          {days.map((date, i) => (
            <div
              key={i}
              className={`sb-header-day ${i === todayIdx ? "sb-today" : ""} ${isWeekend(date) ? "sb-weekend" : ""}`}
            >
              <span className="sb-day-name">{date.toLocaleDateString("en-AU", { weekday: "short" })}</span>
              <span className="sb-day-date">{date.getDate()}</span>
              {(i === 0 || date.getDate() === 1) && (
                <span className="sb-day-month">{date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" })}</span>
              )}
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div
          className="sb-grid"
          style={{ gridTemplateColumns: gridTemplate }}
          ref={gridRef}
        >
          {/* Category labels (sticky left) */}
          {CATEGORY_NAMES.map((cat) => {
            const startRow = GRID_ROWS.findIndex((r) => r.category === cat && r.rowInCategory === 0);
            const span = CATEGORY_ROW_COUNTS[cat];
            return (
              <div
                key={cat}
                className="sb-cat-label"
                style={{ gridColumn: "1 / 2", gridRow: `${startRow + 1} / span ${span}` }}
              >
                {cat}
              </div>
            );
          })}

          {/* Background cells (clickable) */}
          {GRID_ROWS.map((row, rowIdx) =>
            days.map((date, dayIdx) => (
              <div
                key={`${rowIdx}-${dayIdx}`}
                className={`sb-cell ${isWeekend(date) ? "sb-cell-weekend" : ""} ${dayIdx === todayIdx ? "sb-cell-today" : ""}`}
                style={{ gridColumn: dayIdx + 2, gridRow: rowIdx + 1 }}
                onClick={() => openAddModal(dayIdx, rowIdx)}
              />
            ))
          )}

          {/* Drop target highlight */}
          {dropTarget && (
            <div
              className="sb-drop-target"
              style={{ gridColumn: dropTarget.day + 2, gridRow: dropTarget.rowIdx + 1 }}
            />
          )}

          {/* Events */}
          {events.map((evt) => {
            const rowIdx = getGridRowIndex(evt.category, evt.rowInCategory);
            const colorDef = COLORS.find((c) => c.id === evt.color) || COLORS[0];
            return (
              <div
                key={evt.id}
                className={`sb-event ${draggingId === evt.id ? "sb-dragging" : ""}`}
                style={{
                  gridColumn: `${evt.day + 2} / span ${evt.span}`,
                  gridRow: rowIdx + 1,
                  background: colorDef.bg,
                  borderColor: colorDef.border,
                }}
                onPointerDown={(e) => startDrag(e, evt.id)}
                onDoubleClick={(e) => { e.stopPropagation(); openEditModal(evt); }}
              >
                {/* Workers zone */}
                <div
                  className={`sb-event-workers ${hoverWorkerEventId === evt.id ? "sb-drop-active" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes("text/worker")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setHoverWorkerEventId(evt.id);
                  }}
                  onDragLeave={() => { if (hoverWorkerEventId === evt.id) setHoverWorkerEventId(null); }}
                  onDrop={(e) => handleWorkerDrop(e, evt.id)}
                >
                  {evt.workers?.length === 0 ? (
                    <span className="sb-worker-empty">—</span>
                  ) : (
                    evt.workers.map((w, i) => (
                      <span
                        key={i}
                        className="sb-worker-chip"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/worker", w);
                          e.dataTransfer.setData("text/source-event", evt.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={(e) => {
                          if (e.dataTransfer.dropEffect === "none") removeWorker(evt.id, w);
                        }}
                        onClick={(e) => { e.stopPropagation(); removeWorker(evt.id, w); }}
                      >
                        {w}
                      </span>
                    ))
                  )}
                </div>

                {/* Content */}
                <div className="sb-event-content">
                  <div className="sb-event-builder">{evt.builder || "—"}</div>
                  {evt.address && <div className="sb-event-address">{evt.address}</div>}
                  {evt.info && <div className="sb-event-info">{evt.info}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="sb-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-modal-head">
              <h3>{editingId ? "Edit Entry" : "Add Entry"}</h3>
              <button className="sb-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="sb-modal-body">
              <div className="sb-field-full">
                <label>Builder / Job Name *</label>
                <input
                  value={draft.builder}
                  onChange={(e) => setDraft((p) => ({ ...p, builder: e.target.value }))}
                  placeholder="Builder or job name"
                  autoFocus
                />
              </div>

              <div className="sb-field-full">
                <label>Address</label>
                <input
                  value={draft.address}
                  onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Site address"
                />
              </div>

              <div className="sb-field-full">
                <label>Info / Notes</label>
                <input
                  value={draft.info}
                  onChange={(e) => setDraft((p) => ({ ...p, info: e.target.value }))}
                  placeholder="Order number, delivery notes, info..."
                />
              </div>

              <div className="sb-field">
                <label>Day</label>
                <select
                  value={draft.day}
                  onChange={(e) => setDraft((p) => ({ ...p, day: Number(e.target.value) }))}
                >
                  {days.map((date, i) => (
                    <option key={i} value={i}>
                      {date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sb-field">
                <label>Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={draft.span}
                  onChange={(e) => setDraft((p) => ({ ...p, span: Number(e.target.value) }))}
                />
              </div>

              <div className="sb-field">
                <label>Section</label>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value, rowInCategory: 0 }))}
                >
                  {CATEGORY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="sb-field">
                <label>Row</label>
                <select
                  value={draft.rowInCategory}
                  onChange={(e) => setDraft((p) => ({ ...p, rowInCategory: Number(e.target.value) }))}
                >
                  {Array.from({ length: CATEGORY_ROW_COUNTS[draft.category] || 1 }, (_, i) => (
                    <option key={i} value={i}>Row {i + 1}</option>
                  ))}
                </select>
              </div>

              <div className="sb-field-full">
                <label>Colour</label>
                <div className="sb-color-picker">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`sb-color-swatch ${draft.color === c.id ? "active" : ""}`}
                      style={{ background: c.bg, borderColor: c.border }}
                      onClick={() => setDraft((p) => ({ ...p, color: c.id }))}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="sb-field-full">
                <label>Workers</label>
                <div className="sb-worker-picker">
                  {WORKERS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`sb-worker-toggle ${draft.workers.includes(w) ? "active" : ""}`}
                      onClick={() => toggleDraftWorker(w)}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sb-modal-actions">
              <div className="sb-modal-actions-left">
                {editingId && (
                  <button className="sb-btn sb-btn-danger" onClick={deleteEvent}>Delete</button>
                )}
              </div>
              <div className="sb-modal-actions-right">
                <button className="sb-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="sb-btn sb-btn-primary" onClick={saveEvent}>
                  {editingId ? "Save Changes" : "Add Entry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
