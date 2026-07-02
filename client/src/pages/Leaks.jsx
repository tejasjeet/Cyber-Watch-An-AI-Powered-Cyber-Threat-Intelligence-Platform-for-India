import { Database } from "lucide-react";
import { Link } from "react-router-dom";
import { useData } from "../context/DataContext.jsx";
import { leaksFromItems } from "../utils/insights.js";
import { breachAnalysisPagePath } from "../utils/analysisUrl.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function Leaks() {
  const { items, loading, error } = useData();
  const leaks = leaksFromItems(items);

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
          <Database size={26} />
          Exfiltration logs
        </h1>
      </div>

      <div className="cw-grid cols-3" style={{ marginBottom: "1rem" }}>
        <div className="cw-kpi kpi-blue">
          <div className="cw-kpi-label">Indexed disclosures</div>
          <div className="cw-kpi-val" style={{ color: "#7dd3fc" }}>
            {items.length}
          </div>
        </div>
        <div className="cw-kpi kpi-green">
          <div className="cw-kpi-label">With proof links</div>
          <div className="cw-kpi-val" style={{ color: "#86efac" }}>
            {items.filter((i) => (i.proof_links || []).length > 0).length}
          </div>
        </div>
        <div className="cw-kpi kpi-pink">
          <div className="cw-kpi-label">Unique groups</div>
          <div className="cw-kpi-val" style={{ color: "#fb7185" }}>
            {new Set(items.map((i) => i.group).filter(Boolean)).size}
          </div>
        </div>
      </div>

      <div className="cw-leaks-grid">
        {leaks.map((L) => (
          <div key={L.id} className="cw-leak-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <strong style={{ fontSize: "0.95rem" }}>{L.company}</strong>
              <StatusBadge>{L.status}</StatusBadge>
            </div>
            <div className="cw-leak-meta">{L.meta}</div>
            <div className="cw-leak-grid3">
              <div>
                DATE REPORTED
                <strong>{L.date}</strong>
              </div>
              <div>
                SIZE (EST.)
                <strong>{L.size}</strong>
              </div>
              <div>
                IMPACT (RECORDS)
                <strong>{L.impact}</strong>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <Link to={breachAnalysisPagePath(L.id)} className="cw-btn-green" style={{ textDecoration: "none", textAlign: "center", display: "block" }}>
                ANALYZE EXFILTRATED SCHEMA
              </Link>
              {L.row.source_url ? (
                <a href={L.row.source_url} target="_blank" rel="noreferrer" className="cw-btn-outline" style={{ textDecoration: "none", textAlign: "center", display: "block", fontSize: "0.65rem" }}>
                  Open disclosure source
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
