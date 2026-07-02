import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { apiPath } from "../utils/apiPath.js";
import { clearSessionProfile } from "../utils/sessionProfile.js";

const TOKEN_KEY = "ri_auth_token";

const AuthContext = createContext(null);

function authHeaders(token) {
  const t = token || localStorage.getItem(TOKEN_KEY);
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

function parseResponseJson(text) {
  if (!text || !String(text).trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function apiFailureMessage(r, data, rawText, label) {
  const detail = typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : "";
  const hint = typeof data.hint === "string" && data.hint.trim() ? data.hint.trim() : "";
  const fromJson =
    (typeof data.error === "string" && data.error) ||
    (typeof data.message === "string" && data.message);
  let base;
  if (fromJson) {
    base = fromJson;
  } else {
    const raw = String(rawText || "").trim();
    if (raw.startsWith("<!") || raw.toLowerCase().startsWith("<html")) {
      base = `${label}: no API JSON — the request likely hit the Vite app instead of the Node server. Run the API on port 4000 (server: npm run dev), open the app via Vite on port 5173, or set VITE_API_BASE=http://127.0.0.1:4000 in client/.env and restart the client.`;
    } else {
      base = `${label} failed (HTTP ${r.status}).`;
    }
  }
  let out = base;
  if (detail && !out.includes(detail)) {
    out = `${out} — ${detail}`;
  }
  if (hint && !out.includes(hint)) {
    out = `${out} — ${hint}`;
  }
  return out;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const persistToken = useCallback((t) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setToken(t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(apiPath("/api/auth/me"), {
        headers: { ...authHeaders(stored), Accept: "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        persistToken("");
        setUser(null);
        return;
      }
      setUser(data.user || null);
    } catch {
      persistToken("");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [persistToken]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const displayUser = useMemo(() => {
    if (!user) return null;
    return {
      ...user,
      sessionAvatarUrl: user.avatarDataUrl ?? null,
    };
  }, [user]);

  const login = useCallback(
    async (email, password) => {
      setError("");
      try {
        const r = await fetch(apiPath("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const raw = await r.text();
        const data = parseResponseJson(raw);
        if (!r.ok) {
          setError(apiFailureMessage(r, data, raw, "Sign-in"));
          return false;
        }
        if (!data.token) {
          setError("Sign-in failed — API did not return a session token.");
          return false;
        }
        persistToken(data.token);
        clearSessionProfile();
        setUser(data.user || null);
        return true;
      } catch (e) {
        const msg =
          e?.name === "TypeError"
            ? "Network error — start the API on port 4000 (server folder: npm run dev) and keep the Vite dev server on 5173, or set VITE_API_BASE."
            : e?.message || "Sign-in failed";
        setError(msg);
        return false;
      }
    },
    [persistToken]
  );

  const register = useCallback(
    async (email, password, displayName) => {
      setError("");
      try {
        const r = await fetch(apiPath("/api/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName }),
        });
        const raw = await r.text();
        const data = parseResponseJson(raw);
        if (!r.ok) {
          setError(apiFailureMessage(r, data, raw, "Registration"));
          return false;
        }
        if (!data.token) {
          setError("Registration failed — API did not return a session token.");
          return false;
        }
        persistToken(data.token);
        clearSessionProfile();
        setUser(data.user || null);
        return true;
      } catch (e) {
        const msg =
          e?.name === "TypeError"
            ? "Network error — start the API on port 4000 and use Vite on 5173 or set VITE_API_BASE."
            : e?.message || "Registration failed";
        setError(msg);
        return false;
      }
    },
    [persistToken]
  );

  const logout = useCallback(() => {
    clearSessionProfile();
    persistToken("");
    setUser(null);
    setError("");
  }, [persistToken]);

  const updateProfile = useCallback(async (fields) => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return { ok: false, error: "Not signed in" };
    const r = await fetch(apiPath("/api/auth/profile"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(t) },
      body: JSON.stringify(fields),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const base =
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : r.status === 413
              ? "Request too large — try a smaller photo or lower image quality."
              : `Update failed (${r.status})`;
      const detail = typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : "";
      const msg = detail && !base.includes(detail) ? `${base} — ${detail}` : base;
      return { ok: false, error: msg };
    }
    setUser(data.user || null);
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      user,
      displayUser,
      token,
      loading,
      error,
      setError,
      login,
      register,
      logout,
      updateProfile,
      refreshMe,
      isAuthenticated: Boolean(user && token),
    }),
    [user, displayUser, token, loading, error, login, register, logout, updateProfile, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { authHeaders, TOKEN_KEY };
