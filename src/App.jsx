import { useEffect, useState, Component } from "react";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import JobsList from "./components/JobsList";
import JobDetail from "./components/JobDetail";
import OrdersList from "./components/OrdersList";
import OrderDetail from "./components/OrderDetail";
import ScheduleBoard from "./components/ScheduleBoard";
import { supabase } from "./lib/supabase";
import { STANDARD_FLASHING_DESIGNS } from "./data/standardFlashings";
import "./styles/AppShell.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "red", padding: "20px", border: "1px solid red" }}>
          <h2>Something went wrong:</h2>
          <pre>{this.state.error.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'jobs' | 'schedule' | 'admin'
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [standardFlashingDesigns, setStandardFlashingDesigns] = useState(STANDARD_FLASHING_DESIGNS);

  // Admin panel state
  const [newSupplier, setNewSupplier] = useState({ name: "", email: "" });
  const [newFlashing, setNewFlashing] = useState({ name: "", foldsJson: '[{"length":100,"angle":0}]' });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setCurrentUser(data.session?.user || null);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUser(session?.user || null);
      if (!session?.user) {
        setSuppliers([]);
        setStandardFlashingDesigns(STANDARD_FLASHING_DESIGNS);
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    supabase
      .from("suppliers")
      .select("id, name, email")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn("Could not load suppliers", error);
        else setSuppliers(data || []);
      });
    return () => { active = false; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    supabase
      .from("standard_flashings")
      .select("id, name, folds_json")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("Could not load standard flashings", error);
          setStandardFlashingDesigns(STANDARD_FLASHING_DESIGNS);
          return;
        }
        const dbDesigns = (data || []).map((row) => ({
          id: row.id,
          name: row.name,
          folds: Array.isArray(row.folds_json) ? row.folds_json : [],
        }));
        setStandardFlashingDesigns(dbDesigns.length > 0 ? dbDesigns : STANDARD_FLASHING_DESIGNS);
      });
    return () => { active = false; };
  }, [currentUser?.id]);

  const handleLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setSelectedJobId(null);
    setSelectedOrderId(null);
    setView("jobs");
  };

  const handleSelectJob = (jobId) => {
    setSelectedJobId(jobId);
    setSelectedOrderId(null);
    setView("jobs");
  };

  const handleSelectOrder = (orderId) => {
    setSelectedOrderId(orderId);
  };

  const handleBackToJobs = () => {
    setSelectedJobId(null);
    setSelectedOrderId(null);
  };

  const handleBackToJob = () => {
    setSelectedOrderId(null);
  };

  const handleBackToOrders = () => {
    setSelectedOrderId(null);
  };

  const handleViewChange = (newView) => {
    setView(newView);
    setSelectedJobId(null);
    setSelectedOrderId(null);
  };

  // Admin helpers
  const addSupplier = async () => {
    const name = newSupplier.name.trim();
    const email = newSupplier.email.trim();
    if (!name || !email) { alert("Supplier name and email are required."); return; }
    const { data, error } = await supabase
      .from("suppliers")
      .insert([{ owner_id: currentUser.id, name, email }])
      .select("id, name, email")
      .single();
    if (error) { alert(`Could not save supplier: ${error.message}`); return; }
    setSuppliers((prev) => [...prev, data]);
    setNewSupplier({ name: "", email: "" });
  };

  const deleteSupplier = async (id) => {
    const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("owner_id", currentUser.id);
    if (error) { alert(`Could not delete supplier: ${error.message}`); return; }
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  };

  const parseFoldsJson = (raw) => {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Folds JSON must be an array.");
    const folds = parsed.map((f) => ({ length: Number(f.length), angle: Number(f.angle) }));
    if (folds.some((f) => !Number.isFinite(f.length) || !Number.isFinite(f.angle)))
      throw new Error("Each fold must include numeric length and angle.");
    return folds;
  };

  // Shared flashing catalog CRUD — designs are visible to and editable by all users.
  const toDesign = (row) => ({
    id: row.id,
    name: row.name,
    folds: Array.isArray(row.folds_json) ? row.folds_json : [],
  });

  const addStandardFlashingDesign = async ({ name, folds }) => {
    const { data, error } = await supabase
      .from("standard_flashings")
      .insert([{ owner_id: currentUser.id, name, folds_json: folds }])
      .select("id, name, folds_json")
      .single();
    if (error) { alert(`Could not add flashing: ${error.message}`); return null; }
    const design = toDesign(data);
    setStandardFlashingDesigns((prev) => [...prev, design]);
    return design;
  };

  const updateStandardFlashingDesign = async (id, { name, folds }) => {
    const { data, error } = await supabase
      .from("standard_flashings")
      .update({ name, folds_json: folds })
      .eq("id", id)
      .select("id, name, folds_json")
      .single();
    if (error) { alert(`Could not update flashing: ${error.message}`); return null; }
    const design = toDesign(data);
    setStandardFlashingDesigns((prev) => prev.map((d) => (d.id === id ? design : d)));
    return design;
  };

  const deleteStandardFlashingDesign = async (id) => {
    const { error } = await supabase.from("standard_flashings").delete().eq("id", id);
    if (error) { alert(`Could not delete flashing: ${error.message}`); return false; }
    setStandardFlashingDesigns((prev) => prev.filter((d) => d.id !== id));
    return true;
  };

  const addStandardFlashing = async () => {
    const name = newFlashing.name.trim();
    if (!name) { alert("Design name is required."); return; }
    let folds;
    try { folds = parseFoldsJson(newFlashing.foldsJson); } catch (e) { alert(e.message); return; }
    const created = await addStandardFlashingDesign({ name, folds });
    if (created) setNewFlashing({ name: "", foldsJson: '[{"length":100,"angle":0}]' });
  };

  const deleteStandardFlashing = (id) => deleteStandardFlashingDesign(id);

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const showJobOrderDetail = view === "jobs" && selectedJobId && selectedOrderId;
  const showStandaloneOrderDetail = view === "orders" && selectedOrderId;
  const showOrderDetail = showJobOrderDetail || showStandaloneOrderDetail;
  const showJobDetail = view === "jobs" && selectedJobId && !selectedOrderId;
  const showJobsList = view === "jobs" && !selectedJobId;
  const showOrdersList = view === "orders" && !selectedOrderId;

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="app-shell-header">
          <div className="app-shell-left">
            <div className="app-shell-title">TM Roofing</div>
            <nav className="app-shell-nav">
              <button
                className={view === "dashboard" ? "active" : ""}
                onClick={() => handleViewChange("dashboard")}
              >
                Dashboard
              </button>
              <button
                className={view === "jobs" ? "active" : ""}
                onClick={() => handleViewChange("jobs")}
              >
                Jobs
              </button>
              <button
                className={view === "orders" ? "active" : ""}
                onClick={() => handleViewChange("orders")}
              >
                Orders
              </button>
              <button
                className={view === "schedule" ? "active" : ""}
                onClick={() => handleViewChange("schedule")}
              >
                Schedule
              </button>
              <button
                className={view === "admin" ? "active" : ""}
                onClick={() => handleViewChange("admin")}
              >
                Admin
              </button>
            </nav>
          </div>
          <div className="app-shell-right">
            <span className="app-shell-user">{currentUser.email}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <main className="app-shell-body">
          {view === "dashboard" && (
            <Dashboard
              userId={currentUser.id}
              onSelectJob={handleSelectJob}
              onViewChange={handleViewChange}
            />
          )}
          {showJobsList && (
            <JobsList onSelectJob={handleSelectJob} userId={currentUser.id} />
          )}
          {showJobDetail && (
            <JobDetail
              jobId={selectedJobId}
              onBack={handleBackToJobs}
              onSelectOrder={handleSelectOrder}
              suppliers={suppliers}
              userId={currentUser.id}
            />
          )}
          {showOrdersList && (
            <OrdersList
              onSelectOrder={handleSelectOrder}
              suppliers={suppliers}
              userId={currentUser.id}
            />
          )}
          {showOrderDetail && (
            <OrderDetail
              orderId={selectedOrderId}
              onBack={showStandaloneOrderDetail ? handleBackToOrders : handleBackToJob}
              backLabel={showStandaloneOrderDetail ? "Orders" : undefined}
              suppliers={suppliers}
              standardFlashingDesigns={standardFlashingDesigns}
              onAddDesign={addStandardFlashingDesign}
              onUpdateDesign={updateStandardFlashingDesign}
              onDeleteDesign={deleteStandardFlashingDesign}
              userId={currentUser.id}
            />
          )}
          {view === "schedule" && (
            <div className="page-card">
              <h2 className="page-title">Schedule</h2>
              <ScheduleBoard />
            </div>
          )}
          {view === "admin" && (
            <div className="page-card">
              <h2 className="page-title">Admin</h2>
              <div className="admin-grid">
                <div className="admin-card">
                  <h3>Suppliers</h3>
                  <div className="admin-form-row">
                    <input
                      placeholder="Name"
                      value={newSupplier.name}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, email: e.target.value }))}
                    />
                    <button onClick={addSupplier}>Add</button>
                  </div>
                  <ul className="admin-list">
                    {suppliers.map((s) => (
                      <li key={s.id}>
                        <span>{s.name} — {s.email}</span>
                        <button onClick={() => deleteSupplier(s.id)}>Delete</button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="admin-card">
                  <h3>Standard Flashings</h3>
                  <div className="admin-form-vertical">
                    <input
                      placeholder="Design name"
                      value={newFlashing.name}
                      onChange={(e) => setNewFlashing((p) => ({ ...p, name: e.target.value }))}
                    />
                    <textarea
                      rows={4}
                      value={newFlashing.foldsJson}
                      onChange={(e) => setNewFlashing((p) => ({ ...p, foldsJson: e.target.value }))}
                      placeholder='[{"length":100,"angle":0}]'
                    />
                    <button onClick={addStandardFlashing}>Add</button>
                  </div>
                  <ul className="admin-list">
                    {standardFlashingDesigns.map((d) => (
                      <li key={d.id}>
                        <span>{d.name}</span>
                        <button
                          onClick={() => deleteStandardFlashing(d.id)}
                          disabled={String(d.id).startsWith("std-")}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
