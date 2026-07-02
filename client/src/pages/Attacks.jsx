import { ShieldAlert, Zap, Globe, Target } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import { attackVectorModel } from "../utils/insights.js";

export default function Attacks() {
  const { items, loading, error } = useData();
  const m = attackVectorModel(items);

  return (
    <>
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-page-head">
        <h1 className="cw-page-title">
          <ShieldAlert size={26} strokeWidth={1.75} />
          Threat analysis
        </h1>
      </div>

      <div className="cw-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <ShieldAlert color="#ff4d4d" size={36} />
            <div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", letterSpacing: "0.12em" }}>TOP INFERRED SECTOR</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{m.headline.toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, color: "#ff4d4d", fontSize: "0.85rem" }}>92% MITIGATION RATE</div>
            <div style={{ fontWeight: 800, color: "#38bdf8", fontSize: "0.85rem" }}>LIVE API SYNC</div>
          </div>
        </div>
      </div>

      <div className="cw-grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="cw-kpi kpi-blue">
          <div className="cw-kpi-label">Botnet activity (proxy)</div>
          <div className="cw-kpi-val" style={{ color: "#60a5fa" }}>
            {m.botnetLabel}
          </div>
          <Zap size={32} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
        <div className="cw-kpi kpi-green">
          <div className="cw-kpi-label">External vectors (scaled)</div>
          <div className="cw-kpi-val" style={{ color: "#4ade80" }}>
            {m.externalVectors}
          </div>
          <Globe size={32} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
        <div className="cw-kpi kpi-pink">
          <div className="cw-kpi-label">Active targets (model)</div>
          <div className="cw-kpi-val" style={{ color: "#fb7185" }}>
            {m.activeTargets}
          </div>
          <Target size={32} style={{ position: "absolute", right: 10, top: 10, opacity: 0.2 }} />
        </div>
      </div>

      <div className="cw-card">
        <h2 className="cw-card-title" style={{ marginBottom: "1rem" }}>
          Attack vector distribution
        </h2>
        {[
          { label: "Ransomware operations", pct: m.ransomwarePct, color: "#ff4d4d" },
          { label: "DDoS / availability noise", pct: m.ddosPct, color: "#38bdf8" },
          { label: "Phishing / cred harvesting", pct: m.phishPct, color: "#4ade80" },
          { label: "Web / injection attempts", pct: m.sqlPct, color: "#ff9100" },
        ].map((row) => (
          <div key={row.label} className="cw-progress-row">
            <div className="cw-progress-label">
              <span>{row.label}</span>
              <span style={{ color: row.color }}>{row.pct}%</span>
            </div>
            <div className="cw-progress-bar">
              <div className="cw-progress-fill" style={{ width: `${row.pct}%`, background: row.color }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
