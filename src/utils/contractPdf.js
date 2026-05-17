const fmt = (n) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n || 0);

export function exportContractToPdf({ contract, job, orderNumber, supplierName }) {
  const lineItems = Array.isArray(contract.line_items_json) ? contract.line_items_json : [];
  const total = lineItems.reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);

  const lineRows = lineItems
    .map(
      (li) => `
      <tr>
        <td class="num">${li.qty}</td>
        <td>${li.description || ""}</td>
        <td class="num">${fmt(li.rate)}</td>
        <td class="num">${fmt((li.qty || 0) * (li.rate || 0))}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Install Contract</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; color: #111827; font-size: 11px; }
    .sheet { width: 182mm; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; border-bottom: 2px solid #111827; padding-bottom: 10px; }
    .title { font-size: 22px; font-weight: 700; letter-spacing: 0.3px; }
    .subtitle { font-size: 12px; color: #4b5563; margin-top: 2px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 16px; }
    .meta-block h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    .meta-block p { margin: 0; font-size: 11px; font-weight: 600; }
    .meta-block p.light { font-weight: 400; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #f3f4f6; text-align: left; font-size: 10px; border: 1px solid #d1d5db; padding: 4px 6px; }
    td { border: 1px solid #d1d5db; padding: 4px 6px; font-size: 10px; vertical-align: top; }
    .num { text-align: right; }
    .total-row td { font-weight: 700; background: #f9fafb; }
    .scope { margin-top: 12px; }
    .scope h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    .scope p { margin: 0; white-space: pre-wrap; font-size: 10px; color: #374151; border: 1px solid #d1d5db; padding: 6px; border-radius: 3px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 28px; }
    .sig-block { border-top: 1px solid #111827; padding-top: 6px; }
    .sig-block .label { font-size: 10px; color: #6b7280; }
    .sig-block .name { font-size: 10px; margin-top: 20px; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
  </head><body><div class="sheet">

    <div class="header">
      <div>
        <div class="title">Install Contract</div>
        <div class="subtitle">Subcontractor Agreement</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;color:#6b7280;">Order</div>
        <div style="font-weight:700;">${orderNumber || "—"}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-block">
        <h4>Site Address</h4>
        <p>${job?.site_address || "—"}</p>
        <p class="light" style="margin-top:2px;">${job?.builder ? `Builder: ${job.builder}` : ""}</p>
      </div>
      <div class="meta-block">
        <h4>Contractor</h4>
        <p>${contract.contractor_name || "—"}</p>
        <p class="light">${contract.contractor_email || ""}</p>
        ${supplierName ? `<p class="light">${supplierName}</p>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num" style="width:50px;">Qty</th>
          <th>Description</th>
          <th class="num" style="width:90px;">Rate</th>
          <th class="num" style="width:90px;">Total</th>
        </tr>
      </thead>
      <tbody>${lineRows || '<tr><td colspan="4" style="color:#9ca3af;text-align:center;">No line items</td></tr>'}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="3" class="num">Total</td>
          <td class="num">${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>

    ${
      contract.scope_notes
        ? `<div class="scope"><h4>Scope of Works</h4><p>${contract.scope_notes.replace(/</g, "&lt;")}</p></div>`
        : ""
    }

    <div class="signatures">
      <div class="sig-block">
        <div class="label">Authorised by (Company)</div>
        <div class="name">Name: _________________________</div>
        <div class="name" style="margin-top:6px;">Date: __________________________</div>
      </div>
      <div class="sig-block">
        <div class="label">Accepted by (Contractor)</div>
        <div class="name">Name: _________________________</div>
        <div class="name" style="margin-top:6px;">Date: __________________________</div>
      </div>
    </div>

  </div></body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Pop-up blocked. Please allow pop-ups for this site."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
