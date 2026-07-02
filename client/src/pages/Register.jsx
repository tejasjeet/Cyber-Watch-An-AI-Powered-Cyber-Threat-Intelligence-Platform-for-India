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

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, error, setError, user, loading } = useAuth();
  const [introDone, setIntroDone] = useState(false);
  const [displayName, setDisplayName] = useState("");
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
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Please enter your name (at least 2 characters).");
      return;
    }
    setBusy(true);
    try {
      const ok = await register(email, password, name);
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
        <h1 className="auth-screen-title">Create account</h1>
        <form className="auth-glass-card" onSubmit={onSubmit}>
          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}
          <label className="auth-label" htmlFor="reg-name">
            YOUR NAME
          </label>
          <input
            id="reg-name"
            className="auth-input"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
          />
          <label className="auth-label" htmlFor="reg-email">
            EMAIL
          </label>
          <input
            id="reg-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="auth-label" htmlFor="reg-password">
            PASSWORD (MIN 8 CHARACTERS)
          </label>
          <input
            id="reg-password"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit" className="auth-btn-primary" disabled={busy}>
            {busy ? "CREATING…" : "CREATE ACCOUNT"}
          </button>
          <p className="auth-footer-link">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
