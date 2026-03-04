import { useEffect, useState, Component } from "react";
import Home from "./components/Home";
import FlashingBuilder from "./components/FlashingBuilder";
import LoginPage from "./components/LoginPage";
import OrderSummary from "./components/OrderSummary";
import { supabase } from "./lib/supabase";
import "./styles/AppShell.css";

const SAVED_FLASHING_ORDERS_STORAGE_KEY = "roofing-app.saved-orders.v1";
const SAVED_ORDER_SESSIONS_STORAGE_KEY = "roofing-app.saved-order-sessions.v1";

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

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const TAB_KEYS = {
  STANDARD: "standard",
  FLASHINGS: "flashings",
  SUMMARY: "summary",
};

const DEFAULT_ORDER_INFO = {
  builder: "",
  orderNumber: "",
  address: "",
  orderDate: new Date().toISOString().split("T")[0],
  deliveryDate: "",
  roofColour: "",
  fasciaColour: "",
  gutterColour: "",
  notes: "",
  supplierId: "",
};

export default function App() {
  const [suppliers, setSuppliers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showOrderHome, setShowOrderHome] = useState(true);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.STANDARD);
  const [orderInfo, setOrderInfo] = useState({ ...DEFAULT_ORDER_INFO });
  const [standardSelections, setStandardSelections] = useState([]);
  const [flashingOrders, setFlashingOrders] = useState(() =>
    readJson(SAVED_FLASHING_ORDERS_STORAGE_KEY, [])
  );
  const [savedOrderSessions, setSavedOrderSessions] = useState(() =>
    readJson(SAVED_ORDER_SESSIONS_STORAGE_KEY, [])
  );

  const [newSupplier, setNewSupplier] = useState({ name: "", email: "" });

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setCurrentUser(data.session?.user || null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
      if (!session?.user) {
        setSuppliers([]);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return !error;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setShowAdminPanel(false);
  };

  const addSupplier = async () => {
    const name = newSupplier.name.trim();
    const email = newSupplier.email.trim();
    if (!name || !email) {
      alert("Supplier name and email are required.");
      return;
    }

    if (!currentUser?.id) {
      alert("Please log in again.");
      return;
    }

    const { data, error } = await supabase
      .from("suppliers")
      .insert([{ owner_id: currentUser.id, name, email }])
      .select("id, name, email")
      .single();

    if (error) {
      alert(`Could not save supplier: ${error.message}`);
      return;
    }

    setSuppliers((prev) => [...prev, data]);
    setNewSupplier({ name: "", email: "" });
  };

  const deleteSupplier = async (id) => {
    if (!currentUser?.id) {
      return;
    }
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", id)
      .eq("owner_id", currentUser.id);
    if (error) {
      alert(`Could not delete supplier: ${error.message}`);
      return;
    }
    setSuppliers((prev) => prev.filter((item) => item.id !== id));
  };

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, email")
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: true });

      if (!active) {
        return;
      }

      if (error) {
        console.warn("Could not load suppliers", error);
        setSuppliers([]);
        return;
      }

      setSuppliers(data || []);
    })();

    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  const handleStartOrder = (info) => {
    if (info?.standardSelections) {
      setStandardSelections(info.standardSelections);
    }
    setOrderInfo((prev) => ({ ...prev, ...(info || {}) }));
    setShowOrderHome(false);
    setActiveTab(TAB_KEYS.FLASHINGS);
  };

  useEffect(() => {
    writeJson(SAVED_FLASHING_ORDERS_STORAGE_KEY, flashingOrders);
  }, [flashingOrders]);

  const saveOrderSessions = (next) => {
    setSavedOrderSessions(next);
    writeJson(SAVED_ORDER_SESSIONS_STORAGE_KEY, next);
  };

  const resetCurrentOrder = () => {
    setOrderInfo({ ...DEFAULT_ORDER_INFO });
    setStandardSelections([]);
    setFlashingOrders([]);
  };

  const hasCurrentOrder =
    Boolean(
      orderInfo.builder ||
        orderInfo.orderNumber ||
        orderInfo.address ||
        orderInfo.deliveryDate ||
        orderInfo.roofColour ||
        orderInfo.fasciaColour ||
        orderInfo.gutterColour ||
        orderInfo.notes ||
        orderInfo.supplierId
    ) ||
    standardSelections.length > 0 ||
    flashingOrders.length > 0;

  const handleStartNewFromHome = () => {
    resetCurrentOrder();
    setActiveTab(TAB_KEYS.STANDARD);
    setShowOrderHome(false);
  };

  const handleContinueFromHome = () => {
    if (hasCurrentOrder) {
      setActiveTab(TAB_KEYS.SUMMARY);
      setShowOrderHome(false);
      return;
    }

    const latestSaved = savedOrderSessions[0];
    if (latestSaved) {
      setOrderInfo({ ...DEFAULT_ORDER_INFO, ...(latestSaved.orderInfo || {}) });
      setStandardSelections(latestSaved.standardSelections || []);
      setFlashingOrders(latestSaved.flashingOrders || []);
      setActiveTab(TAB_KEYS.SUMMARY);
      setShowOrderHome(false);
      return;
    }

    setActiveTab(TAB_KEYS.STANDARD);
    setShowOrderHome(false);
  };

  const handleSaveAndExitOrder = () => {
    const session = {
      id: `session-${Date.now()}`,
      savedAt: Date.now(),
      orderInfo,
      standardSelections,
      flashingOrders,
    };
    saveOrderSessions([session, ...savedOrderSessions]);
    resetCurrentOrder();
    setActiveTab(TAB_KEYS.STANDARD);
    setShowOrderHome(true);
    alert("Order saved. You can continue it from Home or Order Summary.");
  };

  const handleResumeSavedOrder = (sessionId) => {
    const session = savedOrderSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    setOrderInfo({ ...DEFAULT_ORDER_INFO, ...(session.orderInfo || {}) });
    setStandardSelections(session.standardSelections || []);
    setFlashingOrders(session.flashingOrders || []);
    setShowOrderHome(false);
    setActiveTab(TAB_KEYS.SUMMARY);
  };

  const handleDeleteSavedOrder = (sessionId) => {
    saveOrderSessions(savedOrderSessions.filter((item) => item.id !== sessionId));
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="app-shell-header">
          <div className="app-shell-title">Roofing App</div>
          <div className="app-shell-actions">
            <span className="app-shell-user">Signed in: {currentUser.email}</span>
            <button onClick={() => setShowAdminPanel((v) => !v)}>Manage Suppliers</button>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {showAdminPanel && (
          <section className="admin-panel">
            <div className="admin-card">
              <h3>Suppliers</h3>
              <div className="admin-form-row">
                <input
                  type="text"
                  placeholder="Supplier Name"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  type="email"
                  placeholder="Supplier Email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, email: e.target.value }))}
                />
                <button onClick={addSupplier}>Add Supplier</button>
              </div>
              <ul className="admin-list">
                {suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <span>
                      {supplier.name} - {supplier.email}
                    </span>
                    <button onClick={() => deleteSupplier(supplier.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showOrderHome ? (
          <main className="workflow-body">
            <section className="order-home-card">
              <h2>Order Home</h2>
              <p>Start a new order or continue where you left off.</p>
              <div className="order-home-actions">
                <button onClick={handleContinueFromHome}>Continue Order</button>
                <button className="primary" onClick={handleStartNewFromHome}>
                  Start New Order
                </button>
              </div>
            </section>
          </main>
        ) : (
          <>
            <div className="workflow-tabs">
              <button
                className={activeTab === TAB_KEYS.STANDARD ? "active" : ""}
                onClick={() => setActiveTab(TAB_KEYS.STANDARD)}
              >
                Standard Items
              </button>
              <button
                className={activeTab === TAB_KEYS.FLASHINGS ? "active" : ""}
                onClick={() => setActiveTab(TAB_KEYS.FLASHINGS)}
              >
                Custom Flashings
              </button>
              <button
                className={activeTab === TAB_KEYS.SUMMARY ? "active" : ""}
                onClick={() => setActiveTab(TAB_KEYS.SUMMARY)}
              >
                Order Summary
              </button>
            </div>

            <main className="workflow-body">
              {activeTab === TAB_KEYS.STANDARD && (
                <Home
                  onStartOrder={handleStartOrder}
                  suppliers={suppliers}
                  embedded
                  orderInfo={orderInfo}
                  onOrderInfoChange={setOrderInfo}
                  standardSelections={standardSelections}
                  onStandardSelectionsChange={setStandardSelections}
                />
              )}
              {activeTab === TAB_KEYS.FLASHINGS && (
                <FlashingBuilder
                  orderInfo={orderInfo}
                  savedOrders={flashingOrders}
                  onSavedOrdersChange={setFlashingOrders}
                />
              )}
              {activeTab === TAB_KEYS.SUMMARY && (
                <OrderSummary
                  orderInfo={orderInfo}
                  onChange={setOrderInfo}
                  suppliers={suppliers}
                  standardSelections={standardSelections}
                  flashingOrders={flashingOrders}
                  savedOrderSessions={savedOrderSessions}
                  onSaveAndExitOrder={handleSaveAndExitOrder}
                  onResumeSavedOrder={handleResumeSavedOrder}
                  onDeleteSavedOrder={handleDeleteSavedOrder}
                />
              )}
            </main>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
