import { generateSvgForFolds } from "./pdf.jsx";
import { calculateGirth } from "./geometry";

const ORDER_FORMS_STORAGE_KEY = "roofing-app.order-forms.v1";
const QTY_ONLY_CATEGORIES = new Set([
  "Fascia Accessories",
  "Gutter Accessories",
  "Battens",
  "Insulation",
  "Other",
]);
const PDF_CATEGORY_ORDER = [
  "Roofing",
  "Flashings",
  "Fascia",
  "Fascia Accessories",
  "Gutter",
  "Gutter Accessories",
  "Battens",
  "Insulation",
  "Screws",
];

const PDF_CATEGORY_LABELS = {
  Flashings: "Flashings (Standard Items)",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupRowsByItem(rows) {
  const grouped = [];
  rows.forEach((row) => {
    const existing = grouped.find((item) => item.item === row.item);
    if (existing) {
      existing.lines.push(row);
    } else {
      grouped.push({ item: row.item, lines: [row] });
    }
  });
  return grouped;
}

function buildCategoryRows(rows, qtyOnly) {
  const groups = groupRowsByItem(rows);
  if (groups.length === 0) {
    return qtyOnly
      ? "<tr><td>&nbsp;</td></tr><tr><td class=\"num\">&nbsp;</td></tr>"
      : "<tr><td colspan=\"2\">&nbsp;</td></tr><tr><td class=\"num\">&nbsp;</td><td class=\"num\">&nbsp;</td></tr>";
  }

  return groups
    .map((group) => {
      const header = `<tr class="item-header-row"><td colspan="${qtyOnly ? 1 : 2}">${escapeHtml(group.item)}</td></tr>`;
      const lines = group.lines
        .map((line) =>
          qtyOnly
            ? `<tr><td class="num">${escapeHtml(line.qty)}</td></tr>`
            : `<tr><td class="num">${escapeHtml(line.qty)}</td><td class="num">${escapeHtml(line.length)}</td></tr>`
        )
        .join("");
      return `${header}${lines}`;
    })
    .join("");
}

function renderCategoryBlock(name, rows) {
  const qtyOnly = QTY_ONLY_CATEGORIES.has(name);
  const head = qtyOnly
    ? "<thead><tr><th class=\"num\">Qty</th></tr></thead>"
    : "<thead><tr><th class=\"num\">Qty</th><th class=\"num\">Length</th></tr></thead>";
  return `<section class="category-block">
    <h3>${escapeHtml(name)}</h3>
    <table>
      ${head}
      <tbody>${buildCategoryRows(rows, qtyOnly)}</tbody>
    </table>
  </section>`;
}

function groupSelectionsByCategoryAndSubcategory(standardSelections) {
  return standardSelections.reduce((acc, selection) => {
    const category = selection.category || "Other";
    const subcategory = selection.subcategory || "General";
    if (!acc[category]) {
      acc[category] = {};
    }
    if (!acc[category][subcategory]) {
      acc[category][subcategory] = [];
    }
    acc[category][subcategory].push(selection);
    return acc;
  }, {});
}

function getOrderedCategories(groupedSelections) {
  const existing = Object.keys(groupedSelections);
  const known = PDF_CATEGORY_ORDER.filter((category) => existing.includes(category));
  const unknown = existing
    .filter((category) => !PDF_CATEGORY_ORDER.includes(category))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}

function getPdfCategoryDisplayName(category) {
  return PDF_CATEGORY_LABELS[category] || category;
}

export function saveOrderFormRecord(orderForm) {
  try {
    const raw = localStorage.getItem(ORDER_FORMS_STORAGE_KEY);
    const records = raw ? JSON.parse(raw) : [];
    records.push(orderForm);
    localStorage.setItem(ORDER_FORMS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.warn("Unable to save order form record", error);
    return false;
  }
}

export function exportOrderFormToPdf(orderForm) {
  const { orderInfo, standardSelections, supplier } = orderForm;
  const groupedSelections = groupSelectionsByCategoryAndSubcategory(standardSelections);
  const orderedCategories = getOrderedCategories(groupedSelections);
  const categoryBlocks = orderedCategories
    .flatMap((category) => {
      const subMap = groupedSelections[category];
      const subcategories = Object.keys(subMap).sort((a, b) => a.localeCompare(b));
      return subcategories.map((subcategory) => ({
        category,
        subcategory,
        rows: subMap[subcategory],
      }));
    })
    .map(({ category, subcategory, rows }) =>
      renderCategoryBlock(
        subcategory && subcategory !== "General"
          ? `${getPdfCategoryDisplayName(category)} - ${subcategory}`
          : getPdfCategoryDisplayName(category),
        rows
      )
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Roof Order Form</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #111827; font-size: 11px; }
      .sheet { width: 190mm; margin: 0 auto; }
      .top-title { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; margin: 0 0 6px 0; }
      .company { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
      .top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
      .line-row { display: grid; grid-template-columns: 110px 1fr; align-items: end; margin: 4px 0; }
      .line-label { font-weight: 700; }
      .line-value { border-bottom: 1px solid #111827; min-height: 18px; padding: 2px 4px; }
      .meta-right .line-row { grid-template-columns: 114px 1fr; }
      .category-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .category-block { break-inside: avoid; page-break-inside: avoid; }
      .category-block h3 { margin: 0 0 4px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #4b5563; padding: 3px 5px; vertical-align: middle; }
      th { background: #f3f4f6; text-align: left; font-size: 10px; }
      td { font-size: 10px; }
      .num { text-align: right; width: 46px; }
      .item-header-row td { background: #eef3fb; font-weight: 700; text-align: left; }
      .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
      .notes-box, .legend-box { border: 1px solid #4b5563; min-height: 90px; padding: 6px; }
      .notes-title { font-size: 11px; font-weight: 700; margin-bottom: 5px; }
      .colour-row { margin: 3px 0; }
      .totals { margin-top: 10px; display: flex; justify-content: space-between; font-weight: 700; font-size: 11px; }
    </style>
  </head><body>
    <div class="sheet">
      <div class="company">ALLTOPS METAL ROOFING NSW PTY LTD</div>
      <div class="top-title">ROOF ORDER FORM</div>

      <div class="top-grid">
        <div>
          <div class="line-row"><div class="line-label">Builder:</div><div class="line-value">${escapeHtml(orderInfo.builder)}</div></div>
          <div class="line-row"><div class="line-label">Deliver To:</div><div class="line-value">${escapeHtml(orderInfo.address)}</div></div>
          <div class="line-row"><div class="line-label">Supplier:</div><div class="line-value">${escapeHtml(supplier?.name || "")}</div></div>
        </div>
        <div class="meta-right">
          <div class="line-row"><div class="line-label">Order Number:</div><div class="line-value">${escapeHtml(orderInfo.orderNumber)}</div></div>
          <div class="line-row"><div class="line-label">Order Date:</div><div class="line-value">${escapeHtml(orderInfo.orderDate)}</div></div>
          <div class="line-row"><div class="line-label">Delivery Date:</div><div class="line-value">${escapeHtml(orderInfo.deliveryDate)}</div></div>
        </div>
      </div>

      <div class="category-grid">${categoryBlocks}</div>

      <div class="footer-grid">
        <div class="notes-box">
          <div class="notes-title">Colours / Notes</div>
          <div class="colour-row">Roof: ${escapeHtml(orderInfo.roofColour)}</div>
          <div class="colour-row">Fascia: ${escapeHtml(orderInfo.fasciaColour)}</div>
          <div class="colour-row">Gutter: ${escapeHtml(orderInfo.gutterColour)}</div>
          <div class="colour-row" style="margin-top:8px;">${escapeHtml(orderInfo.notes)}</div>
        </div>
        <div class="legend-box">
          <div class="notes-title">Summary</div>
          <div>Total line items: ${escapeHtml(standardSelections.length)}</div>
          <div>Total categories: ${escapeHtml(Object.keys(groupedSelections).length)}</div>
        </div>
      </div>

      <div class="totals">
        <span>TOP:</span>
        <span>LOWERS:</span>
      </div>
    </div>
  </body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  } else {
    alert("Unable to open print window (popup blocked?)");
  }
}

export async function exportCombinedOrderToPdf(orderForm) {
  const { orderInfo, standardSelections = [], flashingOrders = [], supplier } = orderForm;
  const groupedSelections = groupSelectionsByCategoryAndSubcategory(standardSelections);
  const orderedCategories = getOrderedCategories(groupedSelections);
  const categoryBlocks = orderedCategories
    .flatMap((category) => {
      const subMap = groupedSelections[category];
      const subcategories = Object.keys(subMap).sort((a, b) => a.localeCompare(b));
      return subcategories.map((subcategory) => ({
        category,
        subcategory,
        rows: subMap[subcategory],
      }));
    })
    .map(({ category, subcategory, rows }) =>
      renderCategoryBlock(
        subcategory && subcategory !== "General"
          ? `${getPdfCategoryDisplayName(category)} - ${subcategory}`
          : getPdfCategoryDisplayName(category),
        rows
      )
    )
    .join("");

  const flashingBlocks = (
    await Promise.all(
      flashingOrders.map(async (order, index) => {
        const svg = await generateSvgForFolds(order.folds || []);
        const girthMm = calculateGirth(order.folds || []);
        const orderItems = order.orderItems || [];
        const rows =
          orderItems.length === 0
            ? '<tr><td colspan="4">&nbsp;</td></tr>'
            : orderItems
                .map(
                  (item) =>
                    `<tr><td class="num">${escapeHtml(item.qty)}</td><td class="num">${escapeHtml(item.length)}</td><td>${escapeHtml(item.ref || "")}</td><td>${escapeHtml(item.finish || item.label || "")}</td></tr>`
                )
                .join("");
        return `<section class="flashing-block">
          <h3>Flashing ${index + 1} - Girth ${escapeHtml(girthMm)} mm</h3>
          <div class="flashing-grid">
            <div class="drawing-wrap">${svg || "<div>No drawing preview</div>"}</div>
            <table>
              <thead><tr><th class="num">Qty</th><th class="num">Length</th><th>REF</th><th>Finish</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
      })
    )
  ).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Roof Order Package</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #111827; font-size: 11px; }
      .sheet { width: 190mm; margin: 0 auto; }
      .top-title { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; margin: 0 0 6px 0; }
      .company { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
      .top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
      .line-row { display: grid; grid-template-columns: 110px 1fr; align-items: end; margin: 4px 0; }
      .line-label { font-weight: 700; }
      .line-value { border-bottom: 1px solid #111827; min-height: 18px; padding: 2px 4px; }
      .meta-right .line-row { grid-template-columns: 114px 1fr; }
      .section-title { margin: 12px 0 6px; font-size: 14px; }
      .category-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .category-block { break-inside: avoid; page-break-inside: avoid; }
      .category-block h3 { margin: 0 0 4px; font-size: 12px; }
      .flashing-block { margin-top: 10px; break-inside: avoid; page-break-inside: avoid; }
      .flashing-block h3 { margin: 0 0 5px; font-size: 12px; }
      .flashing-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px; }
      .drawing-wrap { border: 1px solid #4b5563; padding: 6px; min-height: 90px; background: #fff; }
      .drawing-wrap svg { width: 100%; height: auto; max-height: 170px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #4b5563; padding: 3px 5px; vertical-align: middle; }
      th { background: #f3f4f6; text-align: left; font-size: 10px; }
      td { font-size: 10px; }
      .num { text-align: right; width: 46px; }
      .item-header-row td { background: #eef3fb; font-weight: 700; text-align: left; }
      .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
      .notes-box, .legend-box { border: 1px solid #4b5563; min-height: 90px; padding: 6px; }
      .notes-title { font-size: 11px; font-weight: 700; margin-bottom: 5px; }
      .colour-row { margin: 3px 0; }
    </style>
  </head><body>
    <div class="sheet">
      <div class="company">ALLTOPS METAL ROOFING NSW PTY LTD</div>
      <div class="top-title">ORDER PACKAGE</div>

      <div class="top-grid">
        <div>
          <div class="line-row"><div class="line-label">Builder:</div><div class="line-value">${escapeHtml(orderInfo.builder)}</div></div>
          <div class="line-row"><div class="line-label">Deliver To:</div><div class="line-value">${escapeHtml(orderInfo.address)}</div></div>
          <div class="line-row"><div class="line-label">Supplier:</div><div class="line-value">${escapeHtml(supplier?.name || "")}</div></div>
        </div>
        <div class="meta-right">
          <div class="line-row"><div class="line-label">Order Number:</div><div class="line-value">${escapeHtml(orderInfo.orderNumber)}</div></div>
          <div class="line-row"><div class="line-label">Order Date:</div><div class="line-value">${escapeHtml(orderInfo.orderDate)}</div></div>
          <div class="line-row"><div class="line-label">Delivery Date:</div><div class="line-value">${escapeHtml(orderInfo.deliveryDate)}</div></div>
        </div>
      </div>

      <h2 class="section-title">Standard Items</h2>
      <div class="category-grid">${categoryBlocks || "<div>No standard items selected.</div>"}</div>

      <h2 class="section-title">Custom Flashings</h2>
      ${flashingBlocks || "<div>No custom flashing drawings saved.</div>"}

      <div class="footer-grid">
        <div class="notes-box">
          <div class="notes-title">Colours / Notes</div>
          <div class="colour-row">Roof: ${escapeHtml(orderInfo.roofColour)}</div>
          <div class="colour-row">Fascia: ${escapeHtml(orderInfo.fasciaColour)}</div>
          <div class="colour-row">Gutter: ${escapeHtml(orderInfo.gutterColour)}</div>
          <div class="colour-row" style="margin-top:8px;">${escapeHtml(orderInfo.notes)}</div>
        </div>
        <div class="legend-box">
          <div class="notes-title">Summary</div>
          <div>Total standard items: ${escapeHtml(standardSelections.length)}</div>
          <div>Total flashing drawings: ${escapeHtml(flashingOrders.length)}</div>
        </div>
      </div>
    </div>
  </body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  } else {
    alert("Unable to open print window (popup blocked?)");
  }
}
