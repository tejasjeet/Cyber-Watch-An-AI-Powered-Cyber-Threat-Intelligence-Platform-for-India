import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import * as d3 from "d3";
import { MapPin, AlertTriangle } from "lucide-react";
import { MAP_YEAR } from "../../constants/mapConstants.js";
import "./AttackMap.css";

function apiPath(p) {
  const base = import.meta.env.VITE_API_BASE || "";
  return `${base}${p}`;
}

function normState(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


function countForState(mergeCounts, geoName) {
  const g = normState(geoName).replace(/\bncr\b/g, "").replace(/\s+/g, " ").trim();
  let best = 0;
  for (const row of mergeCounts) {
    const r = normState(row.name).replace(/\bncr\b/g, "").replace(/\s+/g, " ").trim();
    if (!r) continue;
    if (g === r || g.includes(r) || r.includes(g)) best = Math.max(best, row.count);
  }
  if (g.includes("delhi")) {
    for (const row of mergeCounts) {
      if (normState(row.name).includes("delhi")) best = Math.max(best, row.count);
    }
  }
  return best;
}

function stateNameFromFeature(f) {
  const p = f.properties || {};
  return String(
    p.ST_NM || p.NAME_1 || p.name || p.name_en || p.state || p.STATE_NAME || p.NM || p.NAME || ""
  ).trim();
}

const REMOTE_STATE_FOR_BOUNDS = /andaman|nicobar|lakshadweep/i;

function featureSubsetForFitBounds(features) {
  const mainland = features.filter((f) => !REMOTE_STATE_FOR_BOUNDS.test(stateNameFromFeature(f)));
  return mainland.length > 0 ? mainland : features;
}

function boundsFromFeatures(features) {
  try {
    const layer = L.geoJSON({ type: "FeatureCollection", features });
    const b = layer.getBounds();
    return b.isValid() ? b : null;
  } catch {
    return null;
  }
}

export default function AttackMap({ choroplethCounts = [], height = 440 }) {
  const year = MAP_YEAR;
  const mapEl = useRef(null);
  const [phase, setPhase] = useState("loading");

  const mergeKey = useMemo(() => JSON.stringify(choroplethCounts || []), [choroplethCounts]);
  const mergeCounts = useMemo(() => JSON.parse(mergeKey), [mergeKey]);

  useEffect(() => {
    if (!mapEl.current) return undefined;
    let cancelled = false;
    let map = null;

    try {
      const el = mapEl.current;
      if (el._leaflet_id != null) {
        delete el._leaflet_id;
      }
      map = L.map(el, { zoomControl: true, attributionControl: true }).setView([22.6, 79.2], 5);
    } catch (e) {
      console.error(e);
      if (!cancelled) setPhase("error");
      return undefined;
    }

    // Basemap: Carto Dark Matter (OSM-backed) — free, no API key; attribution OSM + CARTO
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    const loadGeo = async () => {
      let text;
      try {
        const r1 = await fetch("/geo/india-states.geojson");
        if (!r1.ok) throw new Error(String(r1.status));
        text = await r1.text();
      } catch {
        const r2 = await fetch(apiPath("/api/geo/india-states"));
        if (!r2.ok) throw new Error(String(r2.status));
        text = await r2.text();
      }
      return JSON.parse(text);
    };

    loadGeo()
      .then((geo) => {
        if (cancelled || !map) return;
        let fc = geo;
        if (fc.features?.length && fc.features[0]?.properties?.adm0_a3 !== undefined) {
          fc = {
            ...fc,
            features: fc.features.filter((f) => f.properties?.adm0_a3 === "IND"),
          };
        }
        const features = fc.features || [];
        const counts = features.map((f) => countForState(mergeCounts, stateNameFromFeature(f)));
        const max = d3.max(counts) || 1;
        const colorHigh = d3.scaleSequential(d3.interpolateReds).domain([0, max]);
        const colorLow = d3.scaleSequential(d3.interpolateBlues).domain([max, 0]);

        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const c = countForState(mergeCounts, stateNameFromFeature(feature));
            const fill = c <= 0 ? colorLow(0) : colorHigh(c);
            return {
              fillColor: fill,
              weight: 1,
              opacity: 1,
              color: "rgba(15,23,42,0.95)",
              fillOpacity: c > 0 ? 0.82 : 0.38,
            };
          },
          onEachFeature: (feature, lyr) => {
            const name = stateNameFromFeature(feature);
            const c = countForState(mergeCounts, name);
            const critical = Math.max(0, Math.round(c * 0.12));
            lyr.bindTooltip(
              `<div class="attack-map-tip" style="font-family: system-ui, sans-serif"><strong>${name}</strong><br/>${year} incidents: <b>${c}</b><br/>Critical: <b>${critical}</b></div>`,
              { sticky: true, className: "attack-map-tooltip" }
            );
          },
        }).addTo(map);

        const markers = L.layerGroup().addTo(map);
        features.forEach((f) => {
          const name = stateNameFromFeature(f);
          const c = countForState(mergeCounts, name);
          if (c <= 0) return;
          let lng;
          let lat;
          try {
            [lng, lat] = d3.geoCentroid(f);
          } catch {
            return;
          }
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const m = L.circleMarker([lat, lng], {
            radius: Math.min(16, 4 + c / 28),
            fillColor: "#00aeef",
            color: "#0369a1",
            weight: 1,
            fillOpacity: 0.78,
          });
          m.bindTooltip(
            `<span style="font-family: system-ui, sans-serif">${name} · ${c} in ${year}</span>`,
            { direction: "top" }
          );
          m.addTo(markers);
        });

        const indiaViewBounds = boundsFromFeatures(featureSubsetForFitBounds(features)) || layer.getBounds();
        try {
          map.fitBounds(indiaViewBounds, { padding: [10, 10], maxZoom: 10 });
        } catch {
          /* ignore */
        }
        setPhase("ready");
        setTimeout(() => {
          if (cancelled || !map) return;
          map.invalidateSize();
          try {
            map.fitBounds(indiaViewBounds, { padding: [10, 10], maxZoom: 10 });
          } catch {
            /* ignore */
          }
        }, 120);
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    return () => {
      cancelled = true;
      if (map) {
        try {
          map.remove();
        } catch {
          /* ignore */
        }
      }
    };
  }, [mergeKey, year]);

  return (
    <div className="attack-map-shell">
      <div className="attack-map-head">
        <div>
          <h2 className="attack-map-title">
            <MapPin size={22} strokeWidth={2} aria-hidden />
            National Intelligence Grid
          </h2>
        </div>
        <div className="attack-map-live" aria-label="Live stream indicator">
          <span className="attack-map-live-dot" />
          LIVE STREAM
        </div>
      </div>

      <div
        className="attack-map-body"
        style={{ height: typeof height === "string" ? height : height }}
      >
        {phase === "loading" && (
          <div className="attack-map-overlay" role="status" aria-label="Loading map">
            <div className="attack-map-spinner" aria-hidden />
          </div>
        )}
        {phase === "error" && (
          <div className="attack-map-overlay attack-map-overlay-err" role="alert">
            <AlertTriangle size={28} aria-hidden />
            <p className="attack-map-err-title">Map unavailable</p>
          </div>
        )}
        <div
          ref={mapEl}
          className="attack-map-leaflet"
          style={{ visibility: phase === "ready" ? "visible" : "hidden" }}
        />

        {phase === "ready" && (
          <div className="attack-map-legend">
            <div className="attack-map-legend-title">Intensity ({year})</div>
            <div className="attack-map-legend-row">
              <span className="lg sw4" /> CRITICAL HOTSPOT
            </div>
            <div className="attack-map-legend-row">
              <span className="lg sw3" /> HIGH CONCENTRATION
            </div>
            <div className="attack-map-legend-row">
              <span className="lg sw2" /> MODERATE ACTIVITY
            </div>
            <div className="attack-map-legend-row">
              <span className="lg sw1" /> LOW / NO ACTIVITY
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
