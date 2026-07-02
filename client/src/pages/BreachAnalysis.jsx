import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Database,
  Lock,
  Network,
  Radio,
  Shield,
  Skull,
  Sparkles,
} from "lucide-react";
import AnalysisMarkdown from "../components/AnalysisMarkdown.jsx";
import { useData } from "../context/DataContext.jsx";
import { apiPath } from "../utils/analyseApi.js";
import { buildBreachBriefingMarkdown } from "../utils/breachLocalBriefing.js";
import { analysisPagePath, breachAnalysisPagePath } from "../utils/analysisUrl.js";
import {
  attackTimeline,
  attributionStub,
  breachGraphModel,
  breachSeverityScore,
  darkWebStub,
  dataTypeMix,
  downloadPreviewNames,
  fileTreeStructure,
  industryImpactLine,
  parseImpactToNumber,
  parseLeakSizeToGb,
  sensitiveDetections,
} from "../utils/breachIntelModel.js";
import { formatMsIST } from "../utils/datetimeIST.js";
import { inferSector, leaksFromItems, safeHostname } from "../utils/insights.js";

function TreeBranch({ node }) {
  return (
    <li className="cw-breach-tree-item">
      <code className="cw-breach-tree-code">{node.name}</code>
      {node.children?.length ? (
        <ul className="cw-breach-tree-nested">
          {node.children.map((c, i) => (
            <TreeBranch key={`${node.name}-${i}`} node={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function BreachGraphSvg({ model }) {
  const pos = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox="0 0 100 100" className="cw-breach-graph-svg" aria-hidden>
      <defs>
        <linearGradient id="cwBreachEdgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--cw-chart-bar-1)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--cw-chart-bar-3)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {model.edges.map(([a, b], i) => {
        const A = pos[a];
        const B = pos[b];
        if (!A || !B) return null;
        return (
          <line
            key={`${a}-${b}-${i}`}
            x1={A.x}
            y1={A.y}
            x2={B.x}
            y2={B.y}
            className="cw-breach-graph-edge"
            stroke="url(#cwBreachEdgeGrad)"
          />
        );
      })}
      {model.nodes.map((n) => (
        <g key={n.id} className="cw-breach-graph-node" transform={`translate(${n.x},${n.y})`}>
          <circle r={5.5} className="cw-breach-graph-node-circle" />
          <text x={0} y={-10} textAnchor="middle" className="cw-breach-graph-node-label">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function sevClass(sev) {
  if (sev === "critical") return "cw-breach-tag--critical";
  if (sev === "high") return "cw-breach-tag--high";
  return "cw-breach-tag--medium";
}

export default function BreachAnalysis() {
  const { victimId: victimIdParam } = useParams();
  const victimId = victimIdParam ? decodeURIComponent(victimIdParam) : "";
  const { live } = useData();

  const [row, setRow] = useState(null);
  const [fetchErr, setFetchErr] = useState("");
  const [liveLines, setLiveLines] = useState([]);
  const lastPulseRef = useRef("");

  const leakCard = useMemo(() => {
    if (!row) return null;
    const leaks = leaksFromItems([row]);
    return leaks[0] || null;
  }, [row]);

  const seed = useMemo(() => String(row?.victim_id || victimId || ""), [row, victimId]);
  const sector = useMemo(() => (row ? inferSector(row) : "—"), [row]);
  const sizeGb = useMemo(() => parseLeakSizeToGb(leakCard?.size), [leakCard]);
  const recordN = useMemo(() => parseImpactToNumber(leakCard?.impact), [leakCard]);
  const severity = useMemo(() => breachSeverityScore(seed, sizeGb, recordN), [seed, sizeGb, recordN]);
  const types = useMemo(() => dataTypeMix(seed), [seed]);
  const sensitive = useMemo(() => sensitiveDetections(seed), [seed]);
  const tree = useMemo(() => fileTreeStructure(seed), [seed]);
  const previews = useMemo(() => downloadPreviewNames(seed), [seed]);
  const timeline = useMemo(() => attackTimeline(seed), [seed]);
  const dark = useMemo(() => darkWebStub(seed, row?.group || ""), [seed, row]);
  const industry = useMemo(() => industryImpactLine(sector), [sector]);
  const attr = useMemo(() => attributionStub(row?.group || "Unknown", seed), [row, seed]);
  const graph = useMemo(() => breachGraphModel(seed), [seed]);
  const storagePct = useMemo(() => Math.min(100, Math.round((Math.log10(1 + sizeGb) / Math.log10(1 + 2048)) * 100)), [sizeGb]);

  const breachContext = useMemo(() => {
    if (!row || !leakCard) return null;
    return {
      victim_id: row.victim_id,
      company: leakCard.company,
      group: row.group || "Unknown",
      country: row.country || "India",
      sector,
      source: leakCard.source,
      status: leakCard.status,
      size_gb: Math.round(sizeGb * 100) / 100,
      records_label: leakCard.impact,
      proof_link_count: (row.proof_links || []).length,
      disclosure_url: row.source_url || null,
      list_summary_excerpt: row.list_summary ? String(row.list_summary).slice(0, 400) : null,
      client_severity: severity,
      data_types: types.map((t) => ({ key: t.key, pct: t.pct, severity: t.sev })),
      detected_sensitive: sensitive,
      ui_model_note:
        "Deterministic UI staging for training dashboards — not verified leak contents or dark-web telemetry.",
    };
  }, [row, leakCard, sector, sizeGb, severity, types, sensitive]);

  const briefingMd = useMemo(() => buildBreachBriefingMarkdown(breachContext), [breachContext]);

  useEffect(() => {
    let cancelled = false;
    setFetchErr("");
    setRow(null);
    if (!victimId || victimId === "_") {
      setFetchErr("Missing breach reference.");
      return undefined;
    }
    (async () => {
      try {
        const vRes = await fetch(apiPath(`/api/attacks/${encodeURIComponent(victimId)}`));
        const vData = await vRes.json().catch(() => ({}));
        if (!vRes.ok) {
          const detail = [vData.message, vData.hint, vData.error].filter(Boolean).join(" — ");
          throw new Error(detail || `Request failed (${vRes.status})`);
        }
        if (cancelled) return;
        setRow(vData.item);
      } catch (e) {
        if (!cancelled) setFetchErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [victimId]);

  useEffect(() => {
    const at = live.lastEvent?.at;
    if (!at || at === lastPulseRef.current) return;
    lastPulseRef.current = at;
    const reason = String(live.lastEvent?.reason || "intel").replace(/-/g, " ");
    const line = `CHANNEL · ${reason.toUpperCase()} · ${formatMsIST(new Date(at).getTime())}`;
    setLiveLines((prev) => [{ line, at }, ...prev].slice(0, 8));
  }, [live.lastEvent]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setLiveLines((prev) => {
        const line = `SIM · NEW ARTIFACT METADATA QUEUED · ${formatMsIST(Date.now())}`;
        return [{ line, at: new Date().toISOString() }, ...prev].slice(0, 8);
      });
    }, 88_000);
    return () => window.clearInterval(t);
  }, []);

  if (fetchErr) {
    return (
      <div className="cw-breach-page">
        <div className="cw-breach-classified-bar" aria-hidden />
        <div className="cw-banner err">{fetchErr}</div>
        <Link to="/leaks" className="cw-btn-outline cw-breach-back">
          <ArrowLeft size={16} aria-hidden />
          Exfiltration logs
        </Link>
      </div>
    );
  }

  if (!row || !leakCard) {
    return (
      <div className="cw-breach-page">
        <div className="cw-breach-classified-bar" aria-hidden />
        <p className="cw-breach-muted">Loading breach dossier…</p>
      </div>
    );
  }

  const company = leakCard.company;
  const host = safeHostname(row.website) || row.target || victimId;

  return (
    <div className="cw-breach-page">
      <div className="cw-breach-classified-bar" aria-hidden />
      <div className="cw-breach-top-actions">
        <Link to="/leaks" className="cw-btn-outline cw-breach-back">
          <ArrowLeft size={16} aria-hidden />
          Exfiltration logs
        </Link>
        <div className="cw-breach-top-links">
          <Link to={analysisPagePath(victimId)} className="cw-btn-outline">
            Victim intelligence hub
          </Link>
          {row.source_url ? (
            <a href={row.source_url} target="_blank" rel="noreferrer" className="cw-btn-outline">
              Disclosure source
            </a>
          ) : null}
        </div>
      </div>

      <header className="cw-breach-hero">
        <div className="cw-breach-hero-grid">
          <div className="cw-breach-hero-icon" aria-hidden>
            <Skull size={40} strokeWidth={1.35} />
          </div>
          <div>
            <div className="cw-breach-hero-eyebrow">BREACH INTELLIGENCE · OSINT INDEX</div>
            <h1 className="cw-breach-hero-title">{company}</h1>
            <div className="cw-breach-hero-meta">
              <span>
                <Shield size={14} aria-hidden /> {String(row.group || "Unknown").toUpperCase()}
              </span>
              <span>
                <Database size={14} aria-hidden /> {host}
              </span>
              <span>
                <Lock size={14} aria-hidden /> REF {encodeURIComponent(victimId).slice(0, 28)}
                {victimId.length > 28 ? "…" : ""}
              </span>
            </div>
          </div>
          <div className="cw-breach-hero-score" title="Modelled exposure index — not a verified leak audit">
            <div className="cw-breach-hero-score-label">Breach impact score</div>
            <div className="cw-breach-hero-score-val">{severity}</div>
            <div className="cw-breach-hero-score-sub">/ 100 · composite</div>
          </div>
        </div>
      </header>

      <div className="cw-breach-grid">
        <section className="cw-breach-panel cw-breach-panel--wide">
          <div className="cw-breach-panel-head">
            <Sparkles size={18} aria-hidden />
            <h2>Breach intelligence briefing</h2>
            <span className="cw-breach-pill">Local · index + UI model</span>
          </div>
          {briefingMd ? (
            <div className="cw-breach-markdown">
              <AnalysisMarkdown source={briefingMd} />
            </div>
          ) : (
            <p className="cw-breach-muted">No briefing context.</p>
          )}
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Database size={18} aria-hidden />
            <h2>Exposed data classes</h2>
          </div>
          <p className="cw-breach-fine">Synthetic mix for SOC rehearsal — not forensic confirmation.</p>
          <ul className="cw-breach-type-list">
            {types.map((t) => (
              <li key={t.key} className={`cw-breach-tag ${sevClass(t.sev)}`}>
                <span className="cw-breach-tag-label">{t.label}</span>
                <span className="cw-breach-tag-pct">{t.pct}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Lock size={18} aria-hidden />
            <h2>AI-style sensitive findings</h2>
          </div>
          <ul className="cw-breach-sensitive">
            {sensitive.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Activity size={18} aria-hidden />
            <h2>Attack reconstruction</h2>
          </div>
          <ol className="cw-breach-timeline">
            {timeline.map((step) => (
              <li key={step.k} className={step.active ? "cw-breach-timeline--hot" : ""}>
                <span className="cw-breach-timeline-k">{step.k}</span>
                <span className="cw-breach-timeline-d">{step.d}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Network size={18} aria-hidden />
            <h2>Exfil tree (illustrative)</h2>
          </div>
          <ul className="cw-breach-tree-root">
            {tree[0]?.children?.map((node, i) => (
              <TreeBranch key={i} node={node} />
            ))}
          </ul>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Database size={18} aria-hidden />
            <h2>Leak size visualization</h2>
          </div>
          <div className="cw-breach-size-label">
            <strong>{leakCard.size}</strong>
            <span>modelled scale</span>
          </div>
          <div className="cw-breach-storage-track" aria-hidden>
            <div className="cw-breach-storage-fill" style={{ width: `${storagePct}%` }} />
          </div>
          <div className="cw-breach-size-foot">
            ~{Math.round(sizeGb)} GB-equivalent · {leakCard.impact} records (UI estimate)
          </div>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Radio size={18} aria-hidden />
            <h2>Dark web status</h2>
            <span className="cw-breach-pill">Simulated</span>
          </div>
          <dl className="cw-breach-dl">
            <dt>Leak site</dt>
            <dd>{dark.leakSiteStatus}</dd>
            <dt>Mirror count</dt>
            <dd>{dark.mirrorCount}</dd>
            <dt>TOR reachability</dt>
            <dd>{dark.torReachability}</dd>
          </dl>
          <p className="cw-breach-fine">{dark.disclaimer}</p>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Activity size={18} aria-hidden />
            <h2>Industry impact</h2>
          </div>
          <p className="cw-breach-impact-line">{industry}</p>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Radio size={18} aria-hidden />
            <h2>Live threat channel</h2>
            <span className={`cw-breach-pill ${live.connected ? "cw-breach-pill--live" : ""}`}>
              {live.connected ? "Socket" : "Standby"}
            </span>
          </div>
          <ul className="cw-breach-live-feed">
            {liveLines.length === 0 ? (
              <li className="cw-breach-muted">Listening for index pulses…</li>
            ) : (
              liveLines.map((x, i) => (
                <li key={`${x.at}-${i}`}>
                  <span className="cw-breach-live-dot" aria-hidden />
                  {x.line}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Lock size={18} aria-hidden />
            <h2>Archive preview (sanitized)</h2>
          </div>
          <p className="cw-breach-fine">Synthetic filenames only — no real leak payloads.</p>
          <ul className="cw-breach-preview">
            {previews.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="cw-breach-panel">
          <div className="cw-breach-panel-head">
            <Shield size={18} aria-hidden />
            <h2>Attribution (index)</h2>
          </div>
          <div className="cw-breach-attr">
            <div>
              <span className="cw-breach-attr-label">Likely group</span>
              <strong>{attr.actor}</strong>
            </div>
            <div>
              <span className="cw-breach-attr-label">Model confidence</span>
              <strong>{attr.confidence}%</strong>
            </div>
          </div>
        </section>

        <section className="cw-breach-panel cw-breach-panel--graph">
          <div className="cw-breach-panel-head">
            <Network size={18} aria-hidden />
            <h2>Forensic relationship graph</h2>
            <span className="cw-breach-pill">Staging topology</span>
          </div>
          <BreachGraphSvg model={graph} />
        </section>
      </div>

      <footer className="cw-breach-footer">
        <span>CYBER WATCH · BREACH DOSSIER</span>
        <span className="cw-breach-footer-id">{breachAnalysisPagePath(victimId)}</span>
      </footer>
    </div>
  );
}
