import { useState } from "react";
import "../styles/LoginPage.css";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await onLogin(email.trim(), password);
    if (!ok) {
      setError("Invalid email or password.");
      return;
    }
    setError("");
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Roofing App Login</h1>
        <p>Sign in to manage orders and suppliers.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />

        {error && <div className="login-error">{error}</div>}

        <button type="submit">Login</button>
        <div className="login-help">Use your Supabase Auth email and password.</div>
      </form>
    </div>
  );
}
