import { apiPath } from "./apiPath.js";

export { apiPath };

export function victimPayloadForAnalysis(row) {
  if (!row || typeof row !== "object") return {};
  const keys = [
    "victim_id",
    "target",
    "group",
    "reason",
    "website",
    "attack_details",
    "list_summary",
    "discovered_date",
    "updated_at",
    "source_url",
    "proof_links",
    "country",
  ];
  const o = {};
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") o[k] = v;
  }
  return o;
}

const ANALYSE_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 450;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}


function isRetryableNetworkError(e) {
  const msg = String(e.message || e).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("err_connection") ||
    msg.includes("err_network")
  );
}

function humanizeFetchFailure(e) {
  const m = String(e?.message || e);
  if (/failed to fetch|fetch failed|networkerror/i.test(m)) {
    return "Could not reach the API (dev proxy → port 4000). If the Node server just started or was busy, this often succeeds on retry — trying again automatically.";
  }
  return m;
}

export async function requestVictimAnalysis(row, chartContext) {
  const victim = victimPayloadForAnalysis(row);
  const body = { victim };
  if (chartContext && typeof chartContext === "object") {
    body.chart_context = chartContext;
  }

  let lastCatchError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }

    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), ANALYSE_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(apiPath("/api/analyse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      window.clearTimeout(t);
      if (e?.name === "AbortError") {
        throw new Error(
          `Analysis timed out after ${ANALYSE_TIMEOUT_MS / 1000}s — check that the Node server is running on port 4000 and Gemini responds.`
        );
      }
      lastCatchError = e;
      if (isRetryableNetworkError(e) && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      throw new Error(humanizeFetchFailure(e));
    } finally {
      window.clearTimeout(t);
    }

    let data = {};
    try {
      data = await r.json();
    } catch {
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      throw new Error(`Bad response (${r.status})`);
    }

    if (!r.ok) {
      const msg = [data.error, data.detail, data.hint].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
      const retryableHttp = r.status === 502 || r.status === 503 || r.status === 504;
      if (retryableHttp && attempt < MAX_ATTEMPTS - 1) {
        lastCatchError = new Error(msg);
        continue;
      }
      throw new Error(msg);
    }

    return data.analysis || "";
  }

  throw new Error(humanizeFetchFailure(lastCatchError) || "Analysis request failed after retries.");
}
