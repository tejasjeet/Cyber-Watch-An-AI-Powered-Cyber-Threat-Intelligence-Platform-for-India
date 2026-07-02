import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Link2, ShieldAlert, ScanSearch, History, RotateCcw, Trash2 } from "lucide-react";
import { apiPath } from "../utils/apiPath.js";
import { authHeaders } from "../context/AuthContext.jsx";
import "../styles/phishingScanner.css";

const LEGACY_HISTORY_KEY = "cw_phishing_scan_history";

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
};

function statusClass(status) {
  if (status === "Safe") return "phish-status-safe";
  if (status === "Medium Risk") return "phish-status-medium";
  return "phish-status-high";
}

function scoreColor(status) {
  if (status === "Safe") return "#4ade80";
  if (status === "Medium Risk") return "#fbbf24";
  return "#ff4d4d";
}

function RiskRing({ score, status }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(status);

  return (
    <div className="phish-risk-ring" aria-hidden>
      <svg viewBox="0 0 140 140">
        <circle className="phish-risk-ring-bg" cx="70" cy="70" r={r} />
        <circle
          className="phish-risk-ring-fg"
          cx="70"
          cy="70"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="phish-risk-score">
        <span className="phish-risk-val" style={{ color }}>
          {score}
        </span>
        <span className="phish-risk-of">/ 100</span>
      </div>
    </div>
  );
}

function LoadingPanel() {
  const cells = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <motion.div
      className="phish-glass-card phish-span-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="phish-loading">
        <div className="phish-loading-ring" aria-hidden />
        <div className="phish-loading-text">ANALYZING URL...</div>
        <div className="phish-loading-grid" aria-hidden>
          {cells.map((i) => (
            <div
              key={i}
              className="phish-loading-cell"
              style={{ animationDelay: `${(i % 8) * 0.08}s` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ScanResults({ result, recalledFromHistory }) {
  const td = result?.technicalDetails;

  return (
    <>
      {recalledFromHistory ? (
        <motion.div
          className="phish-recalled-banner phish-span-12"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <RotateCcw size={15} />
          <span>
            Viewing saved scan from {new Date(recalledFromHistory).toLocaleString()} — run a new scan to
            refresh results.
          </span>
        </motion.div>
      ) : null}

      <motion.div
        className="phish-glass-card phish-span-4"
        custom={0}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="phish-card-title">Risk score</h3>
        <div className="phish-risk-center">
          <RiskRing score={result.riskScore} status={result.status} />
          <span className={`phish-status-pill ${statusClass(result.status)}`}>{result.status}</span>
        </div>
      </motion.div>

      <motion.div
        className="phish-glass-card phish-span-8"
        custom={1}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="phish-card-title">Security indicators</h3>
        <div className="phish-indicators">
          <div className="phish-indicator-row">
            <span className="phish-indicator-label">Google Safe Browsing</span>
            <span className={`phish-indicator-val ${result.safeBrowsing ? "danger" : "ok"}`}>
              {result.safeBrowsingResult || (result.safeBrowsing ? "Threat detected" : "No threats found")}
            </span>
          </div>
          <div className="phish-indicator-row">
            <span className="phish-indicator-label">Domain age</span>
            <span className="phish-indicator-val">{result.domainAge || "Unknown"}</span>
          </div>
          <div className="phish-indicator-row">
            <span className="phish-indicator-label">HTTPS status</span>
            <span className={`phish-indicator-val ${result.https ? "ok" : "warn"}`}>
              {result.https ? "Secure (HTTPS)" : "Not secure (HTTP)"}
            </span>
          </div>
          <div className="phish-indicator-row">
            <span className="phish-indicator-label">Suspicious keywords</span>
            <span className={`phish-indicator-val ${result.keywords?.length ? "warn" : "ok"}`}>
              {result.keywords?.length ? result.keywords.join(", ") : "None detected"}
            </span>
          </div>
          <div className="phish-indicator-row">
            <span className="phish-indicator-label">Brand impersonation</span>
            <span className={`phish-indicator-val ${result.brandImpersonation ? "danger" : "ok"}`}>
              {result.brandImpersonation || "None detected"}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="phish-glass-card phish-span-6"
        custom={2}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="phish-card-title">
          <ScanSearch size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          AI security analysis
        </h3>
        <div className="phish-ai-body">
          <ReactMarkdown>{result.aiAnalysis || "No analysis available."}</ReactMarkdown>
        </div>
      </motion.div>

      <motion.div
        className="phish-glass-card phish-span-6"
        custom={3}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <h3 className="phish-card-title">Technical details</h3>
        <div className="phish-tech-grid">
          <div className="phish-tech-item">
            <div className="phish-tech-label">DOMAIN</div>
            <div className="phish-tech-val">{td?.domain || "—"}</div>
          </div>
          <div className="phish-tech-item">
            <div className="phish-tech-label">TLD</div>
            <div className="phish-tech-val">{td?.tld || "—"}</div>
          </div>
          <div className="phish-tech-item">
            <div className="phish-tech-label">REGISTRATION AGE</div>
            <div className="phish-tech-val">{td?.registrationAge || result.domainAge || "—"}</div>
          </div>
          <div className="phish-tech-item">
            <div className="phish-tech-label">SSL STATUS</div>
            <div className="phish-tech-val">{td?.sslStatus || (result.https ? "Valid HTTPS" : "No HTTPS")}</div>
          </div>
          <div className="phish-tech-item">
            <div className="phish-tech-label">REDIRECT COUNT</div>
            <div className="phish-tech-val">{td?.redirectCount ?? "—"}</div>
          </div>
          <div className="phish-tech-item">
            <div className="phish-tech-label">HOSTNAME</div>
            <div className="phish-tech-val">{td?.hostname || "—"}</div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

export default function PhishingScanner() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [recallingId, setRecallingId] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [recalledFromHistory, setRecalledFromHistory] = useState(null);
  const resultsRef = useRef(null);

  const scrollToResults = useCallback(() => {
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch(apiPath("/api/phishing/history"), {
        headers: { ...authHeaders(), Accept: "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error([data.error, data.hint].filter(Boolean).join(" — ") || `History load failed (HTTP ${r.status})`);
      }
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setHistory([]);
      setError(e?.message || String(e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_HISTORY_KEY);
    } catch {
      /* ignore */
    }
    fetchHistory();
  }, [fetchHistory]);

  const openHistoryEntry = useCallback(
    async (row) => {
      setSelectedHistoryId(row.id);
      setUrl(row.url);
      setError("");
      setRecallingId(row.id);
      try {
        const r = await fetch(apiPath(`/api/phishing/history/${encodeURIComponent(row.id)}`), {
          headers: { ...authHeaders(), Accept: "application/json" },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error([data.error, data.hint].filter(Boolean).join(" — ") || `Could not load scan (HTTP ${r.status})`);
        }
        setResult(data);
        setRecalledFromHistory(data.scannedAt || row.date);
        scrollToResults();
      } catch (e) {
        setResult(null);
        setRecalledFromHistory(null);
        setError(e?.message || String(e));
      } finally {
        setRecallingId(null);
      }
    },
    [scrollToResults]
  );

  const deleteHistoryEntry = useCallback(
    async (e, row) => {
      e.stopPropagation();
      try {
        const r = await fetch(apiPath(`/api/phishing/history/${encodeURIComponent(row.id)}`), {
          method: "DELETE",
          headers: { ...authHeaders(), Accept: "application/json" },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.error || `Delete failed (HTTP ${r.status})`);
        }
        setHistory((prev) => prev.filter((h) => h.id !== row.id));
        if (selectedHistoryId === row.id) {
          setSelectedHistoryId(null);
          setResult(null);
          setRecalledFromHistory(null);
        }
      } catch (err) {
        setError(err?.message || String(err));
      }
    },
    [selectedHistoryId]
  );

  const onScan = useCallback(async () => {
    setError("");
    setResult(null);
    setRecalledFromHistory(null);
    setSelectedHistoryId(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a URL to scan.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(apiPath("/api/phishing/scan"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error([data.error, data.hint].filter(Boolean).join(" — ") || `Scan failed (HTTP ${r.status})`);
      }
      setResult(data);
      setSelectedHistoryId(data.id || null);
      setRecalledFromHistory(null);
      await fetchHistory();
      scrollToResults();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [url, scrollToResults, fetchHistory]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!busy) onScan();
  };

  return (
    <div className="phish-page">
      {error ? (
        <div className="cw-banner err" role="alert">
          {error}
        </div>
      ) : null}

      <div className="cw-page-head">
        <h1 className="cw-page-title">
          <Link2 size={26} strokeWidth={1.75} />
          Phishing URL Scanner
        </h1>
      </div>

      <section className="phish-hero">
        <div className="phish-hero-eyebrow">THREAT INTELLIGENCE</div>
        <h2 className="phish-hero-title">AI-Powered Phishing URL Scanner</h2>
        <p className="phish-hero-sub">
          Analyze suspicious URLs using Google Safe Browsing, domain intelligence, and AI-powered threat
          analysis. Scan history is saved under the <strong>phishing url</strong> collection in MongoDB.
        </p>
      </section>

      <section className="phish-scan-card">
        <form className="phish-scan-row" onSubmit={onSubmit}>
          <input
            className="phish-url-input"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-label="URL to scan"
          />
          <button type="submit" className="phish-scan-btn" disabled={busy}>
            {busy ? "SCANNING…" : "SCAN URL"}
          </button>
        </form>
      </section>

      <div className="phish-results-grid" ref={resultsRef}>
        <AnimatePresence mode="wait">{busy ? <LoadingPanel key="loading" /> : null}</AnimatePresence>

        {!busy && result ? (
          <ScanResults result={result} recalledFromHistory={recalledFromHistory} />
        ) : null}

        {!busy && !result ? (
          <motion.div
            className="phish-glass-card phish-span-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}
          >
            <ShieldAlert size={36} strokeWidth={1.5} style={{ opacity: 0.35, marginBottom: "0.75rem" }} />
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              Enter a URL above and click <strong style={{ color: "#94a3b8" }}>Scan URL</strong> to run threat
              analysis.
              {history.length > 0 ? (
                <>
                  {" "}
                  Or <strong style={{ color: "#94a3b8" }}>click a row in scan history</strong> below to reread a
                  saved report.
                </>
              ) : null}
            </p>
          </motion.div>
        ) : null}
      </div>

      <motion.section
        className="phish-glass-card phish-history-section"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3 className="phish-card-title phish-history-title-inline">
          <History size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Scan history
        </h3>
        <p className="phish-history-hint">
          Saved to the <strong>phishing url</strong> collection in MongoDB for your account. Click a row to reread the full report.
        </p>

        {historyLoading ? (
          <p className="phish-empty-history">
            <span className="cw-spin" aria-hidden /> Loading scan history…
          </p>
        ) : history.length === 0 ? (
          <p className="phish-empty-history">No saved scans yet — run a scan to build your history.</p>
        ) : (
          <div className="phish-history-table-wrap">
            <table className="phish-history-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>RISK SCORE</th>
                  <th>STATUS</th>
                  <th>DATE</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={row.id}
                    className={`phish-history-row phish-history-row--clickable ${selectedHistoryId === row.id ? "phish-history-row--active" : ""} ${recallingId === row.id ? "phish-history-row--loading" : ""}`}
                    onClick={() => {
                      if (recallingId !== row.id) openHistoryEntry(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openHistoryEntry(row);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Recall scan for ${row.url}`}
                    title="Click to reread full saved report"
                  >
                    <td className="phish-history-url" title={row.url}>
                      {row.url}
                    </td>
                    <td>{row.riskScore}</td>
                    <td>
                      <span className={`phish-status-pill ${statusClass(row.status)}`}>{row.status}</span>
                    </td>
                    <td>{new Date(row.date).toLocaleString()}</td>
                    <td className="phish-history-actions">
                      <button
                        type="button"
                        className="phish-history-delete"
                        aria-label={`Delete scan for ${row.url}`}
                        title="Delete saved scan"
                        onClick={(e) => deleteHistoryEntry(e, row)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}
