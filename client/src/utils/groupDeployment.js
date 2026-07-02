import {
  inferSector,
  inferState,
  parseRowDiscoveryTime,
  parseRowTime,
  pickVictimStatus,
  safeHostname,
  groupsForCards,
} from "./insights.js";
import { formatDateKeyIST, formatMsIST } from "./datetimeIST.js";

function hashStrLocal(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function filterItemsByGroup(items, groupName) {
  const g = String(groupName || "").trim();
  if (!g) return [];
  return items.filter((r) => (r.group || "Unknown") === g);
}

export function cardForGroup(items, groupName) {
  const cards = groupsForCards(items);
  return cards.find((c) => c.name === groupName) || null;
}

export function lastActivityLabel(items, groupName) {
  const cohort = filterItemsByGroup(items, groupName);
  let maxTs = 0;
  for (const row of cohort) {
    const t = parseRowTime(row);
    if (t != null && t > maxTs) maxTs = t;
  }
  if (!maxTs) return "—";
  const diff = Date.now() - maxTs;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function timelineForGroup(items, groupName, limit = 14) {
  const cohort = filterItemsByGroup(items, groupName);
  const rows = cohort
    .map((row) => ({
      ts: parseRowTime(row) || 0,
      label: (safeHostname(row.website) || row.target || row.victim_id || "—").toUpperCase(),
      dateStr: (() => {
        const ts = parseRowDiscoveryTime(row) ?? parseRowTime(row);
        if (ts != null) return formatDateKeyIST(ts);
        return row.discovered_date || (row.updated_at ? String(row.updated_at).slice(0, 10) : "—");
      })(),
      row,
    }))
    .sort((a, b) => b.ts - a.ts);
  return rows.slice(0, limit);
}

export function stateCountsForGroup(items, groupName) {
  const cohort = filterItemsByGroup(items, groupName);
  const m = new Map();
  for (const row of cohort) {
    const st = inferState(row) || "Unknown";
    m.set(st, (m.get(st) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sectorMixForGroup(items, groupName) {
  const cohort = filterItemsByGroup(items, groupName);
  const m = new Map();
  for (const row of cohort) {
    const s = inferSector(row);
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function weeklySeriesForGroup(items, groupName, weeks = 10) {
  const cohort = filterItemsByGroup(items, groupName);
  const now = new Date();
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const key = formatDateKeyIST(end.getTime());
    let c = 0;
    for (const row of cohort) {
      const t = parseRowTime(row);
      if (t != null && t >= start.getTime() && t <= end.getTime() + 86400000 - 1) c += 1;
    }
    buckets.push({ week: key, count: c });
  }
  return buckets;
}

export function riskScoreFromSignals({ count, lastMs, activity }) {
  let score = Math.min(35, Math.round(count * 0.45));
  if (lastMs) {
    const days = (Date.now() - lastMs) / 86400000;
    if (days < 2) score += 28;
    else if (days < 7) score += 20;
    else if (days < 30) score += 12;
    else if (days < 90) score += 5;
  }
  const actBoost = { EXTREME: 22, HIGH: 16, MODERATE: 10, ELEVATED: 6 };
  score += actBoost[activity] || 8;
  return Math.min(100, Math.max(12, Math.round(score)));
}

const EXT_POOL = [".lockbit", ".akira", ".medusa", ".conti-crypt", ".blackbyte", ".malox"];
const NOTE_POOL = [
  "README-RECOVER.txt",
  "RECOVER-FILES.txt",
  "HOW_TO_RESTORE.html",
  "Readme.txt",
  "!Recovery!.txt",
];

export function malwareFootprintStub(groupName) {
  const h = hashStrLocal(groupName);
  return {
    encryption: h % 2 === 0 ? "AES-256 + ChaCha20 (typical dual-layer)" : "AES-256 (inferred pattern)",
    extension: EXT_POOL[h % EXT_POOL.length],
    ransomNote: NOTE_POOL[h % NOTE_POOL.length],
    disclaimer:
      "Illustrative labels derived from public reporting patterns for this family name — not from your indexed row payloads.",
  };
}

export function killChainTemplate() {
  return [
    "Reconnaissance",
    "Initial access",
    "Execution",
    "Persistence",
    "Lateral movement",
    "Impact (encryption / exfil)",
    "Post-compromise (leak pressure)",
  ];
}

export function buildGroupDeploymentAiContext(items, groupName, card) {
  const cohort = filterItemsByGroup(items, groupName);
  const lastMs = cohort.reduce((m, r) => Math.max(m, parseRowTime(r) || 0), 0);
  const samples = cohort.slice(0, 12).map((r) => ({
    victim_id: r.victim_id,
    target: r.target,
    website: r.website,
    sector: inferSector(r),
    state: inferState(r),
    status: pickVictimStatus(r),
    discovered_date: r.discovered_date,
    updated_at: r.updated_at,
    country: r.country,
  }));
  return {
    group_name: groupName,
    ui_card: card
      ? { status: card.status, activity: card.activity, predominant_ttp: card.ttp, victim_count: card.count }
      : null,
    victim_count: cohort.length,
    last_index_activity_ist: lastMs ? formatMsIST(lastMs) : null,
    sector_mix: sectorMixForGroup(items, groupName).slice(0, 12),
    state_mix: stateCountsForGroup(items, groupName).slice(0, 14),
    weekly_counts_tail: weeklySeriesForGroup(items, groupName, 8),
    sample_disclosures: samples,
  };
}
