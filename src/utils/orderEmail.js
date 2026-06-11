import { supabase } from "../lib/supabase";
import { calculateGirth } from "./geometry";

// Builds a plain-text order summary and opens the user's mail client (mailto)
// pre-addressed to the supplier. mailto cannot carry attachments, so the order
// details are written into the body as text.

function buildOrderEmail({ builder, address, order, supplier, standardSelections, flashingOrders }) {
  const items = standardSelections || [];
  const flashings = flashingOrders || [];

  const colourLine = [
    order.roof_colour ? `Roof: ${order.roof_colour}` : null,
    order.fascia_colour ? `Fascia: ${order.fascia_colour}` : null,
    order.gutter_colour ? `Gutter: ${order.gutter_colour}` : null,
  ].filter(Boolean).join("   ");

  const lines = [
    `Hi ${supplier?.name || "there"},`,
    "",
    `Please find our order below for ${builder || "the job"}${address ? ` — ${address}` : ""}.`,
    "",
    `Order: ${order.order_number || "—"}`,
    order.delivery_date ? `Delivery date: ${order.delivery_date}` : null,
    colourLine || null,
    "",
    "Items:",
    ...(items.length
      ? items.map((it) => {
          const len = it.length != null && it.length !== "" ? ` x ${it.length}mm` : "";
          const cat = [it.category, it.subcategory].filter((p) => p && p !== "General").join(" / ");
          return `  - ${cat ? `${cat}: ` : ""}${it.item || "item"} - qty ${it.qty}${len}`;
        })
      : ["  (none)"]),
  ];

  if (flashings.length) {
    lines.push("", "Custom flashings:");
    flashings.forEach((fo, i) => {
      lines.push(`  - Flashing ${i + 1} (girth ${calculateGirth(fo.folds || [])}mm)`);
      (fo.orderItems || []).forEach((oi) => {
        const parts = [`qty ${oi.qty} x ${oi.length}mm`, oi.ref, oi.finish].filter(Boolean);
        lines.push(`      ${parts.join(" - ")}`);
      });
    });
  }

  if (order.notes) lines.push("", `Notes: ${order.notes}`);
  lines.push("", "Thanks.");

  const subject = [address, order.delivery_date, order.order_number]
    .filter(Boolean)
    .join(", ");
  return { subject, body: lines.filter((l) => l !== null).join("\n") };
}

// Opens a mailto for an order whose data is already in memory.
export function openOrderEmail(args) {
  const email = args.supplier?.email;
  if (!email) {
    alert("No email on file for this order's supplier. Add one in Admin → Suppliers, or set a supplier on the order.");
    return;
  }
  const { subject, body } = buildOrderEmail(args);
  window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}

// Fetches an order (+ items, flashings, and its job address) by id, then opens
// the mailto. Used from list views where the order details aren't loaded yet.
export async function emailOrderById(orderId, suppliers) {
  const [orderRes, itemsRes, flashingsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", orderId).single(),
    supabase.from("order_items").select("*").eq("order_id", orderId).order("sort_order"),
    supabase.from("flashing_items").select("*").eq("order_id", orderId).order("sort_order"),
  ]);
  const o = orderRes.data;
  if (!o) { alert("Could not load order."); return; }

  let builder = o.builder || "";
  let address = o.site_address || "";
  if (o.job_id) {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("builder, site_address")
      .eq("id", o.job_id)
      .single();
    if (jobData) {
      builder = jobData.builder || builder;
      address = jobData.site_address || address;
    }
  }

  const supplier = suppliers.find((s) => s.id === o.supplier_id);
  const standardSelections = (itemsRes.data || []).map((row) => ({
    category: row.category,
    subcategory: row.subcategory,
    item: row.item,
    qty: row.qty,
    length: row.length,
  }));
  const flashingOrders = (flashingsRes.data || []).map((row) => ({
    folds: Array.isArray(row.folds_json) ? row.folds_json : [],
    orderItems: Array.isArray(row.order_items_json) ? row.order_items_json : [],
  }));

  openOrderEmail({ builder, address, order: o, supplier, standardSelections, flashingOrders });
}
