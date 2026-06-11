// Shared status orderings and human-readable labels for jobs and their
// related records (orders, invoices, contracts, purchase orders).

export const JOB_STATUS_ORDER = [
  "quoted",
  "ordered",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
];

export const JOB_STATUS_LABELS = {
  quoted: "Quoted",
  ordered: "Ordered",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  complete: "Complete",
  invoiced: "Invoiced",
};

export const ORDER_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  delivered: "Delivered",
  in_progress: "In Progress",
  complete: "Complete",
};

export const INVOICE_TYPE_LABELS = {
  deposit: "Deposit",
  progress: "Progress",
  final: "Final",
};

export const INVOICE_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

export const CONTRACT_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
};

export const PO_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  received: "Received",
};
