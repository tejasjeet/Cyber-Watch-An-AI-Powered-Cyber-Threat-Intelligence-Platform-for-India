import { Link } from "react-router-dom";
import { Zap, Users, Database } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../context/DataContext.jsx";
import {
  sectorCounts,
  groupCounts,
  feedFromItems,
  topVictimRowsByDiscovery,
  feedEntryFromRow,
  stateCounts,
  uniqueImpactedCount,
  yearOverYearIndexedCount,
  yearOverYearImpactedTargets,
  yearOverYearProofLinks,
  latestDataYearIST,
} from "../utils/insights.js";
import StatusBadge from "../components/StatusBadge.jsx";
import AttackMap from "../components/map/AttackMap.jsx";

/** YoY “current” year: optional VITE_KPI_COMPARE_YEAR, else latest discovery year in data, else 2025. */
function resolveKpiCompareYear(items) {
  const raw = import.meta.env.VITE_KPI_COMPARE_YEAR;
  if (raw != null && String(raw).trim() !== "") {
    const y = Number(raw);
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  }
  return latestDataYearIST(items) ?? 2025;
}

/** Ease-out cubic for KPI count / % transitions when new data arrives from the API / socket. */
function useAnimatedNumber(target, { durationMs = 700 } = {}) {
  const [value, setValue] = useState(() => (Number.isFinite(target) ? target : 0));
  const prevRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (prevRef.current === null) {
      prevRef.current = target;
      setValue(target);
      return;
    }
    if (prevRef.current === target) return;

    const from = prevRef.current;
    const to = target;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - t) ** 3;
      setValue(from + (to - from) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else {
        prevRef.current = to;
        setValue(to);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return value;
}

function KpiDeltaAnimated({ change }) {
  const pct = change?.pct;
  const [shown, setShown] = useState(null);
  const prevRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!change || !Number.isFinite(pct)) {
      prevRef.current = null;
      setShown(null);
      return;
    }

    if (prevRef.current === null) {
      prevRef.current = pct;
      setShown(pct);
      return;
    }
    if (prevRef.current === pct) {
      setShown(pct);
      return;
    }

    const from = prevRef.current;
    const to = pct;
    const start = performance.now();
    const durationMs = 850;

    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - t) ** 3;
      setShown(from + (to - from) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else {
        prevRef.current = to;
        setShown(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [change, pct]);

  if (shown == null || !Number.isFinite(shown)) {
    return (
      <div className="cw-kpi-foot">
        <span className="cw-kpi-delta muted">—</span>
      </div>
    );
  }

  const rounded = Math.abs(shown) >= 10 ? Math.round(shown) : Math.round(shown * 10) / 10;
  const sign = shown > 0 ? "+" : shown < 0 ? "-" : "";
  const text = `${sign}${Math.abs(rounded)}%`;
  const up = shown >= 0;

  return (
    <div className="cw-kpi-foot">
      <span className={`cw-kpi-delta cw-kpi-delta--live ${up ? "up" : "down"}`}>{text}</span>
    </div>
  );
}

/** One line: sector line + optional org name; site is shown on line 2 only. */
function disclosureBannerHeadline(slide) {
  if (!slide) return "";
  const orgRaw = slide.row?.target?.trim() ? String(slide.row.target).trim() : "";
  const org = orgRaw.toUpperCase().replace(/\s+/g, " ");
  const site = (slide.target || "").toUpperCase().replace(/\s/g, "");
  const orgCompact = org.replace(/\s/g, "");
  if (!orgCompact || orgCompact === site) return slide.event;
  return `${slide.event} · ${org}`;
}

export default function Dashboard() {
  const { items, stats, loading, error, load, live } = useData();
  /** Bumps every 1s so “ago” labels stay accurate. */
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveNowMs = Date.now();
  const topFiveRows = useMemo(() => topVictimRowsByDiscovery(items, 5), [items]);
  const topFiveKey = useMemo(() => topFiveRows.map((r) => r.victim_id).join("|"), [topFiveRows]);
  const [recentSlideIx, setRecentSlideIx] = useState(0);

  useEffect(() => {
    setRecentSlideIx(0);
  }, [topFiveKey]);

  useEffect(() => {
    if (topFiveRows.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setRecentSlideIx((i) => (i + 1) % topFiveRows.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [topFiveRows.length, topFiveKey]);

  const recentSlide =
    topFiveRows.length > 0
      ? feedEntryFromRow(topFiveRows[recentSlideIx % topFiveRows.length], liveNowMs)
      : null;

  const feed = useMemo(() => feedFromItems(items, 8, liveNowMs), [items, clockTick]);
  const sectors = sectorCounts(items).slice(0, 6);
  const groups = groupCounts(items).slice(0, 6);
  const choropleth = stateCounts(items);

  const total = stats?.total ?? items.length;
  const impacted = uniqueImpactedCount(items);
  const proofs = items.reduce((a, r) => a + (r.proof_links?.length || 0), 0);

  const kpiCompareYear = useMemo(() => resolveKpiCompareYear(items), [items]);
  const wowTotal = useMemo(() => yearOverYearIndexedCount(items, kpiCompareYear), [items, kpiCompareYear]);
  const wowImpact = useMemo(() => yearOverYearImpactedTargets(items, kpiCompareYear), [items, kpiCompareYear]);
  const wowProof = useMemo(() => yearOverYearProofLinks(items, kpiCompareYear), [items, kpiCompareYear]);

  const totalDisplay = useAnimatedNumber(total, { durationMs: 650 });
  const impactedDisplay = useAnimatedNumber(impacted, { durationMs: 650 });
  const proofsDisplay = useAnimatedNumber(proofs, { durationMs: 650 });

  const [kpiPulse, setKpiPulse] = useState(false);
  const dataSnapRef = useRef("");
  const dataInitRef = useRef(false);

  useEffect(() => {
    const sig = `${stats?.total ?? items.length}:${items.length}:${String(stats?.latest?.updated_at ?? "")}:${live.lastEvent?.at ?? ""}`;
    if (!dataInitRef.current) {
      dataInitRef.current = true;
      dataSnapRef.current = sig;
      return;
    }
    if (sig === dataSnapRef.current) return;
    dataSnapRef.current = sig;
    setKpiPulse(true);
    const t = window.setTimeout(() => setKpiPulse(false), 950);
    return () => window.clearTimeout(t);
  }, [stats?.total, stats?.latest?.updated_at, items.length, live.lastEvent?.at]);

  const mapHeight = "clamp(440px, min(58vh, 72vw), 860px)";
  const kpiPulseClass = kpiPulse ? " cw-kpi--refresh-pulse" : "";

  return (
    <div className="cw-dashboard">
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-alert-banner cw-live-incident-banner">
        <div className="cw-live-incident-banner-main">
          <div className="cw-live-incident-head">
            <span
              className={`cw-live-incident-dot ${live.connected ? "cw-live-incident-dot--on" : ""}`}
              title={live.connected ? "Data refresh channel connected" : "Data refresh channel standby"}
              aria-hidden
            />
            <span className="cw-live-incident-title">
              Recent disclosures (India feed)
              {topFiveRows.length > 1 ? (
                <span className="cw-live-incident-slide-idx">
                  {" "}
                  · {recentSlideIx % topFiveRows.length + 1}/{topFiveRows.length}
                </span>
              ) : null}
            </span>
          </div>
          {!recentSlide ? (
            <p className="cw-live-incident-line">No incidents loaded yet — use Refresh or sign in to run an intel refresh.</p>
          ) : (
            <div
              key={recentSlide.id != null ? String(recentSlide.id) : `slide-${recentSlideIx}`}
              className="cw-recent-incident-slide"
              aria-live="polite"
              aria-label={`Disclosure ${(recentSlideIx % topFiveRows.length) + 1} of ${topFiveRows.length}`}
            >
              <div className="cw-recent-incident-row cw-recent-incident-row--solo">
                <div className="cw-recent-incident-time">
                  <span className="cw-recent-incident-ago">{recentSlide.time}</span>
                  {recentSlide.discoveredIst ? (
                    <span className="cw-recent-incident-ist">{recentSlide.discoveredIst}</span>
                  ) : null}
                </div>
                <div className="cw-recent-incident-body">
                  <p className="cw-recent-incident-line1">{disclosureBannerHeadline(recentSlide)}</p>
                  <div className="cw-recent-incident-target">PRIMARY TARGET: {recentSlide.target}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button type="button" className="cw-btn-outline" onClick={() => load(false)}>
          Refresh
        </button>
      </div>

      <div className="cw-grid cols-3 cw-dashboard-kpis">
        <div className={`cw-kpi kpi-blue${kpiPulseClass}`}>
          <div className="cw-kpi-label">Total attacks detected</div>
          <div className="cw-kpi-val">{Math.round(totalDisplay).toLocaleString()}</div>
          <KpiDeltaAnimated change={wowTotal} />
          <Zap style={{ position: "absolute", right: 14, top: 14, opacity: 0.18 }} size={52} strokeWidth={1.25} />
        </div>
        <div className={`cw-kpi kpi-pink${kpiPulseClass}`}>
          <div className="cw-kpi-label">Impacted entities</div>
          <div className="cw-kpi-val">{Math.round(impactedDisplay).toLocaleString()}</div>
          <KpiDeltaAnimated change={wowImpact} />
          <Users style={{ position: "absolute", right: 14, top: 14, opacity: 0.18 }} size={52} strokeWidth={1.25} />
        </div>
        <div className={`cw-kpi kpi-green${kpiPulseClass}`}>
          <div className="cw-kpi-label">Exfiltrated intelligence</div>
          <div className="cw-kpi-val">{Math.round(proofsDisplay).toLocaleString()}</div>
          <KpiDeltaAnimated change={wowProof} />
          <Database style={{ position: "absolute", right: 14, top: 14, opacity: 0.18 }} size={52} strokeWidth={1.25} />
        </div>
      </div>

      <div className="cw-grid cw-dashboard-hero">
        <div className="cw-card cw-dashboard-map-card">
          <div className="cw-card-head">
            <h2 className="cw-card-title">National intelligence grid</h2>
          </div>
          <AttackMap choroplethCounts={choropleth} height={mapHeight} />
        </div>
        <div className="cw-card cw-dashboard-feed-card">
          <div className="cw-card-head">
            <h2 className="cw-card-title">Mission critical live feed</h2>
            <Link to="/live" className="cw-btn-outline" style={{ textDecoration: "none", display: "inline-block" }}>
              View complete logs
            </Link>
          </div>
          <div className="cw-feed cw-dashboard-feed">
            {feed.map((f) => (
              <div key={f.id} className="cw-feed-row">
                <div className="cw-feed-time-stack">
                  <span className="cw-feed-time">{f.time}</span>
                  {f.discoveredIst ? <span className="cw-feed-discovered">{f.discoveredIst}</span> : null}
                </div>
                <StatusBadge>{f.status}</StatusBadge>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.event}</div>
                  <div className="cw-feed-target">TARGET: {f.target}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cw-grid cols-2 cw-dashboard-charts">
        <div className="cw-card">
          <h2 className="cw-card-title" style={{ marginBottom: "0.5rem" }}>
            Sector threat concentration
          </h2>
          <div className="cw-dashboard-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectors} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 11 }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={72}
                />
                <YAxis tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--cw-chart-tooltip-bg)",
                    border: "1px solid var(--cw-chart-tooltip-border)",
                  }}
                />
                <Bar dataKey="count" fill="var(--cw-chart-bar-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="cw-card">
          <h2 className="cw-card-title" style={{ marginBottom: "0.5rem" }}>
            Attribution magnitude
          </h2>
          <div className="cw-dashboard-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={groups} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fill: "var(--cw-chart-axis)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--cw-chart-tooltip-bg)",
                    border: "1px solid var(--cw-chart-tooltip-border)",
                  }}
                />
                <Bar dataKey="count" fill="var(--cw-chart-bar-2)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
