import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { exportCombinedOrderToPdf } from "../utils/orderFormPdf";
import { exportContractToPdf } from "../utils/contractPdf";
import { formatCurrency as fmt, formatBytes as fmtBytes } from "../utils/format";
import {
  JOB_STATUS_ORDER as STATUS_ORDER,
  JOB_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PO_STATUS_LABELS,
} from "../utils/statuses";
import "../styles/JobDetail.css";

const STORAGE_BUCKET = "job-files";
const FILE_CATEGORIES = ["Plan", "Order", "Contract", "Other"];

function generateOrderNumber(existingOrders, jobNumber) {
  const prefix = jobNumber ? `${jobNumber}-ORD` : "ORD";
  const nums = existingOrders.map((o) => {
    const m = o.order_number?.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(2, "0")}`;
}

function generateInvoiceNumber(existingInvoices, jobNumber) {
  const prefix = jobNumber || "JOB";
  const nums = existingInvoices.map((inv) => {
    const m = inv.invoice_number?.match(/INV(\d+)$/i);
    return m ? parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-INV${String(next).padStart(2, "0")}`;
}

function generatePoNumber(existingPos, order) {
  const base = `${order?.order_number || order?.id?.slice(0, 8) || "ORD"}-PO`;
  const sameOrder = existingPos.filter((po) => po.order_id === order?.id);
  return sameOrder.length === 0 ? base : `${base}${sameOrder.length + 1}`;
}

function emptyLineItem() {
  return { qty: "1", description: "", rate: "" };
}

// Opens the user's mail client with a pre-filled install-contract email.
function openContractEmail(contract, job, orderNumber) {
  if (!contract.contractor_email) return;
  const lineItems = Array.isArray(contract.line_items_json) ? contract.line_items_json : [];
  const total = lineItems.reduce((s, li) => s + (li.qty || 0) * (li.rate || 0), 0);
  const subject = `Install Contract — ${job?.site_address || ""}${orderNumber ? ` (${orderNumber})` : ""}`;
  const body = [
    `Hi ${contract.contractor_name || ""},`,
    "",
    `Please find your install contract details below for the job at ${job?.site_address || "the site"}.`,
    "",
    `Order: ${orderNumber}`,
    `Total: ${fmt(total)}`,
    "",
    contract.scope_notes ? `Scope:\n${contract.scope_notes}` : "",
    "",
    "Please confirm your acceptance of this contract.",
  ].join("\n");
  window.open(
    `mailto:${contract.contractor_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

export default function JobDetail({ jobId, onBack, onSelectOrder, suppliers, userId }) {
  const [job, setJob] = useState(null);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("info");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // File upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newFileCategory, setNewFileCategory] = useState("Plan");
  const fileInputRef = useRef(null);

  // New order modal
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({ order_number: "", supplier_id: "", delivery_date: "", notes: "" });
  const [orderSource, setOrderSource] = useState("build"); // 'build' | 'upload'
  const [orderUploadFile, setOrderUploadFile] = useState(null);
  const [orderUploadStatus, setOrderUploadStatus] = useState("delivered");
  const orderFileRef = useRef(null);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Invoice modal
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ type: "deposit", amount: "", notes: "" });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Contract modal (create)
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractForm, setContractForm] = useState({ order_id: "", supplier_id: "", contractor_name: "", contractor_email: "", scope_notes: "" });
  const [contractLineItems, setContractLineItems] = useState([emptyLineItem()]);
  const [creatingContract, setCreatingContract] = useState(false);

  // Contract modal (edit)
  const [showEditContractModal, setShowEditContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [editContractForm, setEditContractForm] = useState({ supplier_id: "", contractor_name: "", contractor_email: "", scope_notes: "" });
  const [editContractLineItems, setEditContractLineItems] = useState([emptyLineItem()]);
  const [savingContract, setSavingContract] = useState(false);

  // PO modal
  const [showPoForm, setShowPoForm] = useState(false);
  const [poForm, setPoForm] = useState({ order_id: "", notes: "" });
  const [creatingPo, setCreatingPo] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [jobRes, ordersRes, invoicesRes, contractsRes, posRes, filesRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).single(),
      supabase.from("orders").select("id, order_number, supplier_id, status, delivery_date, file_path, created_at").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("invoices").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("install_contracts").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("purchase_orders").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("job_files").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
    ]);

    if (jobRes.data) {
      setJob(jobRes.data);
      setEditForm(jobRes.data);
    }
    setOrders(ordersRes.data || []);
    setInvoices(invoicesRes.data || []);
    setContracts(contractsRes.data || []);
    setPurchaseOrders(posRes.data || []);
    setFiles(filesRes.data || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((p) => ({ ...p, [name]: value }));
  };

  const handleSaveJob = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("jobs")
      .update({
        job_number: editForm.job_number,
        builder: editForm.builder,
        site_address: editForm.site_address,
        total_amount: parseFloat(editForm.total_amount) || 0,
        status: editForm.status,
        notes: editForm.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    setSaving(false);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setJob(data);
    setEditForm(data);
    setEditMode(false);
  };

  // ── Orders ──
  const openNewOrder = () => {
    setOrderForm({
      order_number: generateOrderNumber(orders, job?.job_number),
      supplier_id: suppliers[0]?.id || "",
      delivery_date: "",
      notes: "",
    });
    setOrderSource("build");
    setOrderUploadFile(null);
    setOrderUploadStatus("delivered");
    setShowOrderForm(true);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (orderSource === "upload" && !orderUploadFile) {
      alert("Select a file to upload.");
      return;
    }
    setCreatingOrder(true);
    try {
      const status = orderSource === "upload" ? orderUploadStatus : "draft";
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([{
          job_id: jobId,
          owner_id: userId,
          order_number: orderForm.order_number.trim(),
          supplier_id: orderForm.supplier_id || null,
          delivery_date: orderForm.delivery_date || null,
          notes: orderForm.notes.trim(),
          status,
        }])
        .select("id, order_number, supplier_id, status, delivery_date, file_path, created_at")
        .single();
      if (orderError) throw orderError;

      if (orderSource === "upload" && orderUploadFile) {
        const path = `orders/${userId}/${orderData.id}/${orderUploadFile.name}`;
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, orderUploadFile);
        if (uploadError) throw uploadError;
        const { data: updated, error: updateError } = await supabase
          .from("orders")
          .update({ file_path: path })
          .eq("id", orderData.id)
          .select("id, order_number, supplier_id, status, delivery_date, file_path, created_at")
          .single();
        if (updateError) throw updateError;
        setOrders((prev) => [...prev, updated]);
        setShowOrderForm(false);
      } else {
        setOrders((prev) => [...prev, orderData]);
        setShowOrderForm(false);
        if (job?.status === "quoted") {
          await supabase.from("jobs").update({ status: "ordered", updated_at: new Date().toISOString() }).eq("id", jobId);
          setJob((p) => p ? { ...p, status: "ordered" } : p);
        }
        onSelectOrder(orderData.id);
      }
    } catch (err) {
      alert(`Could not create order: ${err.message}`);
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleDeleteOrder = async (e, orderId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this order and all its items? Cannot be undone.")) return;
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  const updateOrderStatus = async (id, status) => {
    const { data, error } = await supabase.from("orders").update({ status }).eq("id", id).select("*").single();
    if (error) { alert(error.message); return; }
    setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
  };

  const handleOpenFile = async (path) => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      alert(`Could not open file: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Fetches an order with its items + flashings and renders the combined PDF.
  const exportOrderPdf = useCallback(async (orderId) => {
    const [orderRes, itemsRes, flashingsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("sort_order"),
      supabase.from("flashing_items").select("*").eq("order_id", orderId).order("sort_order"),
    ]);
    const o = orderRes.data;
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
    await exportCombinedOrderToPdf({
      orderInfo: {
        builder: job.builder || "",
        address: job.site_address || "",
        orderNumber: o.order_number || "",
        deliveryDate: o.delivery_date || "",
        roofColour: o.roof_colour || "",
        fasciaColour: o.fascia_colour || "",
        gutterColour: o.gutter_colour || "",
        notes: o.notes || "",
      },
      supplier,
      standardSelections,
      flashingOrders,
      createdAt: Date.now(),
    });
  }, [job, suppliers]);

  const handleOrderClick = async (order) => {
    if (order.file_path) {
      handleOpenFile(order.file_path);
      return;
    }
    if (order.status === "draft") {
      onSelectOrder(order.id);
      return;
    }
    setGeneratingPdf(true);
    try {
      await exportOrderPdf(order.id);
    } catch (err) {
      alert(`PDF generation failed: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ── Invoices ──
  const totalInvoiced = invoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0);
  const invoiceRemaining = (parseFloat(job?.total_amount) || 0) - totalInvoiced;

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    const amount = parseFloat(invoiceForm.amount) || 0;
    if (amount <= 0) { alert("Enter a valid amount."); return; }
    if (amount > invoiceRemaining + 0.005) {
      alert(`Amount exceeds remaining balance of ${fmt(invoiceRemaining)}.`);
      return;
    }
    setCreatingInvoice(true);
    const invoice_number = generateInvoiceNumber(invoices, job.job_number);
    const { data, error } = await supabase
      .from("invoices")
      .insert([{
        job_id: jobId,
        owner_id: userId,
        invoice_number,
        type: invoiceForm.type,
        amount,
        notes: invoiceForm.notes,
        status: "draft",
      }])
      .select("*")
      .single();
    setCreatingInvoice(false);
    if (error) { alert(`Could not create invoice: ${error.message}`); return; }
    setInvoices((prev) => [...prev, data]);
    setShowInvoiceForm(false);
  };

  const updateInvoiceStatus = async (id, status) => {
    const updates = { status };
    if (status === "sent") updates.sent_at = new Date().toISOString();
    if (status === "paid") updates.paid_at = new Date().toISOString();
    const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select("*").single();
    if (error) { alert(`Could not update: ${error.message}`); return; }
    setInvoices((prev) => prev.map((i) => (i.id === id ? data : i)));
  };

  const deleteInvoice = async (id) => {
    if (!window.confirm("Delete this invoice?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  // ── Contracts ──
  const contractTotal = contractLineItems.reduce(
    (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0),
    0
  );

  const openNewContract = () => {
    setContractForm({ order_id: orders[0]?.id || "", supplier_id: "", contractor_name: "", contractor_email: "", scope_notes: "" });
    setContractLineItems([emptyLineItem()]);
    setShowContractForm(true);
  };

  const openEditContract = (contract) => {
    setEditingContract(contract);
    setEditContractForm({
      supplier_id: contract.supplier_id || "",
      contractor_name: contract.contractor_name || "",
      contractor_email: contract.contractor_email || "",
      scope_notes: contract.scope_notes || "",
    });
    const items = Array.isArray(contract.line_items_json) && contract.line_items_json.length
      ? contract.line_items_json.map((li) => ({ qty: String(li.qty), description: li.description, rate: String(li.rate) }))
      : [emptyLineItem()];
    setEditContractLineItems(items);
    setShowEditContractModal(true);
  };

  const handleCreateContract = async (e) => {
    e.preventDefault();
    if (!contractForm.order_id) { alert("Select an order."); return; }
    setCreatingContract(true);
    const lineItems = contractLineItems
      .filter((li) => li.description.trim())
      .map((li) => ({ qty: parseFloat(li.qty) || 0, description: li.description.trim(), rate: parseFloat(li.rate) || 0 }));
    const amount = lineItems.reduce((s, li) => s + li.qty * li.rate, 0);
    const { data, error } = await supabase
      .from("install_contracts")
      .insert([{
        order_id: contractForm.order_id,
        job_id: jobId,
        owner_id: userId,
        supplier_id: contractForm.supplier_id || null,
        contractor_name: contractForm.contractor_name,
        contractor_email: contractForm.contractor_email,
        scope_notes: contractForm.scope_notes,
        line_items_json: lineItems,
        amount,
        status: "draft",
      }])
      .select("*")
      .single();
    setCreatingContract(false);
    if (error) { alert(`Could not create contract: ${error.message}`); return; }
    setContracts((prev) => [...prev, data]);
    setShowContractForm(false);
    openContractEmail(data, job, getOrderNumber(data.order_id));
  };

  const handleSaveContract = async (e) => {
    e.preventDefault();
    setSavingContract(true);
    const lineItems = editContractLineItems
      .filter((li) => li.description.trim())
      .map((li) => ({ qty: parseFloat(li.qty) || 0, description: li.description.trim(), rate: parseFloat(li.rate) || 0 }));
    const amount = lineItems.reduce((s, li) => s + li.qty * li.rate, 0);
    const { data, error } = await supabase
      .from("install_contracts")
      .update({
        supplier_id: editContractForm.supplier_id || null,
        contractor_name: editContractForm.contractor_name,
        contractor_email: editContractForm.contractor_email,
        scope_notes: editContractForm.scope_notes,
        line_items_json: lineItems,
        amount,
      })
      .eq("id", editingContract.id)
      .select("*")
      .single();
    setSavingContract(false);
    if (error) { alert(error.message); return; }
    setContracts((prev) => prev.map((c) => (c.id === editingContract.id ? data : c)));
    setShowEditContractModal(false);
  };

  const updateContractStatus = async (id, status) => {
    const { data, error } = await supabase.from("install_contracts").update({ status }).eq("id", id).select("*").single();
    if (error) { alert(error.message); return; }
    setContracts((prev) => prev.map((c) => (c.id === id ? data : c)));
  };

  const deleteContract = async (id) => {
    if (!window.confirm("Delete this contract?")) return;
    const { error } = await supabase.from("install_contracts").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setContracts((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Purchase Orders ──
  const openNewPo = () => {
    setPoForm({ order_id: orders[0]?.id || "", notes: "" });
    setShowPoForm(true);
  };

  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!poForm.order_id) { alert("Select an order."); return; }
    setCreatingPo(true);
    const selectedOrder = orders.find((o) => o.id === poForm.order_id);
    const po_number = generatePoNumber(purchaseOrders, selectedOrder || { id: poForm.order_id });
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert([{
        order_id: poForm.order_id,
        job_id: jobId,
        owner_id: userId,
        supplier_id: selectedOrder?.supplier_id || null,
        po_number,
        notes: poForm.notes,
        status: "draft",
      }])
      .select("*")
      .single();
    setCreatingPo(false);
    if (error) { alert(`Could not create PO: ${error.message}`); return; }
    setPurchaseOrders((prev) => [...prev, data]);
    setShowPoForm(false);
  };

  const updatePoStatus = async (id, status) => {
    const updates = { status };
    if (status === "sent") updates.sent_at = new Date().toISOString();
    const { data, error } = await supabase.from("purchase_orders").update(updates).eq("id", id).select("*").single();
    if (error) { alert(error.message); return; }
    setPurchaseOrders((prev) => prev.map((p) => (p.id === id ? data : p)));
  };

  const deletePo = async (id) => {
    if (!window.confirm("Delete this PO?")) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setPurchaseOrders((prev) => prev.filter((p) => p.id !== id));
  };

  const handleExportPoPdf = async (po) => {
    setGeneratingPdf(true);
    try {
      await exportOrderPdf(po.order_id);
    } catch (err) {
      alert(`PDF export failed: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ── Job Files ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const path = `files/${userId}/${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      const { data: fileData, error: dbError } = await supabase
        .from("job_files")
        .insert([{
          job_id: jobId,
          owner_id: userId,
          name: file.name,
          category: newFileCategory,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        }])
        .select("*")
        .single();
      if (dbError) throw dbError;
      setFiles((prev) => [...prev, fileData]);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.name}"?`)) return;
    await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path]);
    await supabase.from("job_files").delete().eq("id", file.id);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  };

  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const getOrderNumber = (id) => orders.find((o) => o.id === id)?.order_number || id?.slice(0, 8) || "—";
  const getFileIcon = (mime) => {
    if (!mime) return "DOC";
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("image")) return "IMG";
    if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "XLS";
    if (mime.includes("word") || mime.includes("document")) return "DOC";
    return "FILE";
  };

  if (loading) return <div className="job-detail-loading">Loading job...</div>;
  if (!job) return <div className="job-detail-loading">Job not found.</div>;

  const TABS = [
    { key: "info", label: "Info" },
    { key: "orders", label: `Orders (${orders.length})` },
    { key: "files", label: `Files (${files.length})` },
    { key: "contracts", label: `Contracts (${contracts.length})` },
    { key: "pos", label: `POs (${purchaseOrders.length})` },
    { key: "invoices", label: `Invoices (${invoices.length})` },
  ];

  return (
    <div className="job-detail-page">
      {generatingPdf && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="modal-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <p style={{ margin: 0, color: "#17253c", fontWeight: 700, fontSize: 16 }}>Generating PDF…</p>
          </div>
        </div>
      )}

      <div className="job-detail-breadcrumb">
        <button className="breadcrumb-back" onClick={onBack}>← Jobs</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{job.job_number || "Job"} — {job.builder}</span>
      </div>

      <div className="job-detail-head">
        <div className="job-detail-head-info">
          <h1 className="job-detail-title">{job.builder}</h1>
          <p className="job-detail-address">{job.site_address}</p>
        </div>
        <div className="job-detail-head-meta">
          <span className={`status-badge ${job.status}`}>{STATUS_LABELS[job.status] || job.status}</span>
          <span className="job-detail-amount">{fmt(job.total_amount)}</span>
        </div>
      </div>

      <div className="job-detail-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="job-detail-body">

        {/* ── Info ── */}
        {activeTab === "info" && (
          <div className="info-tab">
            {editMode ? (
              <div className="info-edit-form">
                <div className="form-grid-2">
                  <div className="form-row">
                    <label>Job Number</label>
                    <input name="job_number" value={editForm.job_number || ""} onChange={handleEditChange} />
                  </div>
                  <div className="form-row">
                    <label>Status</label>
                    <select name="status" value={editForm.status} onChange={handleEditChange}>
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Builder / Customer</label>
                    <input name="builder" value={editForm.builder || ""} onChange={handleEditChange} />
                  </div>
                  <div className="form-row">
                    <label>Total Job Amount ($)</label>
                    <input name="total_amount" type="number" min="0" step="0.01" value={editForm.total_amount || ""} onChange={handleEditChange} />
                  </div>
                  <div className="form-row form-row-full">
                    <label>Site Address</label>
                    <input name="site_address" value={editForm.site_address || ""} onChange={handleEditChange} />
                  </div>
                  <div className="form-row form-row-full">
                    <label>Notes</label>
                    <textarea name="notes" rows={4} value={editForm.notes || ""} onChange={handleEditChange} />
                  </div>
                </div>
                <div className="info-edit-actions">
                  <button className="btn btn-secondary" onClick={() => { setEditMode(false); setEditForm(job); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveJob} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="info-view">
                <div className="info-grid">
                  <div className="info-field">
                    <span className="info-label">Job Number</span>
                    <span className="info-value">{job.job_number || "—"}</span>
                  </div>
                  <div className="info-field">
                    <span className="info-label">Status</span>
                    <span className={`status-badge ${job.status}`}>{STATUS_LABELS[job.status]}</span>
                  </div>
                  <div className="info-field">
                    <span className="info-label">Builder</span>
                    <span className="info-value">{job.builder || "—"}</span>
                  </div>
                  <div className="info-field">
                    <span className="info-label">Total Amount</span>
                    <span className="info-value info-amount">{fmt(job.total_amount)}</span>
                  </div>
                  <div className="info-field form-row-full">
                    <span className="info-label">Site Address</span>
                    <span className="info-value">{job.site_address || "—"}</span>
                  </div>
                  <div className="info-field form-row-full">
                    <span className="info-label">Notes</span>
                    <span className="info-value info-notes">{job.notes || "—"}</span>
                  </div>
                </div>
                <div className="info-actions">
                  <button className="btn btn-secondary" onClick={() => setEditMode(true)}>Edit Job</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Orders ── */}
        {activeTab === "orders" && (
          <div className="orders-tab">
            <div className="orders-tab-header">
              <h3>Material Orders</h3>
              <button className="btn btn-primary" onClick={openNewOrder}>+ New Order</button>
            </div>
            {orders.length === 0 ? (
              <div className="orders-empty">
                <p>No orders yet. Create one to start adding materials.</p>
                <button className="btn btn-primary" onClick={openNewOrder}>+ New Order</button>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div key={order.id} className="order-card" onClick={() => handleOrderClick(order)}>
                    <div className="order-card-head">
                      <div>
                        <span className="order-number">{order.order_number || "—"}</span>
                        <span className={`status-badge ${order.status}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
                        {order.file_path && <span className="order-file-hint">File ↗</span>}
                        {!order.file_path && order.status !== "draft" && <span className="order-pdf-hint">PDF ↗</span>}
                      </div>
                      <div className="order-card-actions-right">
                        {order.status === "delivered" && (
                          <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, "in_progress"); }}>Mark In Progress</button>
                        )}
                        {order.status === "in_progress" && (
                          <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, "delivered"); }}>↩ Delivered</button>
                        )}
                        {order.status === "in_progress" && (
                          <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, "complete"); }}>Mark Complete</button>
                        )}
                        {order.status === "complete" && (
                          <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, "in_progress"); }}>↩ In Progress</button>
                        )}
                        {(order.status !== "draft" || order.file_path) && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => { e.stopPropagation(); onSelectOrder(order.id); }}
                          >Edit</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={(e) => handleDeleteOrder(e, order.id)}>Delete</button>
                      </div>
                    </div>
                    <div className="order-card-body" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div className="order-meta-row">
                        <span className="order-meta-label">Supplier</span>
                        <span>{getSupplierName(order.supplier_id)}</span>
                      </div>
                      <div className="order-meta-row">
                        <span className="order-meta-label">Delivery</span>
                        <span>{order.delivery_date || "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Files ── */}
        {activeTab === "files" && (
          <div className="files-tab">
            <div className="files-upload-bar">
              <select
                value={newFileCategory}
                onChange={(e) => setNewFileCategory(e.target.value)}
                className="files-category-select"
              >
                {FILE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                {uploadingFile ? "Uploading..." : "+ Upload File"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
            </div>

            {files.length === 0 ? (
              <div className="orders-empty">
                <p>No files uploaded yet. Upload plans, drawings, or other documents.</p>
              </div>
            ) : (
              <div className="files-list">
                {files.map((file) => (
                  <div key={file.id} className="file-row">
                    <div className="file-row-icon">{getFileIcon(file.mime_type)}</div>
                    <div className="file-row-info">
                      <span className="file-row-name">{file.name}</span>
                      <span className="file-row-meta">
                        <span className={`file-cat-badge cat-${file.category?.toLowerCase()}`}>{file.category}</span>
                        {file.size_bytes > 0 && <span className="file-row-size">{fmtBytes(file.size_bytes)}</span>}
                        <span className="file-row-date">{new Date(file.created_at).toLocaleDateString("en-AU")}</span>
                      </span>
                    </div>
                    <div className="file-row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleOpenFile(file.storage_path)}>Open</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteFile(file)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Contracts ── */}
        {activeTab === "contracts" && (
          <div className="contracts-tab">
            <div className="orders-tab-header">
              <h3>Install Contracts</h3>
              <button className="btn btn-primary" onClick={openNewContract} disabled={orders.length === 0}>
                + New Contract
              </button>
            </div>
            {orders.length === 0 && (
              <div className="orders-empty"><p>Create an order before adding an install contract.</p></div>
            )}
            {orders.length > 0 && contracts.length === 0 && (
              <div className="orders-empty"><p>No contracts yet.</p></div>
            )}
            <div className="orders-list">
              {contracts.map((contract) => {
                const lineItems = Array.isArray(contract.line_items_json) ? contract.line_items_json : [];
                const total = lineItems.reduce((s, li) => s + (li.qty * li.rate), 0);
                return (
                  <div key={contract.id} className="order-card">
                    <div className="order-card-head">
                      <div>
                        <span className="order-number">{contract.contractor_name || "Contract"}</span>
                        <span className={`status-badge ${contract.status}`}>{CONTRACT_STATUS_LABELS[contract.status] || contract.status}</span>
                        {contract.order_id && (
                          <span style={{ marginLeft: 8, fontSize: "0.82em", color: "#6b7280", fontWeight: 500 }}>
                            {getOrderNumber(contract.order_id)}
                          </span>
                        )}
                      </div>
                      <div className="order-card-actions-right">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => exportContractToPdf({
                            contract,
                            job,
                            orderNumber: getOrderNumber(contract.order_id),
                            supplierName: getSupplierName(contract.supplier_id),
                          })}
                        >View PDF</button>
                        {contract.contractor_email && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openContractEmail(contract, job, getOrderNumber(contract.order_id))}
                          >Email</button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditContract(contract)}>Edit</button>
                        {contract.status === "draft" && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateContractStatus(contract.id, "sent")}>Mark Sent</button>
                        )}
                        {contract.status === "sent" && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateContractStatus(contract.id, "signed")}>Mark Signed</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => deleteContract(contract.id)}>Delete</button>
                      </div>
                    </div>
                    <div className="order-card-body" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                      <div className="order-meta-row">
                        <span className="order-meta-label">Order</span>
                        <span>{getOrderNumber(contract.order_id)}</span>
                      </div>
                      <div className="order-meta-row">
                        <span className="order-meta-label">Email</span>
                        <span>{contract.contractor_email || "—"}</span>
                      </div>
                      <div className="order-meta-row">
                        <span className="order-meta-label">Total</span>
                        <span style={{ fontWeight: 700 }}>{fmt(total)}</span>
                      </div>
                    </div>
                    {lineItems.length > 0 && (
                      <div className="contract-items-preview">
                        <table className="contract-items-table">
                          <thead>
                            <tr><th>Qty</th><th>Description</th><th>Rate</th><th>Total</th></tr>
                          </thead>
                          <tbody>
                            {lineItems.map((li, i) => (
                              <tr key={i}>
                                <td>{li.qty}</td>
                                <td>{li.description}</td>
                                <td>{fmt(li.rate)}</td>
                                <td>{fmt(li.qty * li.rate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {contract.scope_notes && (
                      <div className="card-notes">{contract.scope_notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Purchase Orders ── */}
        {activeTab === "pos" && (
          <div className="pos-tab">
            <div className="orders-tab-header">
              <h3>Purchase Orders</h3>
              <button className="btn btn-primary" onClick={openNewPo} disabled={orders.length === 0}>
                + New PO
              </button>
            </div>
            {orders.length === 0 && (
              <div className="orders-empty"><p>Create an order before adding a purchase order.</p></div>
            )}
            {orders.length > 0 && purchaseOrders.length === 0 && (
              <div className="orders-empty"><p>No purchase orders yet.</p></div>
            )}
            <div className="orders-list">
              {purchaseOrders.map((po) => (
                <div key={po.id} className="order-card">
                  <div className="order-card-head">
                    <div>
                      <span className="order-number">{po.po_number}</span>
                      <span className={`status-badge ${po.status}`}>{PO_STATUS_LABELS[po.status] || po.status}</span>
                    </div>
                    <div className="order-card-actions-right">
                      {po.status === "draft" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updatePoStatus(po.id, "sent")}>Mark Sent</button>
                      )}
                      {po.status === "sent" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updatePoStatus(po.id, "received")}>Mark Received</button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => handleExportPoPdf(po)}>Export PDF</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deletePo(po.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="order-card-body" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <div className="order-meta-row">
                      <span className="order-meta-label">Order</span>
                      <span>{getOrderNumber(po.order_id)}</span>
                    </div>
                    <div className="order-meta-row">
                      <span className="order-meta-label">Supplier</span>
                      <span>{getSupplierName(po.supplier_id)}</span>
                    </div>
                    <div className="order-meta-row">
                      <span className="order-meta-label">Sent</span>
                      <span>{po.sent_at ? new Date(po.sent_at).toLocaleDateString("en-AU") : "—"}</span>
                    </div>
                  </div>
                  {po.notes && <div className="card-notes">{po.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Invoices ── */}
        {activeTab === "invoices" && (
          <div className="invoices-tab">
            <div className="invoices-tab-header">
              <h3>Invoices</h3>
              <button className="btn btn-primary" onClick={() => { setInvoiceForm({ type: "deposit", amount: "", notes: "" }); setShowInvoiceForm(true); }}>
                + New Invoice
              </button>
            </div>

            <div className="invoices-info-box">
              <p>
                Job total: <strong>{fmt(job.total_amount)}</strong>
                &nbsp;·&nbsp;Invoiced: <strong>{fmt(totalInvoiced)}</strong>
                &nbsp;·&nbsp;Remaining: <strong style={{ color: invoiceRemaining < -0.005 ? "#dc2626" : "inherit" }}>{fmt(invoiceRemaining)}</strong>
              </p>
            </div>

            {invoices.length === 0 ? (
              <div className="orders-empty"><p>No invoices yet.</p></div>
            ) : (
              <div className="invoices-list">
                {invoices.map((inv) => (
                  <div key={inv.id} className="invoice-card">
                    <div className="invoice-card-head">
                      <div>
                        <span className="invoice-number">{inv.invoice_number}</span>
                        <span className="invoice-type-badge">{INVOICE_TYPE_LABELS[inv.type] || inv.type}</span>
                        <span className={`status-badge ${inv.status}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                      </div>
                      <span className="invoice-amount">{fmt(inv.amount)}</span>
                    </div>
                    <div className="invoice-card-actions">
                      {inv.status === "draft" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updateInvoiceStatus(inv.id, "sent")}>Mark Sent</button>
                      )}
                      {inv.status === "sent" && (
                        <button className="btn btn-success btn-sm" onClick={() => updateInvoiceStatus(inv.id, "paid")}>Mark Paid</button>
                      )}
                      {inv.sent_at && (
                        <span className="invoice-date-info">Sent {new Date(inv.sent_at).toLocaleDateString("en-AU")}</span>
                      )}
                      {inv.paid_at && (
                        <span className="invoice-date-info">Paid {new Date(inv.paid_at).toLocaleDateString("en-AU")}</span>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => deleteInvoice(inv.id)}>Delete</button>
                    </div>
                    {inv.notes && <div className="card-notes">{inv.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New Order Modal ── */}
      {showOrderForm && (
        <div className="modal-overlay" onClick={() => setShowOrderForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Order</h2>

            {/* Source toggle */}
            <div className="order-source-toggle">
              <button
                type="button"
                className={`source-btn ${orderSource === "build" ? "active" : ""}`}
                onClick={() => setOrderSource("build")}
              >Build in app</button>
              <button
                type="button"
                className={`source-btn ${orderSource === "upload" ? "active" : ""}`}
                onClick={() => setOrderSource("upload")}
              >Upload existing</button>
            </div>

            <form onSubmit={handleCreateOrder} className="job-form">
              <div className="form-row">
                <label>Order Number</label>
                <input
                  value={orderForm.order_number}
                  onChange={(e) => setOrderForm((p) => ({ ...p, order_number: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>Supplier</label>
                <select
                  value={orderForm.supplier_id}
                  onChange={(e) => setOrderForm((p) => ({ ...p, supplier_id: e.target.value }))}
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Delivery Date</label>
                <input
                  type="date"
                  value={orderForm.delivery_date}
                  onChange={(e) => setOrderForm((p) => ({ ...p, delivery_date: e.target.value }))}
                />
              </div>

              {orderSource === "upload" && (
                <>
                  <div className="form-row">
                    <label>Status</label>
                    <select
                      value={orderUploadStatus}
                      onChange={(e) => setOrderUploadStatus(e.target.value)}
                    >
                      <option value="sent">Sent</option>
                      <option value="delivered">Delivered</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Order File (PDF, image, etc.)</label>
                    <div className="file-upload-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => orderFileRef.current?.click()}
                      >
                        {orderUploadFile ? orderUploadFile.name : "Choose file…"}
                      </button>
                      {orderUploadFile && (
                        <span className="file-upload-size">{fmtBytes(orderUploadFile.size)}</span>
                      )}
                    </div>
                    <input
                      ref={orderFileRef}
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => setOrderUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </>
              )}

              {orderSource === "build" && (
                <div className="form-row">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={orderForm.notes}
                    onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes..."
                  />
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowOrderForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingOrder}>
                  {creatingOrder ? (orderSource === "upload" ? "Uploading..." : "Creating...") : (orderSource === "upload" ? "Upload Order" : "Create & Edit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Invoice Modal ── */}
      {showInvoiceForm && (
        <div className="modal-overlay" onClick={() => setShowInvoiceForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Invoice</h2>
            <div className="invoices-info-box" style={{ marginBottom: 16 }}>
              <p>Remaining: <strong>{fmt(invoiceRemaining)}</strong> of <strong>{fmt(job.total_amount)}</strong></p>
            </div>
            <form onSubmit={handleCreateInvoice} className="job-form">
              <div className="form-row">
                <label>Type</label>
                <select
                  value={invoiceForm.type}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="deposit">Deposit</option>
                  <option value="progress">Progress</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <div className="form-row">
                <label>Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="form-row">
                <label>Notes</label>
                <textarea
                  rows={2}
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes..."
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInvoiceForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingInvoice}>
                  {creatingInvoice ? "Creating..." : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Contract Modal ── */}
      {showContractForm && (
        <div className="modal-overlay" onClick={() => setShowContractForm(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Install Contract</h2>
            <form onSubmit={handleCreateContract} className="job-form">
              <div className="form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-row">
                  <label>Order</label>
                  <select
                    value={contractForm.order_id}
                    onChange={(e) => setContractForm((p) => ({ ...p, order_id: e.target.value }))}
                  >
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>{o.order_number || o.id.slice(0, 8)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Supplier / Contractor</label>
                  <select
                    value={contractForm.supplier_id}
                    onChange={(e) => {
                      const sid = e.target.value;
                      const sup = suppliers.find((s) => s.id === sid);
                      setContractForm((p) => ({
                        ...p,
                        supplier_id: sid,
                        contractor_name: sup ? sup.name : p.contractor_name,
                        contractor_email: sup ? (sup.email || p.contractor_email) : p.contractor_email,
                      }));
                    }}
                  >
                    <option value="">— Select supplier or enter manually —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Contractor Name</label>
                  <input
                    value={contractForm.contractor_name}
                    onChange={(e) => setContractForm((p) => ({ ...p, contractor_name: e.target.value }))}
                    placeholder="Subcontractor or crew"
                  />
                </div>
                <div className="form-row">
                  <label>Contractor Email</label>
                  <input
                    type="email"
                    value={contractForm.contractor_email}
                    onChange={(e) => setContractForm((p) => ({ ...p, contractor_email: e.target.value }))}
                    placeholder="contractor@example.com"
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Line Items</label>
                <div className="contract-line-items-editor">
                  <table className="contract-edit-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Qty</th>
                        <th>Description</th>
                        <th style={{ width: 100 }}>Rate ($)</th>
                        <th style={{ width: 90 }}>Total</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractLineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.qty}
                              onChange={(e) => setContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, qty: e.target.value } : li))}
                              className="table-input"
                            />
                          </td>
                          <td>
                            <input
                              value={item.description}
                              onChange={(e) => setContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, description: e.target.value } : li))}
                              placeholder="Description..."
                              className="table-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => setContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, rate: e.target.value } : li))}
                              className="table-input"
                            />
                          </td>
                          <td className="table-total">
                            {fmt((parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0))}
                          </td>
                          <td>
                            {contractLineItems.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: "3px 7px" }}
                                onClick={() => setContractLineItems((p) => p.filter((_, i) => i !== idx))}
                              >×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="table-total" style={{ paddingTop: 8 }}>Total</td>
                        <td className="table-total" style={{ paddingTop: 8 }}>{fmt(contractTotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                    onClick={() => setContractLineItems((p) => [...p, emptyLineItem()])}
                  >+ Add Line</button>
                </div>
              </div>

              <div className="form-row">
                <label>Scope Notes</label>
                <textarea
                  rows={3}
                  value={contractForm.scope_notes}
                  onChange={(e) => setContractForm((p) => ({ ...p, scope_notes: e.target.value }))}
                  placeholder="Installation scope, inclusions, exclusions..."
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowContractForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingContract}>
                  {creatingContract ? "Creating..." : "Create Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Contract Modal ── */}
      {showEditContractModal && editingContract && (
        <div className="modal-overlay" onClick={() => setShowEditContractModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Edit Install Contract</h2>
            <form onSubmit={handleSaveContract} className="job-form">
              <div className="form-grid-2" style={{ marginBottom: 0 }}>
                <div className="form-row">
                  <label>Supplier / Contractor</label>
                  <select
                    value={editContractForm.supplier_id}
                    onChange={(e) => {
                      const sid = e.target.value;
                      const sup = suppliers.find((s) => s.id === sid);
                      setEditContractForm((p) => ({
                        ...p,
                        supplier_id: sid,
                        contractor_name: sup ? sup.name : p.contractor_name,
                        contractor_email: sup ? (sup.email || p.contractor_email) : p.contractor_email,
                      }));
                    }}
                  >
                    <option value="">— Select supplier or enter manually —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Contractor Name</label>
                  <input
                    value={editContractForm.contractor_name}
                    onChange={(e) => setEditContractForm((p) => ({ ...p, contractor_name: e.target.value }))}
                    placeholder="Subcontractor or crew"
                  />
                </div>
                <div className="form-row form-row-full">
                  <label>Contractor Email</label>
                  <input
                    type="email"
                    value={editContractForm.contractor_email}
                    onChange={(e) => setEditContractForm((p) => ({ ...p, contractor_email: e.target.value }))}
                    placeholder="contractor@example.com"
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Line Items</label>
                <div className="contract-line-items-editor">
                  <table className="contract-edit-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>Qty</th>
                        <th>Description</th>
                        <th style={{ width: 100 }}>Rate ($)</th>
                        <th style={{ width: 90 }}>Total</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editContractLineItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="number" min="0" step="0.01"
                              value={item.qty}
                              onChange={(e) => setEditContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, qty: e.target.value } : li))}
                              className="table-input"
                            />
                          </td>
                          <td>
                            <input
                              value={item.description}
                              onChange={(e) => setEditContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, description: e.target.value } : li))}
                              placeholder="Description..."
                              className="table-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number" min="0" step="0.01"
                              value={item.rate}
                              onChange={(e) => setEditContractLineItems((p) => p.map((li, i) => i === idx ? { ...li, rate: e.target.value } : li))}
                              className="table-input"
                            />
                          </td>
                          <td className="table-total">
                            {fmt((parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0))}
                          </td>
                          <td>
                            {editContractLineItems.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: "3px 7px" }}
                                onClick={() => setEditContractLineItems((p) => p.filter((_, i) => i !== idx))}
                              >×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="table-total" style={{ paddingTop: 8 }}>Total</td>
                        <td className="table-total" style={{ paddingTop: 8 }}>
                          {fmt(editContractLineItems.reduce((s, li) => s + (parseFloat(li.qty) || 0) * (parseFloat(li.rate) || 0), 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                    onClick={() => setEditContractLineItems((p) => [...p, emptyLineItem()])}
                  >+ Add Line</button>
                </div>
              </div>

              <div className="form-row">
                <label>Scope Notes</label>
                <textarea
                  rows={3}
                  value={editContractForm.scope_notes}
                  onChange={(e) => setEditContractForm((p) => ({ ...p, scope_notes: e.target.value }))}
                  placeholder="Installation scope, inclusions, exclusions..."
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditContractModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingContract}>
                  {savingContract ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New PO Modal ── */}
      {showPoForm && (
        <div className="modal-overlay" onClick={() => setShowPoForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Purchase Order</h2>
            <form onSubmit={handleCreatePo} className="job-form">
              <div className="form-row">
                <label>Order</label>
                <select
                  value={poForm.order_id}
                  onChange={(e) => setPoForm((p) => ({ ...p, order_id: e.target.value }))}
                >
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number || o.id.slice(0, 8)} — {getSupplierName(o.supplier_id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Notes to Supplier</label>
                <textarea
                  rows={4}
                  value={poForm.notes}
                  onChange={(e) => setPoForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Delivery instructions, special requirements..."
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPoForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingPo}>
                  {creatingPo ? "Creating..." : "Create PO"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
