import { MapPin, LocateFixed } from "lucide-react";
import { INDIAN_STATES, getCitiesForState } from "../../data/indiaLocations.js";

export default function LocationStep({ location, onChange }) {
  const cities = location.state ? getCitiesForState(location.state) : [];

  function detectLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => {
        onChange({ ...location, country: location.country || "India", geoDetected: true });
      },
      () => {
        /* user denied — keep manual */
      },
      { timeout: 8000 }
    );
  }

  function handleStateChange(state) {
    onChange({ ...location, state, city: "" });
  }

  return (
    <div className="ccr-glass">
      <h3 className="ccr-section-title">Incident location</h3>
      <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 1rem" }}>
        Used to address your complaint to the local Cyber Crime Cell.
      </p>

      <div className="ccr-location-grid">
        <div className="ccr-field">
          <label htmlFor="ccr-country">COUNTRY</label>
          <input id="ccr-country" value={location.country || "India"} readOnly />
        </div>
        <div className="ccr-field">
          <label htmlFor="ccr-state">STATE</label>
          <select id="ccr-state" value={location.state || ""} onChange={(e) => handleStateChange(e.target.value)}>
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="ccr-field">
          <label htmlFor="ccr-city">CITY</label>
          <select
            id="ccr-city"
            value={location.city || ""}
            disabled={!location.state}
            onChange={(e) => onChange({ ...location, city: e.target.value })}
          >
            <option value="">{location.state ? "Select city" : "Select state first"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="button" className="ccr-btn-outline" style={{ marginTop: "1rem" }} onClick={detectLocation}>
        <LocateFixed size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
        Use browser location (optional)
      </button>
      {location.geoDetected ? (
        <p style={{ fontSize: "0.78rem", color: "#4ade80", marginTop: "0.5rem" }}>
          <MapPin size={12} style={{ verticalAlign: "middle" }} /> Location access granted — please confirm state and city
          above.
        </p>
      ) : null}
    </div>
  );
}
