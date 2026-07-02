import { AlertTriangle } from "lucide-react";

export default function GeospatialIntel() {
  return (
    <div className="cw-card" style={{ margin: 0 }}>
      <h2 className="cw-card-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <AlertTriangle size={16} strokeWidth={2} style={{ color: "#f97316" }} aria-hidden />
        Geospatial Intel
      </h2>
    </div>
  );
}
