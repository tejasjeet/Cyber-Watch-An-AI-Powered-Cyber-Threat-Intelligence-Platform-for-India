import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Globe2,
  Radar,
  Shield,
  Skull,
  Terminal,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AnalysisMarkdown from "../components/AnalysisMarkdown.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useData } from "../context/DataContext.jsx";
import { analysisPagePath } from "../utils/analysisUrl.js";
import { buildGroupDeploymentBriefingMarkdown } from "../utils/groupDeploymentLocalBriefing.js";
import {
  buildGroupDeploymentAiContext,
  cardForGroup,
  filterItemsByGroup,
  killChainTemplate,
  lastActivityLabel,
  malwareFootprintStub,
  riskScoreFromSignals,
  sectorMixForGroup,
  stateCountsForGroup,
  timelineForGroup,
  weeklySeriesForGroup,
} from "../utils/groupDeployment.js";
import { formatTimeIST } from "../utils/datetimeIST.js";
import { parseRowTime, victimRowsFromItems } from "../utils/insights.js";

function activityGlowClass(activity) {
  const a = String(activity || "").toLowerCase();
  if (a === "extreme") return "cw-deploy-hero--extreme";
  if (a === "high") return "cw-deploy-hero--high";
  if (a === "moderate") return "cw-deploy-hero--moderate";
  return "cw-deploy-hero--elevated";
}

export default function DeploymentAnalysis() {
  const { groupEnc } = useParams();
  const groupName = useMemo(() => {
    try {
      return decodeURIComponent(groupEnc || "");
    } catch {
      return "";
    }
  }, [groupEnc]);

  const { items, loading, error, live } = useData();
  const [tableQ, setTableQ] = useState("");

  const card = useMemo(() => cardForGroup(items, groupName), [items, groupName]);
  const cohort = useMemo(() => filterItemsByGroup(items, groupName), [items, groupName]);
  const lastMs = useMemo(
    () => cohort.reduce((m, r) => Math.max(m, parseRowTime(r) || 0), 0),
    [cohort]
  );

  const risk = useMemo(
    () =>
      riskScoreFromSignals({
        count: cohort.length,
        lastMs,
        activity: card?.activity || "ELEVATED",
      }),
    [cohort.length, lastMs, card?.activity]
  );

  const timeline = useMemo(() => timelineForGroup(items, groupName, 16), [items, groupName]);
  const states = useMemo(() => stateCountsForGroup(items, groupName).slice(0, 10), [items, groupName]);
  const sectors = useMemo(() => sectorMixForGroup(items, groupName).slice(0, 8), [items, groupName]);
  const weekly = useMemo(() => weeklySeriesForGroup(items, groupName, 10), [items, groupName]);
  const malware = useMemo(() => malwareFootprintStub(groupName), [groupName]);
  const chain = useMemo(() => killChainTemplate(), []);

  const tableRows = useMemo(() => {
    const rows = victimRowsFromItems(cohort);
    const q = tableQ.trim().toLowerCase();
    if (!q) return rows.slice(0, 120);
    return rows
      .filter(
        (r) =>
          r.entity.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q) ||
          r.group.toLowerCase().includes(q) ||
          String(r.id).toLowerCase().includes(q)
      )
      .slice(0, 120);
  }, [cohort, tableQ]);

  const terminalLines = useMemo(() => {
    const lines = [];
    const stamp = () => formatTimeIST(Date.now());
    lines.push(`[${stamp()}] [INFO] SOC feed — group filter: ${groupName || "—"}`);
    if (live.connected) lines.push(`[${stamp()}] [LIVE] Intel socket connected — index refresh channel active`);
    else lines.push(`[${stamp()}] [STBY] Intel socket offline — showing cached index rows`);
    cohort.slice(0, 4).forEach((row, i) => {
      const ent = (row.target || row.victim_id || "ROW").toString().slice(0, 42);
      lines.push(`[${stamp()}] [ROW] disclosure ${i + 1}: ${ent}`);
    });
    lines.push(`[${stamp()}] [NOTE] Log lines are UI staging + indexed row hints — not live EDR telemetry.`);
    return lines;
  }, [cohort, groupName, live.connected]);

  const deploymentBriefingMd = useMemo(() => {
    if (!groupName || !cohort.length) return "";
    const ctx = buildGroupDeploymentAiContext(items, groupName, card);
    return buildGroupDeploymentBriefingMarkdown(groupName, ctx);
  }, [items, groupName, card, cohort.length]);

  const invalid = !groupName || (!card && cohort.length === 0);

  return (
    <div className="cw-deploy-page">
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-deploy-back">
        <Link to="/groups" className="cw-btn-outline cw-deploy-back-link">
          <ArrowLeft size={16} aria-hidden />
          Adversary monitoring
        </Link>
      </div>

      {invalid ? (
        <div className="cw-card cw-deploy-invalid">
          <h2 className="cw-page-title">Group not found</h2>
          <p style={{ color: "#94a3b8", marginTop: "0.5rem" }}>
            No indexed victims match <strong>{groupName || "(missing)"}</strong>. Open{" "}
            <Link to="/groups">Ransomware groups</Link> and choose a card.
          </p>
        </div>
      ) : (
        <>
          <header className={`cw-deploy-hero ${activityGlowClass(card?.activity)}`}>
            <div className="cw-deploy-hero-grid">
              <div className="cw-deploy-hero-icon" aria-hidden>
                <Skull size={36} strokeWidth={1.5} />
              </div>
              <div className="cw-deploy-hero-main">
                <div className="cw-deploy-hero-title-row">
                  <h1 className="cw-deploy-hero-title">{groupName.toUpperCase()}</h1>
                  <span className={`cw-deploy-live-dot ${live.connected ? "cw-deploy-live-dot--on" : ""}`} aria-hidden />
                </div>
                <div className="cw-deploy-hero-kpis">
                  <div>
                    <span className="cw-deploy-kpi-label">Status</span>
                    <div className="cw-deploy-kpi-val">
                      <StatusBadge>{card?.status || "ACTIVE"}</StatusBadge>
                    </div>
                  </div>
                  <div>
                    <span className="cw-deploy-kpi-label">Threat level</span>
                    <div className={`cw-deploy-kpi-val cw-deploy-threat ${String(card?.activity || "").toLowerCase()}`}>
                      {card?.activity || "—"}
                    </div>
                  </div>
                  <div>
                    <span className="cw-deploy-kpi-label">Indexed victims</span>
                    <div className="cw-deploy-kpi-val">{cohort.length}</div>
                  </div>
                  <div>
                    <span className="cw-deploy-kpi-label">Last activity</span>
                    <div className="cw-deploy-kpi-val">{lastActivityLabel(items, groupName)}</div>
                  </div>
                  <div>
                    <span className="cw-deploy-kpi-label">Deployment risk</span>
                    <div className="cw-deploy-kpi-val">{risk}/100</div>
                  </div>
                </div>
              </div>
              <div className="cw-deploy-hero-flag" title="India-focused index (scrape context)">
                <Globe2 size={22} aria-hidden />
                <span>IN INDEX</span>
              </div>
            </div>
            <div className="cw-deploy-risk-gauge" aria-hidden>
              <div className="cw-deploy-risk-gauge-fill" style={{ width: `${risk}%` }} />
            </div>
          </header>

          <section className="cw-deploy-section cw-deploy-ai">
            <div className="cw-deploy-section-head">
              <Radar size={20} aria-hidden />
              <h2>Deployment briefing</h2>
              <span className="cw-deploy-pill">Local · index JSON only</span>
            </div>
            {deploymentBriefingMd ? (
              <div className="cw-deploy-markdown">
                <AnalysisMarkdown source={deploymentBriefingMd} />
              </div>
            ) : (
              <p className="cw-deploy-muted">No briefing for this group.</p>
            )}
          </section>

          <div className="cw-deploy-two-col">
            <section className="cw-deploy-section">
              <div className="cw-deploy-section-head">
                <Activity size={20} aria-hidden />
                <h2>Attack timeline</h2>
              </div>
              <ul className="cw-deploy-timeline">
                {timeline.map((ev) => (
                  <li key={`${ev.row?.victim_id}-${ev.dateStr}`}>
                    <span className="cw-deploy-timeline-date">{ev.dateStr}</span>
                    <div className="cw-deploy-timeline-body">
                      <Link to={analysisPagePath(ev.row?.victim_id)} className="cw-deploy-timeline-link">
                        {ev.label}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="cw-deploy-section">
              <div className="cw-deploy-section-head">
                <Globe2 size={20} aria-hidden />
                <h2>Regional load (India)</h2>
                <span className="cw-deploy-pill">Inferred state from disclosure text</span>
              </div>
              <div className="cw-deploy-chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={states} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: "var(--cw-chart-axis)", fontSize: 10 }} />
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
            </section>
          </div>

          <div className="cw-deploy-two-col">
            <section className="cw-deploy-section">
              <div className="cw-deploy-section-head">
                <Zap size={20} aria-hidden />
                <h2>Activity (8 weeks)</h2>
              </div>
              <div className="cw-deploy-chart-h cw-deploy-chart-h--wide">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" />
                    <XAxis dataKey="week" tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 9 }} angle={-14} textAnchor="end" height={48} />
                    <YAxis tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} width={28} allowDecimals={false} />
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
            </section>

            <section className="cw-deploy-section">
              <div className="cw-deploy-section-head">
                <Shield size={20} aria-hidden />
                <h2>Sectors (this group)</h2>
              </div>
              <div className="cw-deploy-chart-h cw-deploy-chart-h--wide">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={sectors} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-chart-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "var(--cw-chart-axis-muted)", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={88} tick={{ fill: "var(--cw-chart-axis)", fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--cw-chart-tooltip-bg)",
                        border: "1px solid var(--cw-chart-tooltip-border)",
                      }}
                    />
                    <Bar dataKey="count" fill="var(--cw-chart-bar-3)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="cw-deploy-section">
            <div className="cw-deploy-section-head">
              <Shield size={20} aria-hidden />
              <h2>Ransomware kill chain</h2>
              <span className="cw-deploy-pill">Illustrative SOC flow</span>
            </div>
            <ol className="cw-deploy-chain">
              {chain.map((label, i) => (
                <li key={label} style={{ animationDelay: `${i * 0.06}s` }}>
                  <span className="cw-deploy-chain-idx">{i + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </section>

          <div className="cw-deploy-two-col">
            <section className="cw-deploy-section cw-deploy-terminal-wrap">
              <div className="cw-deploy-section-head">
                <Terminal size={20} aria-hidden />
                <h2>SOC console (staging)</h2>
              </div>
              <pre className="cw-deploy-terminal">{terminalLines.join("\n")}</pre>
            </section>

            <section className="cw-deploy-section">
              <div className="cw-deploy-section-head">
                <Radar size={20} aria-hidden />
                <h2>OSINT-style panels</h2>
              </div>
              <div className="cw-deploy-mini-grid">
                <div className="cw-deploy-mini-card">
                  <h3>Dark web / leak surface</h3>
                  <p>Public disclosure index only — no covert forum access.</p>
                  <ul>
                    <li>Leak site status: <strong>Unknown</strong> (not in scrape)</li>
                    <li>TOR mirrors: <strong>Not verified</strong></li>
                    <li>Payload samples: <strong>Not stored in this index</strong></li>
                  </ul>
                </div>
                <div className="cw-deploy-mini-card">
                  <h3>Operational snapshot</h3>
                  <ul>
                    <li>Indexed TTP tag: <strong>{card?.ttp || "—"}</strong></li>
                    <li>UI status: <strong>{card?.status || "—"}</strong></li>
                    <li>Affiliate program: <strong>Unknown</strong></li>
                  </ul>
                </div>
                <div className="cw-deploy-mini-card">
                  <h3>Malware footprint (illustrative)</h3>
                  <p className="cw-deploy-fineprint">{malware.disclaimer}</p>
                  <ul>
                    <li>Encryption (pattern): {malware.encryption}</li>
                    <li>Extension (sample family): {malware.extension}</li>
                    <li>Ransom note (sample name): {malware.ransomNote}</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <section className="cw-deploy-section">
            <div className="cw-deploy-section-head">
              <Activity size={20} aria-hidden />
              <h2>Recent victims</h2>
            </div>
            <input
              className="cw-search"
              placeholder="Filter table…"
              value={tableQ}
              onChange={(e) => setTableQ(e.target.value)}
              style={{ maxWidth: 280, marginBottom: "0.65rem" }}
            />
            <div className="cw-deploy-table-wrap">
              <table className="cw-deploy-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Sector</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.id}>
                      <td className="cw-deploy-td-entity">{r.entity}</td>
                      <td>{r.sector}</td>
                      <td>
                        <StatusBadge>{r.status}</StatusBadge>
                      </td>
                      <td>{r.date}</td>
                      <td>
                        <Link className="cw-btn-analyse" to={analysisPagePath(r.id)}>
                          Hub
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
