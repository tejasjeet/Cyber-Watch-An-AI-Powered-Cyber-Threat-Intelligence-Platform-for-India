import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Settings, ChevronDown } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useUiPrefs } from "../context/UiPrefsContext.jsx";
import { parseRowDiscoveryTime } from "../utils/insights.js";
import { analysisPagePath } from "../utils/analysisUrl.js";

function formatAttackTimestamp(row, formatDateTime) {
  const t = parseRowDiscoveryTime(row);
  if (t != null) return formatDateTime(new Date(t));
  const d = row?.discovered_date ?? row?.attack_estimated;
  if (d != null && String(d).trim()) return String(d).trim();
  return "—";
}

function discoveryDateTimeAttr(row) {
  const t = parseRowDiscoveryTime(row);
  return t != null ? new Date(t).toISOString() : undefined;
}

function attackLabel(row) {
  const t = (row?.target || "").trim();
  if (t) return t;
  const w = (row?.website || "").trim();
  if (w) return w.replace(/^https?:\/\//i, "").split("/")[0] || w;
  return String(row?.victim_id || "Unknown");
}

export default function TopBar() {
  const navigate = useNavigate();
  const { live, items } = useData();
  const { displayUser, logout, loading: authLoading } = useAuth();
  const { formatDateTime } = useUiPrefs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const accountRef = useRef(null);
  const notifyRef = useRef(null);

  const latestAttacks = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => (parseRowDiscoveryTime(b) ?? 0) - (parseRowDiscoveryTime(a) ?? 0));
    return arr.slice(0, 40);
  }, [items]);

  useEffect(() => {
    function close(e) {
      const t = e.target;
      if (accountRef.current && !accountRef.current.contains(t)) setMenuOpen(false);
      if (notifyRef.current && !notifyRef.current.contains(t)) setNotifyOpen(false);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <header className="cw-topbar">
      <div className="cw-top-left">
        <div className="cw-status-pill">
          <span className={live.connected ? "cw-dot-live" : "cw-dot-off"} />
          LIVE OPERATIONS: {live.connected ? "ACTIVE" : "STANDBY"}
        </div>
        <span className="cw-status-pill muted">MONITORING: ALL SECTORS</span>
      </div>
      <div className="cw-topbar-spacer" aria-hidden />
      <div className="cw-top-right">
        <div className="cw-notify-wrap" ref={notifyRef}>
          <button
            type="button"
            className={`cw-icon-btn${notifyOpen ? " is-active" : ""}`}
            aria-label="Notifications"
            aria-expanded={notifyOpen}
            onClick={(e) => {
              e.stopPropagation();
              setNotifyOpen((o) => !o);
              setMenuOpen(false);
            }}
          >
            <Bell size={18} strokeWidth={1.75} />
          </button>
          {notifyOpen && (
            <div className="cw-notify-panel" onClick={(e) => e.stopPropagation()}>
              <div className="cw-notify-panel-head">Latest disclosures (by detection date)</div>
              {latestAttacks.length === 0 ? (
                <div className="cw-notify-empty">No attacks loaded yet.</div>
              ) : (
                <ul className="cw-notify-list">
                  {latestAttacks.map((row) => {
                    const id = row.victim_id;
                    const to = analysisPagePath(id);
                    return (
                      <li key={String(id)}>
                        <Link to={to} className="cw-notify-row" onClick={() => setNotifyOpen(false)}>
                          <span className="cw-notify-row-main">
                            <span className="cw-notify-title">{attackLabel(row)}</span>
                            {row.group ? <span className="cw-notify-meta">{row.group}</span> : null}
                          </span>
                          <time className="cw-notify-time" dateTime={discoveryDateTimeAttr(row)}>
                            {formatAttackTimestamp(row, formatDateTime)}
                          </time>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="cw-notify-foot">
                <Link to="/attacks" onClick={() => setNotifyOpen(false)}>
                  View all attacks
                </Link>
              </div>
            </div>
          )}
        </div>
        <Link to="/settings" className="cw-icon-btn" aria-label="Settings" onClick={() => setNotifyOpen(false)}>
          <Settings size={18} strokeWidth={1.75} />
        </Link>
        <Link to="/live" className="cw-pill-btn primary">
          LIVE FEED
        </Link>
        {authLoading ? (
          <div className="cw-account cw-account--loading" aria-busy>
            <div className="cw-account-text">
              <div className="cw-account-name">…</div>
              <div className="cw-account-role">LOADING</div>
            </div>
            <div className="cw-avatar cw-account-avatar">…</div>
          </div>
        ) : displayUser ? (
          <div
            className="cw-account"
            ref={accountRef}
            onClick={() => {
              setMenuOpen((o) => !o);
              setNotifyOpen(false);
            }}
          >
            <div className="cw-account-text">
              <div className="cw-account-name">
                {(displayUser.displayName || displayUser.email || "USER").toUpperCase()}
              </div>
              <div className="cw-account-role">SIGNED IN</div>
            </div>
            <div className="cw-avatar cw-avatar--photo cw-account-avatar">
              {displayUser.sessionAvatarUrl ? (
                <img src={displayUser.sessionAvatarUrl} alt="" />
              ) : (
                (displayUser.displayName || displayUser.email || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <ChevronDown size={14} color="#64748b" style={{ transform: menuOpen ? "rotate(180deg)" : "none" }} />
            {menuOpen && (
              <div className="cw-dropdown" onClick={(e) => e.stopPropagation()}>
                <Link to="/profile" onClick={() => setMenuOpen(false)}>
                  My profile
                </Link>
                <Link to="/settings" onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
                <hr />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    navigate("/login");
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
