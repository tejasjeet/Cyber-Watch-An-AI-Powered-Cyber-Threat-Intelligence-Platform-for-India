import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthIntro from "../components/AuthIntro.jsx";
import "../styles/authIntro.css";

function safeReturnPath(from) {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return "/";
  if (from === "/login" || from === "/register") return "/";
  return from;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, error, setError, user, loading } = useAuth();
  const [introDone, setIntroDone] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const finishIntro = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    if (!loading && user) {
      navigate(safeReturnPath(location.state?.from), { replace: true });
    }
  }, [loading, user, navigate, location.state]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const ok = await login(email, password);
      if (ok) navigate(safeReturnPath(location.state?.from), { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen-root">
      {!introDone ? <AuthIntro onComplete={finishIntro} /> : null}
      <div className={`auth-screen-content ${introDone ? "auth-screen-content--visible" : ""}`}>
        <div className="auth-screen-eyebrow">CYBER WATCH</div>
        <h1 className="auth-screen-title">Sign in</h1>
        <form className="auth-glass-card" onSubmit={onSubmit}>
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <label className="auth-label" htmlFor="login-email">
            EMAIL
          </label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="auth-label" htmlFor="login-password">
            PASSWORD
          </label>
          <input
            id="login-password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="auth-btn-primary" disabled={busy}>
            {busy ? "SIGNING IN…" : "SIGN IN"}
          </button>
          <p className="auth-footer-link">
            New user? <Link to="/register">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
