import { Link } from "react-router-dom";
import { Skull } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import { groupsForCards } from "../utils/insights.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function Groups() {
  const { items, loading, error } = useData();
  const cards = groupsForCards(items);

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
          <Skull size={26} strokeWidth={1.5} />
          Adversary monitoring
        </h1>
      </div>

      <div className="cw-groups-grid">
        {cards.map((g) => (
          <div key={g.name} className="cw-group-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Skull size={18} color="#64748b" />
              <StatusBadge>{g.status}</StatusBadge>
            </div>
            <h3>{g.name}</h3>
            <div className="cw-ttp">PREDOMINANT TTP: {g.ttp}</div>
            <div>
              <span style={{ fontSize: "0.62rem", color: "#64748b", letterSpacing: "0.08em" }}>ACTIVITY LEVEL</span>
              <div className={`cw-activity ${g.activity.toLowerCase()}`}>{g.activity}</div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
              Public victims (indexed): <strong style={{ color: "#e2e8f0" }}>{g.count}</strong>
            </div>
            <div className="cw-group-foot">
              <Link to={`/groups/deploy/${encodeURIComponent(g.name)}`}>DEPLOYMENT ANALYSIS</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
