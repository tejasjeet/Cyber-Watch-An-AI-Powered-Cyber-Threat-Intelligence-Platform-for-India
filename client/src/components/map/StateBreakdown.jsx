import { MAP_YEAR } from "../../constants/mapConstants.js";

export default function StateBreakdown({ rows = [], totalVictims = 0 }) {
  const year = MAP_YEAR;
  const list = Array.isArray(rows) ? rows : [];
  const max = Math.max(...list.map((s) => s.count), 1);
  const inferredSum = list.reduce((acc, r) => acc + (Number(r.count) || 0), 0);
  const unmatched = Math.max(0, totalVictims - inferredSum);

  return (
    <div className="cw-card" style={{ margin: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
        <h2 className="cw-card-title" style={{ margin: 0 }}>
          Attacks by State
        </h2>
        <span style={{ fontSize: "0.58rem", color: "#64748b", letterSpacing: "0.12em" }}>
          Inferred · {year}
        </span>
      </div>
      <p style={{ fontSize: "0.62rem", color: "#94a3b8", margin: "0 0 0.65rem", lineHeight: 1.35 }}>
        Counts match the map: state names guessed from victim text (not geo-IP).{" "}
        {totalVictims > 0 ? (
          <>
            <strong>{inferredSum}</strong> of <strong>{totalVictims}</strong> loaded victims matched a state;{" "}
            {unmatched > 0 ? (
              <>
                <strong>{unmatched}</strong> have no state keyword.
              </>
            ) : (
              <>all matched.</>
            )}
          </>
        ) : (
          <>Load the victim index to populate this panel.</>
        )}
      </p>
      {list.length === 0 ? (
        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>No state could be inferred from the current rows.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {list.map((row) => {
            const pct = Math.round((row.count / max) * 100);
            return (
              <div key={row.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: "0.2rem" }}>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{row.name}</span>
                  <span style={{ color: "#f97316", fontWeight: 800 }}>{row.count}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: row.name === "Maharashtra" ? "var(--cw-map-hot)" : "var(--cw-map-cool)",
                      transition: "width 0.35s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
