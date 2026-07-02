import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Radio } from "lucide-react";
import { useData } from "../context/DataContext.jsx";
import { feedFromItems } from "../utils/insights.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { analysisPagePath } from "../utils/analysisUrl.js";
import { apiPath } from "../utils/analyseApi.js";

export default function LiveFeed() {
  const { items, loading, error } = useData();
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const liveNowMs = Date.now();
  const feed = useMemo(() => feedFromItems(items, 80, liveNowMs), [items, clockTick]);

  const [groqText, setGroqText] = useState("");
  const [groqLoading, setGroqLoading] = useState(false);
  const [groqErr, setGroqErr] = useState("");

  const runGroqStream = useCallback(async () => {
    setGroqErr("");
    setGroqText("");
    setGroqLoading(true);
    try {
      const r = await fetch(apiPath("/api/live/stream-analytics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error([j.error, j.hint].filter(Boolean).join(" — ") || `HTTP ${r.status}`);
      }
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      readLoop: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let j;
          try {
            j = JSON.parse(line);
          } catch {
            continue;
          }
          if (j.error) throw new Error(j.error);
          if (j.c) acc += j.c;
          if (j.done) {
            setGroqText(acc);
            break readLoop;
          }
        }
        setGroqText(acc);
      }
      setGroqText(acc);
    } catch (e) {
      setGroqErr(e?.message || String(e));
    } finally {
      setGroqLoading(false);
    }
  }, []);

  return (
    <>
      {error && <div className="cw-banner err">{error}</div>}
      {loading && (
        <div className="cw-banner load">
          <span className="cw-spin" aria-hidden />
        </div>
      )}

      <div className="cw-page-head">
        <h1 className="cw-page-title">Mission critical live feed</h1>
      </div>

      <div className="cw-live-ai-grid" style={{ display: "grid", gap: "1rem", marginBottom: "1.25rem", maxWidth: "720px" }}>
        <div className="cw-card" style={{ padding: "1rem 1.1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Radio size={18} className="cw-hub-ai-spark" aria-hidden />
            <h2 className="cw-card-title" style={{ margin: 0, fontSize: "0.85rem" }}>
              Live analytics (Groq · streaming)
            </h2>
          </div>
          <button type="button" className="cw-hub-exec-btn" onClick={runGroqStream} disabled={groqLoading}>
            {groqLoading ? "Streaming…" : "Run live stream"}
          </button>
          {groqErr ? (
            <div className="cw-banner err" style={{ marginTop: "0.65rem" }}>
              {groqErr}
            </div>
          ) : null}
          {groqText ? (
            <pre
              className="cw-live-stream-pre"
              style={{
                marginTop: "0.75rem",
                padding: "0.65rem 0.75rem",
                borderRadius: 8,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid var(--cw-border)",
                fontSize: "0.72rem",
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                maxHeight: "min(42vh, 420px)",
                overflow: "auto",
                color: "#cbd5e1",
              }}
            >
              {groqText}
            </pre>
          ) : null}
        </div>
      </div>

      <div className="cw-card">
        <div className="cw-feed" style={{ maxHeight: "none" }}>
          {feed.map((f) => (
            <div key={f.id} className="cw-feed-row cw-feed-row--with-action">
              <div className="cw-feed-time-stack">
                <span className="cw-feed-time">{f.time}</span>
                {f.discoveredIst ? <span className="cw-feed-discovered">{f.discoveredIst}</span> : null}
              </div>
              <StatusBadge>{f.status}</StatusBadge>
              <div>
                <div style={{ fontWeight: 700 }}>{f.event}</div>
                <div className="cw-feed-target">PRIMARY TARGET: {f.target}</div>
              </div>
              <Link className="cw-btn-analyse" to={analysisPagePath(f.row.victim_id)}>
                ANALYSE
                <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
