import { useState } from "react";
import "../styles/LoginPage.css";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const ok = onLogin(username.trim(), password);
    if (!ok) {
      setError("Invalid username or password.");
      return;
    }
    setError("");
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Roofing App Login</h1>
        <p>Sign in to manage orders and suppliers.</p>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
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
        <div className="login-help">Default admin: username `admin`, password `admin123`</div>
      </form>
    </div>
  );
}
