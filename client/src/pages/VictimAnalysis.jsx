import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { Activity, AlertTriangle, ChevronDown, Cpu, Globe, Shield, Download, Sparkles } from "lucide-react";
import AnalysisMarkdown from "../components/AnalysisMarkdown.jsx";
import { apiPath, requestVictimAnalysis } from "../utils/analyseApi.js";
import {
  ALL_SECTOR_LABELS,
  OTHER_SECTOR_LEGEND_DETAIL,
  formatRowDiscoveryIST,
  inferSector,
  safeHostname,
} from "../utils/insights.js";
import {
  companySeedForHub,
  cohortForHub,
  hubKpis,
  velocity7dForCohort,
  sectorPieData,
  sectorIndexPieSlices,
  sectorIndexLegendRows,
  attributionBars,
} from "../utils/victimHubCharts.js";
import { exportVictimHubJpg, exportVictimHubPdf } from "../utils/hubExport.js";

const PIE_COLORS = [
  "var(--cw-chart-bar-1)",
  "var(--cw-red)",
  "var(--cw-chart-bar-4)",
  "#fb923c",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
  "#94a3b8",
  "#64748b",
  "#fbbf24",
  "#2dd4bf",
  "#818cf8",
  "#fb7185",
  "#34d399",
  "#fcd34d",
  "#c084fc",
  "#f97316",
  "#ec4899",
];

export default function VictimAnalysis() {
  const { victimId } = useParams();
  const [row, setRow] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [fetchErr, setFetchErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [summaryMd, setSummaryMd] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState("");
  const exportMenuWrapRef = useRef(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFetchErr("");
    setListErr("");
    setRow(null);
    setAllItems([]);
    setSummaryMd("");
    setSummaryErr("");
    if (!victimId || victimId === "_") {
      setFetchErr("Missing victim id.");
      return undefined;
    }
    (async () => {
      try {
        const [vRes, aRes] = await Promise.all([
          fetch(apiPath(`/api/attacks/${encodeURIComponent(victimId)}`)),
          fetch(apiPath("/api/attacks?limit=1000")),
        ]);
        const vData = await vRes.json().catch(() => ({}));
        if (!vRes.ok) {
          const detail = [vData.message, vData.hint, vData.error].filter(Boolean).join(" — ");
          throw new Error(detail || `Request failed (${vRes.status})`);
        }
        const aData = await aRes.json().catch(() => ({}));
        if (!aRes.ok) setListErr(aData.error || "Could not load index for charts.");
        if (cancelled) return;
        setRow(vData.item);
        setAllItems(Array.isArray(aData.items) ? aData.items : []);
      } catch (e) {
        if (!cancelled) setFetchErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [victimId]);

  const displayHost = row ? safeHostname(row.website) || row.target || victimId : "";
  const hubTitle = displayHost ? `${String(displayHost).toUpperCase()} intelligence hub` : "Intelligence hub";
  const discoveryIst = row ? formatRowDiscoveryIST(row) : null;
  const exportFileBase = useMemo(() => displayHost || victimId || "intel-hub", [displayHost, victimId]);

  const seed = useMemo(() => (row ? companySeedForHub(row, victimId) : ""), [row, victimId]);
  const cohort = useMemo(() => (allItems.length && seed ? cohortForHub(allItems, seed) : []), [allItems, seed]);
  const cohortOrFocus = useMemo(() => (cohort.length ? cohort : row ? [row] : []), [cohort, row]);

  const kpis = useMemo(() => hubKpis(cohortOrFocus, row), [cohortOrFocus, row]);
  const velocity = useMemo(() => velocity7dForCohort(cohortOrFocus), [cohortOrFocus]);
  const cohortSectorMix = useMemo(() => sectorPieData(cohortOrFocus), [cohortOrFocus]);
  const sectorsIndex = useMemo(() => sectorPieData(allItems), [allItems]);
  const sectorPieSlices = useMemo(() => sectorIndexPieSlices(allItems), [allItems]);
  const sectorLegendRows = useMemo(() => sectorIndexLegendRows(allItems), [allItems]);

  const indexSectorTop = useMemo(() => {
    const tot = sectorsIndex.reduce((a, x) => a + x.value, 0);
    if (!tot) return { name: null, pct: 0, tot: 0, count: 0 };
    const top = [...sectorsIndex].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))[0];
    return {
      name: top.name,
      pct: Math.round((10000 * top.value) / tot) / 100,
      tot,
      count: top.value,
    };
  }, [sectorsIndex]);
  const useNationalAttribution = cohort.length < 2 && allItems.length > 0;
  const attribution = useMemo(
    () => attributionBars(useNationalAttribution ? allItems : cohortOrFocus, 8),
    [useNationalAttribution, allItems, cohortOrFocus]
  );

  const hubExportPayload = useMemo(
    () => ({
      hubTitle,
      victimId,
      discoveryIst,
      attack_estimated: row?.attack_estimated,
      row,
      kpis,
      velocity,
      sectorLegendRows,
      attribution,
      attributionScope: useNationalAttribution ? "National index (top groups)" : "Cohort (same organisation)",
      summaryMd,
      cohortRows: cohortOrFocus.slice(0, 80).map((r) => ({
        victim_id: r.victim_id,
        target: r.target,
        group: r.group,
        sector: inferSector(r),
        discovered_date: r.discovered_date || "—",
      })),
    }),
    [
      hubTitle,
      victimId,
      discoveryIst,
      row,
      kpis,
      velocity,
      sectorLegendRows,
      attribution,
      useNationalAttribution,
      summaryMd,
      cohortOrFocus,
    ]
  );

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    function onDocMouseDown(e) {
      const el = exportMenuWrapRef.current;
      if (el && !el.contains(e.target)) setExportMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [exportMenuOpen]);

  const runExport = useCallback(
    async (kind) => {
      if (!row) return;
      setExportBusy(true);
      setExportMenuOpen(false);
      try {
        const payload = { ...hubExportPayload, generatedAt: new Date().toISOString() };
        if (kind === "jpg") await exportVictimHubJpg(payload, exportFileBase);
        else await exportVictimHubPdf(payload, exportFileBase);
      } catch (e) {
        window.alert(e?.message || String(e));
      } finally {
        setExportBusy(false);
      }
    },
    [exportFileBase, hubExportPayload, row]
  );

  async function runExecutiveSummary() {
    if (!row) return;
    setSummaryLoading(true);
    setSummaryErr("");
    setSummaryMd("");
    const chartContext = {
      hub_kpis: kpis,
      company_seed: seed,
      cohort_size: cohort.length,
      cohort_sector_mix_counts: cohortSectorMix,
      velocity_7d: velocity,
      sector_distribution_index_pct: sectorLegendRows.map(({ name, count, pct }) => ({
        sector: name,
        incidents: count,
        pct_of_loaded_index: pct,
      })),
      attribution_matrix: attribution.map(({ name, count }) => ({ name, count })),
      attribution_scope: useNationalAttribution ? "national_index_top_groups" : "cohort_same_company_match",
    };
    try {
      const md = await requestVictimAnalysis(row, chartContext);
      setSummaryMd(md);
    } catch (e) {
      setSummaryErr(e?.message || String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  if (fetchErr) {
    return (
      <div className="cw-hub-page">
        <Link to="/victims" className="cw-btn-outline cw-hub-back">
          ← Back to intelligence
        </Link>
        <div className="cw-banner err">{fetchErr}</div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="cw-hub-page">
        <div className="cw-analyse-status" aria-busy="true">
          <span className="cw-spin" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className="cw-hub-page">
      <div className="cw-hub-top">
        <Link to="/victims" className="cw-btn-outline cw-hub-back">
          ← Back to intelligence
        </Link>
        <div className="cw-hub-actions">
          <div className="cw-hub-export-menu-wrap" ref={exportMenuWrapRef}>
            <button
              type="button"
              className="cw-btn-outline cw-hub-export-trigger"
              disabled={exportBusy}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((o) => !o)}
            >
              <Download size={14} aria-hidden />
              {exportBusy ? "Exporting…" : "Export"}
              <ChevronDown size={14} aria-hidden className={exportMenuOpen ? "cw-hub-chevron--open" : ""} />
            </button>
            {exportMenuOpen ? (
              <div className="cw-hub-export-menu" role="menu">
                <button type="button" className="cw-hub-export-item" role="menuitem" onClick={() => runExport("pdf")}>
                  Export as PDF
                </button>
                <button type="button" className="cw-hub-export-item" role="menuitem" onClick={() => runExport("jpg")}>
                  Export as JPG
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="cw-hub-export-root">
      <header className="cw-hub-hero">
        <div className="cw-hub-hero-icon" aria-hidden>
          <Activity size={28} />
        </div>
        <div>
          <h1 className="cw-hub-hero-title">{hubTitle}</h1>
          {discoveryIst || row.attack_estimated ? (
            <p className="cw-hub-hero-dates">
              {discoveryIst ? (
                <span>
                  <span className="cw-hub-hero-dates-label">Discovered</span> {discoveryIst}
                </span>
              ) : null}
              {discoveryIst && row.attack_estimated ? (
                <span className="cw-hub-hero-dates-sep" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
              ) : null}
              {row.attack_estimated ? (
                <span>
                  <span className="cw-hub-hero-dates-label">Est. attack</span> {String(row.attack_estimated).trim()}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <div className="cw-hub-kpis">
        <div className="cw-hub-kpi">
          <Globe className="cw-hub-kpi-ic" />
          <div className="cw-hub-kpi-label">Total observed</div>
          <div className="cw-hub-kpi-val">{kpis.totalObserved}</div>
        </div>
        <div className="cw-hub-kpi">
          <AlertTriangle className="cw-hub-kpi-ic" />
          <div className="cw-hub-kpi-label">Critical priority</div>
          <div className="cw-hub-kpi-val">{kpis.criticalPriority}</div>
        </div>
        <div className="cw-hub-kpi">
          <Cpu className="cw-hub-kpi-ic" />
          <div className="cw-hub-kpi-label">Targeted sectors</div>
          <div className="cw-hub-kpi-val">{kpis.targetedSectors}</div>
        </div>
        <div className="cw-hub-kpi">
          <Shield className="cw-hub-kpi-ic" />
          <div className="cw-hub-kpi-label">Active campaigns</div>
          <div className="cw-hub-kpi-val">{kpis.activeCampaigns}</div>
        </div>
      </div>

      <section className="cw-hub-ai-panel">
        <div className="cw-hub-ai-head">
          <Sparkles size={20} className="cw-hub-ai-spark" />
          <div>
            <h2 className="cw-hub-ai-title">AI strategic intelligence</h2>
          </div>
        </div>
        <button type="button" className="cw-hub-exec-btn" onClick={runExecutiveSummary} disabled={summaryLoading}>
          {summaryLoading ? "Running Gemini…" : "Executive AI summary"}
        </button>
        {listErr ? <div className="cw-banner warn" style={{ marginTop: "0.65rem" }}>{listErr}</div> : null}
        {summaryErr ? <div className="cw-banner err" style={{ marginTop: "0.65rem" }}>{summaryErr}</div> : null}
        {summaryMd ? (
          <div className="cw-hub-summary-body">
            <AnalysisMarkdown source={summaryMd} />
          </div>
        ) : null}
      </section>

      <div className="cw-hub-charts">
        <div className="cw-hub-chart-card">
          <div className="cw-hub-chart-head">
            <h3>Incident velocity trend</h3>
            <span className="cw-hub-chart-pill">7 day waveform</span>
          </div>
          <div className="cw-hub-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cwVelFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cw-chart-bar-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--cw-chart-bar-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" />
                <XAxis dataKey="day" tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "var(--cw-chart-tooltip-bg)",
                    border: "1px solid var(--cw-chart-tooltip-border)",
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="var(--cw-chart-bar-1)" fill="url(#cwVelFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cw-hub-chart-card cw-hub-sector-distribution">
          <div className="cw-hub-chart-head">
            <h3>Sector distribution</h3>
            <span className="cw-hub-chart-pill">Full live index</span>
          </div>
          <div className="cw-hub-pie-stack">
            {sectorPieSlices.length ? (
              <div className="cw-hub-pie-chart-row">
                <div className="cw-hub-pie-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorPieSlices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={86}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {sectorPieSlices.map((s) => {
                          const idx = ALL_SECTOR_LABELS.indexOf(s.name);
                          const fill = PIE_COLORS[(idx >= 0 ? idx : 0) % PIE_COLORS.length];
                          return <Cell key={s.name} fill={fill} />;
                        })}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--cw-chart-tooltip-bg)",
                          border: "1px solid var(--cw-chart-tooltip-border)",
                        }}
                        formatter={(value, _n, item) => {
                          const p = item?.payload;
                          if (p?.count != null) {
                            return [`${p.count} rows · ${Number(value).toFixed(1)}% of index`, String(p.name)];
                          }
                          return [value, _n];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {indexSectorTop.name ? (
                    <div className="cw-hub-pie-center" aria-hidden>
                      <div className="cw-hub-pie-center-v">{indexSectorTop.name}</div>
                      <div className="cw-hub-pie-center-p">{indexSectorTop.pct.toFixed(1)}%</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="cw-hub-empty cw-hub-pie-empty" aria-hidden />
            )}
            <div className="cw-hub-pie-legend-scroll">
              <ul className="cw-hub-pie-legend">
                {sectorLegendRows.map((s) => {
                  const idx = ALL_SECTOR_LABELS.indexOf(s.name);
                  const fill = PIE_COLORS[(idx >= 0 ? idx : 0) % PIE_COLORS.length];
                  return (
                    <li key={s.name}>
                      <span className="cw-hub-dot" style={{ background: fill }} />
                      <span className="cw-hub-pie-legend-label">
                        <span className="cw-hub-pie-legend-primary">{s.name}</span>
                        {s.name === "Other" ? (
                          <span className="cw-hub-pie-legend-detail">{OTHER_SECTOR_LEGEND_DETAIL}</span>
                        ) : null}
                      </span>
                      <span className="cw-hub-pie-legend-pcts">
                        <strong>{s.pct.toFixed(1)}%</strong>
                        <span className="cw-hub-pie-legend-sep">of index</span>
                        <strong>{s.count}</strong>
                        <span className="cw-hub-pie-legend-sep">rows</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="cw-hub-chart-card cw-hub-chart-full">
        <div className="cw-hub-chart-head">
          <h3>
            <Shield size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            Attribution matrix
          </h3>
          <span className="cw-hub-chart-pill">{useNationalAttribution ? "National context" : "Cohort match"}</span>
        </div>
        <div className="cw-hub-chart-h cw-hub-bar-h">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attribution} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--cw-chart-axis)", fontSize: 9 }} interval={0} angle={-12} textAnchor="end" height={56} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} width={28} />
              <Tooltip
                contentStyle={{
                  background: "var(--cw-chart-tooltip-bg)",
                  border: "1px solid var(--cw-chart-tooltip-border)",
                }}
                formatter={(value, _name, props) => [String(value), String(props?.payload?.full || props?.payload?.name || "")]}
              />
              <Bar dataKey="count" fill="var(--cw-chart-bar-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      </div>
    </div>
  );
}
