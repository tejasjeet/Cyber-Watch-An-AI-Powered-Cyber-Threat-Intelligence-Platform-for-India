import { useData } from "../context/DataContext.jsx";
import { stateCounts } from "../utils/insights.js";
import AttackMap from "../components/map/AttackMap.jsx";
import GeospatialIntel from "../components/map/GeospatialIntel.jsx";
import StateBreakdown from "../components/map/StateBreakdown.jsx";

export default function MapView() {
  const { items, loading, error } = useData();
  const choropleth = stateCounts(items);

  return (
    <>
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-page-head">
        <h1 className="cw-page-title">Map view</h1>
      </div>

      <div className="cw-grid cols-2">
        <div style={{ minWidth: 0 }}>
          <AttackMap choroplethCounts={choropleth} height="clamp(400px, 52vh, 780px)" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
          <GeospatialIntel />
          <StateBreakdown rows={choropleth} totalVictims={items.length} />
        </div>
      </div>
    </>
  );
}
