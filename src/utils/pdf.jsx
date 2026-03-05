import React from "react";
import ReactDOM from "react-dom/client";
import FlashingPreview from "../components/FlashingPreview";
import { calculateGirth } from "./geometry";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Render a preview offscreen and grab its SVG markup.
export async function generateSvgForFolds(folds) {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(<FlashingPreview folds={folds} />);

  await new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const svgEl = container.querySelector("svg");
      if (svgEl || Date.now() - start > 200) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    }
    check();
  });

  const svg = container.querySelector("svg")?.outerHTML || "";
  root.unmount();
  document.body.removeChild(container);
  return svg;
}

export async function exportOrderToPdf(order) {
  const svg = await generateSvgForFolds(order.folds);
  const girthMm = calculateGirth(order.folds || []);

  if (!svg) {
    alert("Unable to generate drawing SVG. Check that your profile has segments.");
    return;
  }

  const orderInfo = order.orderInfo || {};
  let html = `<!doctype html><html><head><meta charset="utf-8" /><title>Export</title>
    <style>
      body { font-family: sans-serif; margin: 20px; }
      .header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
      .header-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
      .header-label { font-weight: bold; color: #555; }
      .content { display: flex; gap: 30px; align-items: flex-start; }
      .drawing-container { flex: 1; }
      .drawing-container svg { max-width: 600px; }
      .table-container { flex: 0 0 auto; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 18px; }
      th { background: #f0f0f0; }
    </style>
  </head><body>`;

  if (orderInfo.orderNumber || orderInfo.address || orderInfo.orderDate || orderInfo.deliveryDate) {
    html += `<div class="header">
      ${orderInfo.orderNumber ? `<div class="header-row"><span class="header-label">Order #:</span>${escapeHtml(orderInfo.orderNumber)}</div>` : ""}
      ${orderInfo.address ? `<div class="header-row"><span class="header-label">Address:</span>${escapeHtml(orderInfo.address)}</div>` : ""}
      ${orderInfo.orderDate ? `<div class="header-row"><span class="header-label">Order Date:</span>${escapeHtml(orderInfo.orderDate)}</div>` : ""}
      ${orderInfo.deliveryDate ? `<div class="header-row"><span class="header-label">Delivery Date:</span>${escapeHtml(orderInfo.deliveryDate)}</div>` : ""}
      <div class="header-row"><span class="header-label">Girth:</span>${escapeHtml(girthMm)} mm</div>
    </div>`;
  }

  html += `<div class="content"><div class="drawing-container">${svg}</div><div class="table-container"><table>`;
  html += `<tr><th>Qty</th><th>Length</th><th>REF</th><th>Finish</th></tr>`;
  order.orderItems.forEach((item) => {
    html += `<tr><td>${escapeHtml(item.qty)}</td><td>${escapeHtml(item.length)}</td><td>${escapeHtml(item.ref || "")}</td><td>${escapeHtml(item.finish || item.label || "")}</td></tr>`;
  });
  html += `</table></div></div></body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 200);
  } else {
    alert("Unable to open export window (popup blocked?)");
  }
}

export async function exportAllOrdersToPdf(orders) {
  if (orders.length === 0) {
    alert("No orders to export");
    return;
  }

  let html = `<!doctype html><html><head><meta charset="utf-8" /><title>All Orders</title>
    <style>
      @page { size: 8.5in 11in portrait; margin: 0.5in; }
      body { font-family: sans-serif; margin: 10px; padding: 0; }
      .page { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; page-break-after: always; padding: 10px; }
      .order-item { border: 2px solid #333; padding: 10px; display: flex; flex-direction: column; gap: 10px; page-break-inside: avoid; }
      .order-header { border-bottom: 1px solid #999; padding-bottom: 8px; margin-bottom: 8px; font-size: 10px; color: #555; }
      .header-row { display: flex; gap: 15px; margin-bottom: 4px; }
      .header-col { flex: 1; }
      .header-label { font-weight: bold; color: #333; }
      .item-content { display: flex; flex-direction: row; gap: 10px; }
      .drawing-container { flex-shrink: 0; display: flex; justify-content: center; min-width: 240px; }
      .drawing-container svg { max-width: 240px; max-height: 180px; }
      table { border-collapse: collapse; width: auto; flex-shrink: 0; }
      th, td { border: 1px solid #999; padding: 4px; text-align: left; font-size: 11px; white-space: nowrap; }
      th { background: #e8e8e8; }
    </style>
  </head><body>`;

  let itemsOnCurrentPage = 0;
  let currentPageHtml = `<div class="page">`;

  for (const order of orders) {
    const svg = await generateSvgForFolds(order.folds);
    const girthMm = calculateGirth(order.folds || []);
    if (!svg) {
      continue;
    }

    const orderInfo = order.orderInfo || {};
    const headerHtml =
      orderInfo.orderNumber || orderInfo.address
        ? `<div class="order-header">
      ${orderInfo.orderNumber ? `<div class="header-row"><span class="header-label">Order #:</span><span>${escapeHtml(orderInfo.orderNumber)}</span></div>` : ""}
      ${orderInfo.address ? `<div class="header-row"><span class="header-label">To:</span><span>${escapeHtml(orderInfo.address)}</span></div>` : ""}
      <div class="header-row"><span class="header-label">Girth:</span><span>${escapeHtml(girthMm)} mm</span></div>
      <div class="header-row">
        ${orderInfo.orderDate ? `<div class="header-col"><span class="header-label">Order:</span>${escapeHtml(orderInfo.orderDate)}</div>` : ""}
        ${orderInfo.deliveryDate ? `<div class="header-col"><span class="header-label">Delivery:</span>${escapeHtml(orderInfo.deliveryDate)}</div>` : ""}
      </div>
    </div>`
        : "";

    const itemHtml = `<div class="order-item">
      ${headerHtml}
      <div class="item-content">
        <div class="drawing-container">${svg}</div>
        <table>
          <tr><th>Qty</th><th>Length</th><th>REF</th><th>Finish</th></tr>
          ${order.orderItems
            .map(
              (item) =>
                `<tr><td>${escapeHtml(item.qty)}</td><td>${escapeHtml(item.length)}</td><td>${escapeHtml(item.ref || "")}</td><td>${escapeHtml(item.finish || item.label || "")}</td></tr>`
            )
            .join("")}
        </table>
      </div>
    </div>`;

    currentPageHtml += itemHtml;
    itemsOnCurrentPage += 1;

    // 4 items per page (2 columns x 2 rows).
    if (itemsOnCurrentPage >= 4) {
      currentPageHtml += `</div>`;
      html += currentPageHtml;
      currentPageHtml = `<div class="page">`;
      itemsOnCurrentPage = 0;
    }
  }

  if (itemsOnCurrentPage > 0) {
    currentPageHtml += `</div>`;
    html += currentPageHtml;
  }

  html += `</body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  } else {
    alert("Unable to open export window (popup blocked?)");
  }
}
