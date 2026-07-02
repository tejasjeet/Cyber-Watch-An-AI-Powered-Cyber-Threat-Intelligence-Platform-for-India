import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { apiPath } from "../utils/apiPath.js";
import { TOKEN_KEY } from "./AuthContext.jsx";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState({ connected: false, lastEvent: null });

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      // POST /api/intel/refresh runs the full Python scraper — can take minutes. Never block the UI
      // (or chain another run on every socket `attacks:update`) on that request.
      if (token && !silent) {
        const ctrl = new AbortController();
        const tmr = setTimeout(() => ctrl.abort(), 300_000);
        void fetch(apiPath("/api/intel/refresh"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: ctrl.signal,
        })
          .then((ir) => ir.json().catch(() => ({})).then((ij) => ({ ir, ij })))
          .then(({ ir, ij }) => {
            if (!ir.ok) console.warn("intel refresh:", ij?.error || ir.status);
          })
          .catch((e) => {
            if (e?.name !== "AbortError") console.warn("intel refresh failed:", e?.message || e);
          })
          .finally(() => clearTimeout(tmr));
      }

      const [healthRes, r1, r2] = await Promise.all([
        fetch(apiPath("/api/health")),
        fetch(apiPath("/api/attacks?limit=1000")),
        fetch(apiPath("/api/stats")),
      ]);
      setHealth(await healthRes.json().catch(() => ({})));
      const data = await r1.json().catch(() => ({}));
      if (r1.status === 503 && data.error) {
        setItems([]);
        setStats(null);
        return;
      }
      if (!r1.ok) {
        const msg =
          [data.error, data.message, data.hint].find((x) => typeof x === "string" && x) ||
          `Request failed (${r1.status})`;
        throw new Error(msg);
      }
      setItems(data.items || []);
      if (r2.ok) {
        const s = await r2.json();
        setStats(s);
      } else setStats(null);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE;
    const socket = io(base || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });
    socket.on("connect", () => setLive((s) => ({ ...s, connected: true })));
    socket.on("disconnect", () => setLive((s) => ({ ...s, connected: false })));
    socket.on("attacks:update", (payload) => {
      setLive((s) => ({ ...s, lastEvent: payload }));
      load(true);
    });
    return () => socket.close();
  }, [load]);

  const value = useMemo(
    () => ({
      health,
      items,
      stats,
      loading,
      error,
      live,
      load,
    }),
    [health, items, stats, loading, error, live, load]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
