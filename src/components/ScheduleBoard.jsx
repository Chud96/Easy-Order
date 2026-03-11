import { Fragment, useMemo, useRef, useState } from "react";
import "../styles/ScheduleBoard.css";

const SCHEDULE_STORAGE_KEY = "roofing-app.schedule-board.v1";
const DEFAULT_DAY_COUNT = 14;
const HEADER_ROW_COUNT = 1;
const CATEGORY_ROW_COUNTS = {
  Measures: 8,
  Orders: 8,
  "Fascia & Gutter": 6,
  Rail: 4,
  Roofing: 20,
  "Maintenance & Flashings": 20,
};
const CATEGORY_NAMES = Object.keys(CATEGORY_ROW_COUNTS);
const GRID_ROW_DEFINITIONS = CATEGORY_NAMES.flatMap((category) =>
  Array.from({ length: CATEGORY_ROW_COUNTS[category] || 1 }, (_, idx) => ({
    type: "work",
    category,
    rowInCategory: idx,
  }))
);
const TOTAL_ROWS = GRID_ROW_DEFINITIONS.length;
const clampDay = (value) => Math.max(0, Number.isFinite(value) ? value : 0);

const WORKERS = [
  "Lochlan",
  "Daniel",
  "Jayco",
  "Josh",
  "Jordy",
  "Jason",
  "Tyler",
  "Mitch",
  "Jeremy",
  "Duff",
  "Shayne",
  "Will",
  "Cyrus",
];

const DEFAULT_EVENTS = [
  {
    id: "evt-1",
    builder: "Hampton Style",
    address: "7 Oswald St Wilton",
    supplier: "Alltops",
    deliveryDate: "",
    orderNumber: "B14107-4",
    info: "Parapet angle",
    workers: ["Jake", "Tom"],
    color: "aqua",
    day: 1,
    category: "Orders",
    rowInCategory: 0,
    span: 1,
  },
  {
    id: "evt-2",
    builder: "Sabel",
    address: "Apex Store Del 20/02",
    supplier: "Alltops",
    deliveryDate: "",
    orderNumber: "B15518-13",
    info: "Cola CT Flinders",
    workers: ["Liam"],
    color: "blue",
    day: 2,
    category: "Orders",
    rowInCategory: 1,
    span: 1,
  },
  {
    id: "evt-3",
    builder: "Fassone",
    address: "U3 Short St Berkeley",
    supplier: "Alltops",
    deliveryDate: "",
    orderNumber: "",
    info: "Leak",
    workers: ["Alex"],
    color: "sand",
    day: 4,
    category: "Maintenance & Flashings",
    rowInCategory: 0,
    span: 1,
  },
  {
    id: "evt-img-1",
    builder: "Illawarra Homes - 7",
    address: "Hopetown St Oak Flats",
    supplier: "",
    deliveryDate: "",
    orderNumber: "B15882-5",
    info: "62lm, 103m2 - apex site del 6/3",
    workers: [],
    color: "sand",
    day: 1,
    category: "Roofing",
    rowInCategory: 0,
    span: 1,
  },
  {
    id: "evt-img-2",
    builder: "Lot 6053#48 Hatter Cct",
    address: "Calderwood Domaine",
    supplier: "",
    deliveryDate: "",
    orderNumber: "143108",
    info: "BATTENED",
    workers: [],
    color: "blue",
    day: 2,
    category: "Roofing",
    rowInCategory: 1,
    span: 1,
  },
  {
    id: "evt-img-3",
    builder: "Lot 32#3 Excelsior Dve",
    address: "Calderwood Domaine",
    supplier: "",
    deliveryDate: "",
    orderNumber: "143095",
    info: "",
    workers: [],
    color: "blue",
    day: 3,
    category: "Roofing",
    rowInCategory: 2,
    span: 1,
  },
  {
    id: "evt-img-4",
    builder: "Lot 6149#24 Coalminer Dve",
    address: "Calderwood",
    supplier: "",
    deliveryDate: "",
    orderNumber: "143222",
    info: "Complete (batt sheet) (screws at yard)",
    workers: [],
    color: "blue",
    day: 3,
    category: "Roofing",
    rowInCategory: 3,
    span: 1,
  },
  {
    id: "evt-img-5",
    builder: "Lot 889#48 Bonneville Bvd",
    address: "Goulburn RPG",
    supplier: "",
    deliveryDate: "",
    orderNumber: "143254",
    info: "",
    workers: [],
    color: "blue",
    day: 4,
    category: "Roofing",
    rowInCategory: 4,
    span: 1,
  },
  {
    id: "evt-img-6",
    builder: "Enhanced 9 Carroll Rd",
    address: "Corrimal Top",
    supplier: "",
    deliveryDate: "",
    orderNumber: "T15552-1",
    info: "214m2, 67lm, del 12th",
    workers: [],
    color: "sand",
    day: 5,
    category: "Roofing",
    rowInCategory: 0,
    span: 1,
  },
  {
    id: "evt-img-7",
    builder: "L1, 42 Frods Rd Thirroul",
    address: "Stroud",
    supplier: "",
    deliveryDate: "",
    orderNumber: "140357",
    info: "7am crane (header aprons barges 280)",
    workers: [],
    color: "blue",
    day: 5,
    category: "Roofing",
    rowInCategory: 5,
    span: 1,
  },
];

const DEFAULT_DRAFT = {
  builder: "",
  address: "",
  supplier: "",
  deliveryDate: "",
  orderNumber: "",
  info: "",
  workers: [],
  color: "blue",
  day: 0,
  category: CATEGORY_NAMES[0],
  rowInCategory: 0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCategoryName(raw) {
  if (raw === "FG") {
    return "Fascia & Gutter";
  }
  if (raw === "Maintance & Flashings") {
    return "Maintenance & Flashings";
  }
  return raw;
}

function resolveLegacyPosition(row) {
  const clampedRow = clamp(Number.isFinite(row) ? row : 0, 0, CATEGORY_NAMES.length - 1);
  const category = CATEGORY_NAMES[clampedRow] || CATEGORY_NAMES[0];
  return { category, rowInCategory: 0 };
}

function getGridRowIndex(category, rowInCategory) {
  const idx = GRID_ROW_DEFINITIONS.findIndex(
    (row) =>
      row.type === "work" && row.category === category && row.rowInCategory === rowInCategory
  );
  if (idx >= 0) {
    return idx;
  }

  const categoryStart = GRID_ROW_DEFINITIONS.findIndex(
    (row) => row.type === "work" && row.category === category
  );
  return categoryStart >= 0 ? categoryStart : 0;
}

function resolveGridPosition(gridRowIndex) {
  const requestedIndex = clamp(
    Number.isFinite(gridRowIndex) ? gridRowIndex : 0,
    0,
    GRID_ROW_DEFINITIONS.length - 1
  );

  const targetRow = GRID_ROW_DEFINITIONS[requestedIndex];
  if (targetRow?.type === "work") {
    return targetRow;
  }

  for (let i = requestedIndex - 1; i >= 0; i -= 1) {
    if (GRID_ROW_DEFINITIONS[i]?.type === "work") {
      return GRID_ROW_DEFINITIONS[i];
    }
  }

  return GRID_ROW_DEFINITIONS[0];
}

function normalizeEvent(event, index) {
  const mappedCategory = normalizeCategoryName(event.category);
  const hasCategoryRow =
    typeof mappedCategory === "string" &&
    (Number.isFinite(event.rowInCategory) || Number.isFinite(event.columnInCategory));
  const legacyPosition = resolveLegacyPosition(event.row);
  const category = hasCategoryRow ? mappedCategory : legacyPosition.category;
  const legacyRow = Number.isFinite(event.rowInCategory)
    ? event.rowInCategory
    : Number.isFinite(event.columnInCategory)
      ? event.columnInCategory
      : legacyPosition.rowInCategory;
  const rowInCategory = hasCategoryRow ? legacyRow : legacyPosition.rowInCategory;
  const normalizedCategory = CATEGORY_NAMES.includes(category) ? category : CATEGORY_NAMES[0];
  const maxRows = CATEGORY_ROW_COUNTS[normalizedCategory] || 1;

  if (event.builder || event.orderNumber || event.address) {
    return {
      id: event.id || `evt-${Date.now()}-${index}`,
      builder: event.builder || "",
      address: event.address || "",
      supplier: event.supplier || "",
      deliveryDate: event.deliveryDate || "",
      orderNumber: event.orderNumber || "",
      info: event.info || "",
      workers: Array.isArray(event.workers) ? event.workers : [],
      color: event.color || "blue",
      day: clampDay(event.day),
      category: normalizedCategory,
      rowInCategory: clamp(Number.isFinite(rowInCategory) ? rowInCategory : 0, 0, maxRows - 1),
      span: Number.isFinite(event.span) ? Math.max(1, event.span) : 1,
    };
  }

  return {
    id: event.id || `evt-${Date.now()}-${index}`,
    builder: event.title || "Job",
    address: event.details || "",
    supplier: "",
    deliveryDate: "",
    orderNumber: "",
    info: "",
    workers: [],
    color: event.color || "blue",
    day: clampDay(event.day),
    category: normalizedCategory,
    rowInCategory: clamp(Number.isFinite(rowInCategory) ? rowInCategory : 0, 0, maxRows - 1),
    span: 1,
  };
}

function readSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_EVENTS;
    return parsed.map(normalizeEvent);
  } catch {
    return DEFAULT_EVENTS.map(normalizeEvent);
  }
}

function writeSchedule(events) {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(events));
}

function getScheduleStartDate() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  return start;
}

export default function ScheduleBoard() {
  const [events, setEvents] = useState(readSchedule);
  const gridRef = useRef(null);
  const draggingEventIdRef = useRef(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [dayCount, setDayCount] = useState(() => {
    const maxDay = Math.max(
      0,
      ...readSchedule().map((item) => (Number.isFinite(item.day) ? item.day : 0))
    );
    return Math.max(DEFAULT_DAY_COUNT, maxDay + 1);
  });
  const [draggingEventId, setDraggingEventId] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [hoverWorkerEventId, setHoverWorkerEventId] = useState(null);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);

  const maxEventDay = useMemo(
    () =>
      Math.max(
        0,
        ...events.map((item) => (Number.isFinite(item.day) ? item.day : 0))
      ),
    [events]
  );
  const totalDays = Math.max(dayCount, maxEventDay + 1);
  const totalColumns = totalDays * 2;

  const days = useMemo(() => {
    const start = getScheduleStartDate();
    return Array.from({ length: totalDays }, (_, idx) => {
      const next = new Date(start);
      next.setDate(start.getDate() + idx);
      return next;
    });
  }, [totalDays]);

  const moveEvent = (eventId, day, gridRowIndex) => {
    const position = resolveGridPosition(gridRowIndex);
    const next = events.map((item) =>
      item.id === eventId
        ? {
            ...item,
            day: clampDay(day),
            category: position.category,
            rowInCategory: position.rowInCategory,
          }
        : item
    );
    setEvents(next);
    writeSchedule(next);
  };

  const toggleWorker = (name) => {
    setDraft((prev) => ({
      ...prev,
      workers: prev.workers.includes(name)
        ? prev.workers.filter((item) => item !== name)
        : [...prev.workers, name],
    }));
  };

  const handleWorkerDrop = (e, targetEventId) => {
    e.preventDefault();
    const workerName = e.dataTransfer.getData("text/schedule-worker-name");
    const sourceEventId = e.dataTransfer.getData("text/schedule-source-event-id");
    if (!workerName) {
      return;
    }

    setEvents((prev) => {
      const next = prev.map((item) => ({ ...item, workers: [...(item.workers || [])] }));
      const target = next.find((item) => item.id === targetEventId);
      if (!target) {
        return prev;
      }

      if (sourceEventId) {
        const source = next.find((item) => item.id === sourceEventId);
        if (source) {
          source.workers = source.workers.filter((worker) => worker !== workerName);
        }
      }

      if (!target.workers.includes(workerName)) {
        target.workers.push(workerName);
      }

      writeSchedule(next);
      return next;
    });

    setHoverWorkerEventId(null);
  };

  const saveJob = () => {
    if (!draft.builder.trim()) {
      return;
    }

    if (editingJobId) {
      const next = events.map((item) =>
        item.id === editingJobId
          ? {
              ...item,
              builder: draft.builder.trim(),
              address: draft.address.trim(),
              supplier: draft.supplier.trim(),
              deliveryDate: draft.deliveryDate,
              orderNumber: draft.orderNumber.trim(),
              info: draft.info.trim(),
              workers: draft.workers,
              color: draft.color,
              day: Number(draft.day),
              category: draft.category,
              rowInCategory: Number(draft.rowInCategory),
            }
          : item
      );
      setEvents(next);
      writeSchedule(next);
    } else {
      const next = [
        ...events,
        {
          id: `evt-${Date.now()}`,
          builder: draft.builder.trim(),
          address: draft.address.trim(),
          supplier: draft.supplier.trim(),
          deliveryDate: draft.deliveryDate,
          orderNumber: draft.orderNumber.trim(),
          info: draft.info.trim(),
          workers: draft.workers,
          color: draft.color,
          day: Number(draft.day),
          category: draft.category,
          rowInCategory: Number(draft.rowInCategory),
          span: 1,
        },
      ];
      setEvents(next);
      writeSchedule(next);
    }
    setDraft((prev) => ({
      ...DEFAULT_DRAFT,
      day: prev.day,
      category: prev.category,
      rowInCategory: prev.rowInCategory,
    }));
    setEditingJobId(null);
    setShowJobModal(false);
  };

  const makeCellKey = (day, row, lane) => `${day}-${row}-${lane}`;

  const openJobModal = (day, rowIdx) => {
    const position = resolveGridPosition(rowIdx);
    setDraft({
      ...DEFAULT_DRAFT,
      day: clampDay(day),
      category: position.category,
      rowInCategory: position.rowInCategory,
    });
    setEditingJobId(null);
    setShowJobModal(true);
  };

  const openEditModal = (event) => {
    setDraft({
      ...DEFAULT_DRAFT,
      builder: event.builder || "",
      address: event.address || "",
      supplier: event.supplier || "",
      deliveryDate: event.deliveryDate || "",
      orderNumber: event.orderNumber || "",
      info: event.info || "",
      workers: Array.isArray(event.workers) ? event.workers : [],
      color: event.color || "blue",
      day: Number(event.day) || 0,
      category: event.category || CATEGORY_NAMES[0],
      rowInCategory: Number(event.rowInCategory) || 0,
    });
    setEditingJobId(event.id);
    setShowJobModal(true);
  };

  const deleteJob = () => {
    if (!editingJobId) {
      return;
    }
    const next = events.filter((item) => item.id !== editingJobId);
    setEvents(next);
    writeSchedule(next);
    setEditingJobId(null);
    setShowJobModal(false);
  };

  const removeWorkerFromJob = (eventId, workerName) => {
    setEvents((prev) => {
      const next = prev.map((item) =>
        item.id === eventId
          ? {
              ...item,
              workers: (item.workers || []).filter((worker) => worker !== workerName),
            }
          : item
      );
      writeSchedule(next);
      return next;
    });
  };

  const getGridHit = (clientX, clientY) => {
    const gridEl = gridRef.current;
    if (!gridEl) {
      return null;
    }
    const gridRect = gridEl.getBoundingClientRect();
    const sampleCell = gridEl.querySelector(".schedule-cell");
    if (!sampleCell) {
      return null;
    }
    const cellRect = sampleCell.getBoundingClientRect();
    const cellWidth = cellRect.width || 140;
    const cellHeight = cellRect.height || 110;
    const leftOffset = 220; // left section column
    const x = clientX - gridRect.left - leftOffset;
    const y = clientY - gridRect.top;
    const colIdx = Math.floor(x / cellWidth);
    const rowIdx = Math.floor(y / cellHeight);
    if (!Number.isFinite(colIdx) || !Number.isFinite(rowIdx)) {
      return null;
    }
    const clampedCol = Math.max(0, Math.min(totalColumns - 1, colIdx));
    const clampedRow = Math.max(0, Math.min(TOTAL_ROWS - 1, rowIdx));
    const day = Math.floor(clampedCol / 2);
    return { day, rowIdx: clampedRow };
  };

  const startJobPointerDrag = (e, eventId) => {
    if (e.button !== undefined && e.button !== 0) {
      return;
    }
    if (e.target?.closest?.(".schedule-event-workers")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    draggingEventIdRef.current = eventId;
    setDraggingEventId(eventId);
    const startEvent = events.find((item) => item.id === eventId);
    const dragSpan = Number.isFinite(startEvent?.span) ? startEvent.span : 1;

    const move = (ev) => {
      const hit = getGridHit(ev.clientX, ev.clientY);
      if (!hit) {
        return;
      }
      setHoveredCell({
        key: makeCellKey(hit.day, hit.rowIdx, "work"),
        day: hit.day,
        rowIdx: hit.rowIdx,
        span: dragSpan,
      });
    };

    const up = (ev) => {
      const hit = getGridHit(ev.clientX, ev.clientY);
      if (hit) {
        moveEvent(eventId, hit.day, hit.rowIdx);
      }
      draggingEventIdRef.current = null;
      setDraggingEventId(null);
      setHoveredCell(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <div className="schedule-board-wrap">
      <div className="schedule-toolbar">
        <div className="schedule-toolbar-note">
          Right-click on the schedule to add a job at that day/row.
        </div>
        <div className="schedule-toolbar-actions">
          <button type="button" onClick={() => openJobModal(0, 0)}>
            Add Job
          </button>
          <button type="button" onClick={() => setDayCount((prev) => prev + 30)}>
            Add 30 Days
          </button>
          <button type="button" onClick={() => setDayCount((prev) => prev + 90)}>
            Add 90 Days
          </button>
        </div>
      </div>

      <div className="schedule-workers-palette">
        {WORKERS.map((worker) => (
          <button
            key={worker}
            type="button"
            onClick={() => toggleWorker(worker)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/schedule-worker-name", worker);
              e.dataTransfer.setData("text/schedule-source-event-id", "");
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setHoverWorkerEventId(null)}
          >
            {worker}
          </button>
        ))}
      </div>

      <div className="schedule-board-scroll">
        <div className="schedule-board">
          <div
            className="schedule-day-row"
            style={{ gridTemplateColumns: `220px repeat(${totalColumns}, minmax(140px, 1fr))` }}
          >
            <div className="schedule-label-spacer schedule-section-spacer">Section</div>
            {days.map((date, idx) => (
              <div key={`day-${idx}`} className="schedule-day-cell">
                {date.toLocaleDateString(undefined, { weekday: "long" })}, {date.getDate()}
              </div>
            ))}
          </div>

          <div
            className="schedule-grid"
            style={{ gridTemplateColumns: `220px repeat(${totalColumns}, minmax(140px, 1fr))` }}
            onContextMenu={(e) => {
              e.preventDefault();
              const hit = getGridHit(e.clientX, e.clientY);
              if (hit) {
                openJobModal(hit.day, hit.rowIdx);
              } else {
                openJobModal(0, 0);
              }
            }}
            ref={gridRef}
          >
            {CATEGORY_NAMES.map((category) => {
              const startRow = GRID_ROW_DEFINITIONS.findIndex(
                (row) => row.category === category && row.rowInCategory === 0
              );
              const span = CATEGORY_ROW_COUNTS[category] || 1;
              return (
                <div
                  key={`cat-${category}`}
                  className="schedule-category-label"
                  style={{
                    gridColumn: "1 / span 1",
                    gridRow: `${startRow + 1} / span ${span}`,
                  }}
                >
                  {category}
                </div>
              );
            })}

            {GRID_ROW_DEFINITIONS.map((rowDef, rowIdx) =>
              Array.from({ length: totalColumns }).map((__, colIdx) => {
                const day = Math.floor(colIdx / 2);
                const cellKey = makeCellKey(day, rowIdx, "work");
                return (
                  <div
                    key={`cell-${rowIdx}-${colIdx}`}
                    className={`schedule-cell ${
                      hoveredCell && hoveredCell.key === cellKey ? "schedule-cell-hover" : ""
                    }`}
                    data-day={day}
                    data-row={rowIdx}
                  />
                );
              })
            )}

            {hoveredCell && (
              <div
                className="schedule-drop-shadow"
                style={{
                  gridColumn: `${hoveredCell.day * 2 + 2} / span ${hoveredCell.span * 2}`,
                  gridRow: `${hoveredCell.rowIdx + 1} / span 1`,
                }}
              />
            )}

            {events.map((event) => {
              const gridRowIndex = getGridRowIndex(event.category, event.rowInCategory);
              return (
                <div
                  key={event.id}
                  className={`schedule-event schedule-color-${event.color} ${
                    draggingEventId === event.id ? "dragging" : ""
                  }`}
                  style={{
                    gridColumn: `${event.day * 2 + 2} / span 2`,
                    gridRow: `${gridRowIndex + 1} / span 1`,
                  }}
                  onPointerDown={(e) => startJobPointerDrag(e, event.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openEditModal(event);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openEditModal(event);
                  }}
                >
                  <div
                    className={`schedule-event-workers ${
                      hoverWorkerEventId === event.id ? "worker-drop-active" : ""
                    }`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDragOver={(e) => {
                      const workerName = e.dataTransfer.getData("text/schedule-worker-name");
                      if (!workerName) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setHoverWorkerEventId(event.id);
                    }}
                    onDragLeave={() => {
                      if (hoverWorkerEventId === event.id) {
                        setHoverWorkerEventId(null);
                      }
                    }}
                    onDrop={(e) => handleWorkerDrop(e, event.id)}
                  >
                    {(event.workers || []).length === 0 ? (
                      <span className="schedule-worker-empty">Unassigned</span>
                    ) : (
                      event.workers.map((worker, idx) => (
                        <span
                          key={`${event.id}-w-${idx}`}
                          className="schedule-worker-chip"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/schedule-worker-name", worker);
                            e.dataTransfer.setData("text/schedule-source-event-id", event.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={(e) => {
                            if (e.dataTransfer.dropEffect === "none") {
                              removeWorkerFromJob(event.id, worker);
                            }
                          }}
                        >
                          {worker}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="schedule-event-details">
                    <strong>{event.builder || "Job"}</strong>
                    <span>Address: {event.address || "-"}</span>
                    <span>Supplier: {event.supplier || "-"}</span>
                    <span>Delivery Date: {event.deliveryDate || "-"}</span>
                    <span>Order Number: {event.orderNumber || "-"}</span>
                    <span>Info: {event.info || "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showJobModal && (
        <div className="schedule-modal-backdrop" onClick={() => setShowJobModal(false)}>
          <div className="schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3>{editingJobId ? "Edit Job" : "Add Job"}</h3>
              <button type="button" onClick={() => setShowJobModal(false)}>
                Close
              </button>
            </div>
            <div className="schedule-modal-body">
              <input
                placeholder="Builder"
                value={draft.builder}
                onChange={(e) => setDraft((prev) => ({ ...prev, builder: e.target.value }))}
              />
              <input
                placeholder="Address"
                value={draft.address}
                onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))}
              />
              <input
                placeholder="Supplier"
                value={draft.supplier}
                onChange={(e) => setDraft((prev) => ({ ...prev, supplier: e.target.value }))}
              />
              <input
                type="date"
                value={draft.deliveryDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, deliveryDate: e.target.value }))}
              />
              <input
                placeholder="Order Number"
                value={draft.orderNumber}
                onChange={(e) => setDraft((prev) => ({ ...prev, orderNumber: e.target.value }))}
              />
              <input
                placeholder="INFO"
                value={draft.info}
                onChange={(e) => setDraft((prev) => ({ ...prev, info: e.target.value }))}
              />
              <select
                value={draft.color}
                onChange={(e) => setDraft((prev) => ({ ...prev, color: e.target.value }))}
              >
                <option value="blue">Blue</option>
                <option value="aqua">Aqua</option>
                <option value="sand">Sand</option>
                <option value="lime">Lime</option>
                <option value="gray">Gray</option>
              </select>
              <select
                value={draft.day}
                onChange={(e) => setDraft((prev) => ({ ...prev, day: Number(e.target.value) }))}
              >
                {days.map((date, idx) => (
                  <option key={idx} value={idx}>
                    {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                  </option>
                ))}
              </select>
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    category: e.target.value,
                    rowInCategory: 0,
                  }))
                }
              >
                {CATEGORY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={draft.rowInCategory}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, rowInCategory: Number(e.target.value) }))
                }
              >
                {Array.from({ length: CATEGORY_ROW_COUNTS[draft.category] || 1 }, (_, idx) => (
                  <option key={idx} value={idx}>
                    Row {idx + 1}
                  </option>
                ))}
              </select>
              <div className="schedule-modal-workers">
                {WORKERS.map((worker) => (
                  <button
                    key={worker}
                    type="button"
                    className={draft.workers.includes(worker) ? "active" : ""}
                    onClick={() => toggleWorker(worker)}
                  >
                    {worker}
                  </button>
                ))}
              </div>
            </div>
            <div className="schedule-modal-actions">
              <button type="button" onClick={() => setShowJobModal(false)}>
                Cancel
              </button>
              {editingJobId && (
                <button type="button" onClick={deleteJob} className="danger">
                  Delete
                </button>
              )}
              <button type="button" onClick={saveJob}>
                {editingJobId ? "Save Changes" : "Add Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
