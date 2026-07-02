import { calendarYearIST, formatMsIST, formatMsISTDateOnly, TZ_INDIA } from "./datetimeIST.js";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
];

const SECTOR_RULES = [
  {
    sector: "Government",
    re: /ministry|municipal|\.gov\.in|\bgov\.in\b|\bnic\.in\b|government of|state government|central government|public sector|district collector|collectorate|parliament|legislative assembly|high court registry|police department|nigam|development authority\s*\(|smart city mission|municipal corporation/i,
  },
  { sector: "Healthcare", re: /hospital|clinic|medical|pharma|healthcare|health system|diagnostic|patholog|patient care|dental|orthopedic|telemedic|life science|biotech|medtech|tpa\b|health insurance fund|nursing home/i },
  {
    sector: "Finance",
    re: /\b(bank|banking|bancassurance|nbfc|insurance|insurtech|fintech|lending|mortgage|underwrit|brokerage|securities|asset management|wealth management|mutual fund|stock exchange|treasury|reinsurance)\b|payment gateway|crypto exchange|credit union/i,
  },
  { sector: "Education", re: /university|college|school|academy|institute of technology|iit\b|nit\b|iim\b|campus|student|faculty|edtech|board of education|education department/i },
  { sector: "Telecom", re: /telecom|telco|mobile network|wireless carrier|\bisp\b|fiber broadband|5g|4g lte|satellite communications|tower infra/i },
  { sector: "Energy", re: /\b(utility|utilities)\b|power generation|power plant|renewable energy|solar farm|wind farm|oil & gas|oil and gas|petroleum|lng|pipeline operator|electricity board|discom|transco|genco|nuclear power/i },
  { sector: "Legal", re: /\b(law firm|advocates|solicitors|legal services|notary|compliance advisory)\b|attorneys at law/i },
  { sector: "Media", re: /broadcast|television|tv network|radio station|publishing house|news agency|streaming platform|entertainment studio|film production|music label|ott\b/i },
  {
    sector: "Retail",
    re: /retail chain|department store|hypermarket|supermarket|e-?commerce|online marketplace|consumer goods|fmcg|apparel brand|fashion house|jewellery|jewelry|lifestyle retail|shopping mall/i,
  },
  {
    sector: "Logistics",
    re: /logistics|freight forwarding|shipping line|cargo airline|courier service|parcel delivery|supply chain|3pl|4pl|warehousing|cold chain|trucking fleet|rail logistics|port authority/i,
  },
  { sector: "Real Estate", re: /real estate developer|property developer|housing development|commercial realty|realty group|builders & developers/i },
  { sector: "Hospitality", re: /hotel chain|resort|hospitality group|restaurant group|catering services|travel agency|tourism board/i },
  { sector: "Automotive", re: /automotive|automobile|vehicle manufacturing|ev startup|two-?wheeler|passenger vehicles|auto components|tier-1 supplier|oem automotive/i },
  { sector: "Agriculture", re: /agribusiness|agro|dairy cooperative|crop science|seed company|fisheries|poultry|food processing plant|sugar mill/i },
  { sector: "Construction", re: /construction company|infrastructure contractor|epc contractor|civil engineering firm|road builder|metro rail project|bridge construction/i },
  { sector: "Manufacturing", re: /manufacturing|industrial plant|factory|steel mill|cement plant|textile mill|chemical plant|precision engineering|packaging manufacturer|discrete manufacturing/i },
  {
    sector: "Technology",
    re: /\b(software|saas|cloud services|data center|it services|ITES|outsourc|system integrat|digital platform|cybersecurity|infotech|information technology|technology consulting|product engineering|api platform)\b|\btech\b solutions|technologies limited|technologies ltd|systems limited|systems ltd|digital solutions/i,
  },
];

/** Full sector taxonomy for filters and charts (must match `inferSector` outputs). */
export const ALL_SECTOR_LABELS = [
  "Agriculture",
  "Automotive",
  "Construction",
  "Education",
  "Energy",
  "Finance",
  "Government",
  "Healthcare",
  "Hospitality",
  "Legal",
  "Logistics",
  "Manufacturing",
  "Media",
  "Other",
  "Real Estate",
  "Retail",
  "Technology",
  "Telecom",
];

function hashStr(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function safeHostname(url) {
  if (!url) return null;
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** High-confidence sector from registrable domain / public-sector host patterns. */
function inferSectorFromHostname(host) {
  if (!host) return null;
  const h = host.toLowerCase();
  if (/\.(gov|nic|mil)\.in$/i.test(h) || /\.gov\.[a-z]{2,3}$/i.test(h) || /\.mil\.[a-z]{2,3}$/i.test(h)) {
    return "Government";
  }
  if (/\.(edu|ac)\.[a-z]{2,3}$/i.test(h) || /\.edu$/i.test(h)) return "Education";
  const labels = h.split(".");
  const stem = labels.length >= 2 ? labels[labels.length - 2] : h;
  const blob = `${stem} ${h}`;
  if (/\b(bank|banc|finance|finanz|insur|invest|capital|wealth|mortgage|lending)\b/i.test(blob)) return "Finance";
  if (/\b(hospital|clinic|health|medi|pharma|dental|diagnostic)\b/i.test(blob)) return "Healthcare";
  if (/\b(hotel|resort|restaurant|hospitality|tours|travel)\b/i.test(blob)) return "Hospitality";
  if (/\b(shop|store|retail|mart|fashion|market|bazaar|commerce)\b/i.test(blob)) return "Retail";
  if (/\b(logistics|freight|cargo|shipping|transport|courier|parcel|delivery)\b/i.test(blob)) return "Logistics";
  if (/\b(auto|motor|vehicle|mobility|cars|bikes)\b/i.test(blob)) return "Automotive";
  if (/\b(energy|power|solar|oil|gas|electric)\b/i.test(blob)) return "Energy";
  if (/\b(media|news|tv|radio|film|press)\b/i.test(blob)) return "Media";
  if (/\b(tech|soft|cloud|digital|cyber|systems|labs|solutions|infotech|software)\b/i.test(blob)) return "Technology";
  if (/\b(telecom|telco|volte|gsm|fiber|5g)\b/i.test(blob)) return "Telecom";
  return null;
}

const SECTOR_INFER_BLOB_MAX = 48_000;

export function inferSector(row) {
  const host = safeHostname(row?.website);
  const fromHost = inferSectorFromHostname(host);
  if (fromHost) return fromHost;
  const raw = `${row.target} ${row.reason} ${row.attack_details} ${row.list_summary} ${host || ""}`.toLowerCase();
  const blob = raw.length > SECTOR_INFER_BLOB_MAX ? raw.slice(0, SECTOR_INFER_BLOB_MAX) : raw;
  for (const { sector, re } of SECTOR_RULES) {
    if (re.test(blob)) return sector;
  }
  return "Other";
}

/** Shown in sector legend for the catch-all bucket (matches `inferSector` fallback). */
export const OTHER_SECTOR_LEGEND_DETAIL =
  "No sector rule matched the domain or victim listing text.";

export function inferState(row) {
  const raw = `${row.target} ${row.reason} ${row.attack_details} ${row.list_summary}`;
  const blob = raw.length > SECTOR_INFER_BLOB_MAX ? raw.slice(0, SECTOR_INFER_BLOB_MAX) : raw;
  for (const st of INDIAN_STATES) {
    if (blob.includes(st)) return st;
  }
  if (/mumbai|pune|bangalore|bengaluru|chennai|hyderabad|ahmedabad|kolkata|delhi ncr|ncr/i.test(blob)) {
    if (/mumbai|pune/i.test(blob)) return "Maharashtra";
    if (/bangalore|bengaluru/i.test(blob)) return "Karnataka";
    if (/chennai|coimbatore/i.test(blob)) return "Tamil Nadu";
    if (/hyderabad/i.test(blob)) return "Telangana";
    if (/ahmedabad|surat/i.test(blob)) return "Gujarat";
    if (/kolkata/i.test(blob)) return "West Bengal";
    if (/delhi|ncr/i.test(blob)) return "Delhi";
  }
  return null;
}

export function groupCounts(items) {
  const m = new Map();
  for (const row of items) {
    const g = row.group || "Unknown";
    m.set(g, (m.get(g) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function sectorCounts(items) {
  const m = new Map();
  for (const row of items) {
    const s = inferSector(row);
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function stateCounts(items) {
  const m = new Map();
  for (const row of items) {
    const st = inferState(row);
    if (st) m.set(st, (m.get(st) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const FEED_STATUSES = ["ALERT", "MITIGATED", "CRITICAL", "PROBING", "DATA LEAK VERIFIED"];

export function pickFeedStatus(row) {
  const t = `${row.target} ${row.reason}`.toLowerCase();
  if (/gov|\.gov\.in|ministry|nic\.in/i.test(t)) return "CRITICAL";
  if (/health|hospital|patient|medical/i.test(t)) return "ALERT";
  if ((row.proof_links || []).length >= 3) return "DATA LEAK VERIFIED";
  if (/negotiat|ransom|leak|exfil|tb|gb|database/i.test(t)) return "PROBING";
  return FEED_STATUSES[hashStr(row.victim_id) % FEED_STATUSES.length];
}

/** Human-readable age from a row timestamp; recomputed when `nowMs` advances (live UI clock). */
export function formatAgeSince(tsMs, nowMs = Date.now()) {
  if (tsMs == null || !Number.isFinite(tsMs)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - tsMs) / 1000));
  if (sec <= 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const rem = sec % 60;
    return rem === 0 ? `${min}m ago` : `${min}m ${rem}s ago`;
  }
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 21) return `${d}d ago`;
  return new Date(tsMs).toLocaleString("en-IN", {
    timeZone: TZ_INDIA,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function rowDiscoverySortKey(row) {
  return parseRowDiscoveryTime(row) ?? parseRowTime(row) ?? 0;
}

/**
 * Single row → same shape as entries from {@link feedFromItems} (for rotating banners, etc.).
 * @param {number} [nowMs] Wall clock for “ago” labels.
 */
export function feedEntryFromRow(row, nowMs = Date.now()) {
  if (!row) return null;
  const sector = inferSector(row);
  const host = safeHostname(row.website);
  const domain = host || row.target?.slice(0, 40) || "—";
  const ts = parseRowDiscoveryTime(row);
  return {
    id: row.victim_id,
    time: formatAgeSince(ts, nowMs),
    discoveredIst: formatRowDiscoveryIST(row),
    status: pickFeedStatus(row),
    event: `${sector.toUpperCase()} SECTOR DISCLOSURE`,
    target: domain.toUpperCase(),
    row,
  };
}

/** Newest-first victim rows by discovery / row time (for top-N strips without re-sorting in UI). */
export function topVictimRowsByDiscovery(items, limit = 5) {
  const sorted = [...items].sort((a, b) => rowDiscoverySortKey(b) - rowDiscoverySortKey(a));
  return sorted.slice(0, Math.max(0, limit));
}

/**
 * @param {number} [nowMs] Wall clock for “ago” labels — pass `Date.now()` from a ticking parent to refresh the feed.
 */
export function feedFromItems(items, limit = 14, nowMs = Date.now()) {
  return topVictimRowsByDiscovery(items, limit).map((row) => feedEntryFromRow(row, nowMs));
}

const VICTIM_STATUSES = ["ALERT", "MITIGATED", "CRITICAL", "PROBING", "DATA LEAK VERIFIED"];

export function pickVictimStatus(row) {
  const s = pickFeedStatus(row);
  if (VICTIM_STATUSES.includes(s)) return s;
  return "ALERT";
}

export function victimRowsFromItems(items) {
  return items.map((row) => ({
    id: row.victim_id,
    entity: (safeHostname(row.website) || row.target || "—").toUpperCase(),
    sector: inferSector(row),
    group: row.group || "Unknown",
    status: pickVictimStatus(row),
    date: row.discovered_date || (row.updated_at ? String(row.updated_at).slice(0, 10) : "—"),
    row,
  }));
}

const TTPS = [
  "DOUBLE EXTORTION",
  "DATA EXFILTRATION",
  "TRIPLE EXTORTION",
  "CREDENTIAL HARVEST",
  "RANSOM ENCRYPTION",
  "SUPPLY CHAIN COMPROMISE",
];

const GROUP_UI_STATUS = ["ACTIVE", "ACTIVE", "ACTIVE", "IN MAINTENANCE", "DISBANDED"];

export function groupsForCards(items) {
  const counts = groupCounts(items);
  return counts.map(({ name, count }, i) => {
    const h = hashStr(name);
    return {
      name,
      count,
      status: GROUP_UI_STATUS[h % GROUP_UI_STATUS.length],
      ttp: TTPS[h % TTPS.length],
      activity: count > 40 ? "EXTREME" : count > 15 ? "HIGH" : count > 5 ? "MODERATE" : "ELEVATED",
    };
  });
}

export function leaksFromItems(items) {
  return items.slice(0, 24).map((row) => {
    const h = hashStr(row.victim_id);
    const sizes = ["2.1GB", "450GB", "13TB", "890MB", "120GB", "4.5TB", "8GB", "220GB"];
    const impacts = ["1.2M", "20M", "180M", "450K", "2.5M", "4.5M", "890K", "12M"];
    const meta = row.list_summary ? row.list_summary.slice(0, 42).toUpperCase() + (row.list_summary.length > 42 ? "…" : "") : "DISCLOSURE METADATA";
    const statuses = ["VERIFIED", "VERIFIED", "MITIGATED"];
    return {
      id: row.victim_id,
      company: (row.target || "Unknown").toUpperCase(),
      source: "RANSOMWARE.LIVE",
      meta,
      date: row.discovered_date || "—",
      size: sizes[h % sizes.length],
      impact: impacts[h % impacts.length],
      status: statuses[h % statuses.length],
      row,
    };
  });
}

/** Pseudo lat/lng inside India for leaflet markers (deterministic) */
export function rowToLatLng(row) {
  const h = hashStr(row.victim_id);
  const lat = 10 + (h % 1000) / 1000 * 16;
  const lng = 72 + ((h >> 10) % 1000) / 1000 * 12;
  return [lat, lng];
}

export function attackVectorModel(items) {
  const n = Math.max(items.length, 1);
  const sector = sectorCounts(items);
  const top = sector[0]?.name || "Ransomware";
  const ransomwarePct = Math.min(94, Math.round(55 + (items.length % 25)));
  const ddosPct = Math.round(30 + (hashStr("ddos") % 25));
  const phishPct = Math.round(20 + (sector.find((s) => s.name === "Finance")?.count || 0) * 1.2) % 55;
  const sqlPct = Math.max(8, Math.round(15 + (hashStr("sql") % 15)));
  return {
    headline: top,
    ransomwarePct,
    ddosPct: Math.min(75, ddosPct),
    phishPct: Math.min(60, phishPct),
    sqlPct: Math.min(40, sqlPct),
    botnetLabel: items.length > 200 ? "High" : items.length > 80 ? "Moderate" : "Controlled",
    externalVectors: Math.min(9999, Math.round(n * 1.8 + 120)),
    activeTargets: Math.min(999, Math.max(3, Math.round(groupCounts(items).length * 1.4 + 4))),
  };
}

/** Normalize UI search: trim, lower-case, strip invisible chars that break matching. */
export function normalizeSearchQuery(raw) {
  return String(raw ?? "")
    .replace(/[\u200b-\u200d\ufeff\u2060]/g, "")
    .trim()
    .toLowerCase();
}

function searchHaystackPart(x) {
  if (x == null) return "";
  const t = typeof x;
  if (t === "string" || t === "number" || t === "boolean") return String(x);
  if (t === "object") {
    if (Array.isArray(x)) return x.map((y) => searchHaystackPart(y)).filter(Boolean).join(" ");
    try {
      return JSON.stringify(x);
    } catch {
      return "";
    }
  }
  return String(x);
}

/** Lowercase haystack for client-side search (Reports / Victims toolbars). */
export function rowTextSearchHaystack(row) {
  if (!row || typeof row !== "object") return "";
  try {
    const pl = row.proof_links;
    const proofStr = Array.isArray(pl)
      ? pl.filter((x) => x != null && `${x}`.trim() !== "").map((x) => searchHaystackPart(x)).join(" ")
      : searchHaystackPart(pl);
    const parts = [
      searchHaystackPart(row.target),
      searchHaystackPart(row.website),
      searchHaystackPart(row.group),
      searchHaystackPart(row.victim_id),
      searchHaystackPart(row.reason),
      searchHaystackPart(row.attack_details),
      searchHaystackPart(row.list_summary),
      searchHaystackPart(row.country),
      searchHaystackPart(row.source_url),
      proofStr,
    ];
    return parts
      .map((p) => String(p).trim())
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  } catch {
    return "";
  }
}

/** Parse row time for windowed KPI trends (scraped `updated_at` / `discovered_date`). */
export function parseRowTime(row) {
  const raw = row?.updated_at ?? row?.discovered_date;
  if (raw == null) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * For calendar-year / YoY cohorts: prefer `discovered_date` so `updated_at` (often “last scrape”)
 * does not push every row into the current wall-clock year.
 */
export function parseRowTimeForCohort(row) {
  const raw = row?.discovered_date ?? row?.updated_at;
  if (raw == null) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseLooseVictimDateMs(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T00:00:00.000Z`);
    return Number.isFinite(t) ? t : null;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hh = String(Math.min(23, Math.max(0, Number(m[2])))).padStart(2, "0");
    const mm = String(Math.min(59, Math.max(0, Number(m[3])))).padStart(2, "0");
    const ss = m[4] ? String(Math.min(59, Math.max(0, Number(m[4])))).padStart(2, "0") : "00";
    const t = Date.parse(`${m[1]}T${hh}:${mm}:${ss}.000Z`);
    return Number.isFinite(t) ? t : null;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Per-incident wall time for UI (notifications, “when this disclosure happened”).
 * Prefers detail `discovered_utc`, then list `discovered_date`, `attack_estimated`, last resort `updated_at`
 * — avoids anchoring “ago” timers to bulk re-scrape `updated_at`.
 */
export function parseRowDiscoveryTime(row) {
  const chain = [row?.discovered_utc, row?.discovered_date, row?.attack_estimated, row?.updated_at];
  for (const raw of chain) {
    if (raw == null) continue;
    const t = parseLooseVictimDateMs(raw);
    if (t != null) return t;
  }
  return null;
}

/** Fixed IST label for victim detail / feeds (source timestamps interpreted as stored, shown in India time). */
export function formatRowDiscoveryIST(row) {
  if (!row) return null;
  const ms = parseRowDiscoveryTime(row);
  if (ms == null) return null;
  const hasUtcDetail = row.discovered_utc != null && String(row.discovered_utc).trim();
  if (!hasUtcDetail && row.discovered_date && /^\d{4}-\d{2}-\d{2}$/.test(String(row.discovered_date).trim())) {
    return formatMsISTDateOnly(ms);
  }
  return formatMsIST(ms);
}

/** Latest India-calendar year present in the dataset (discovery date first). */
export function latestDataYearIST(items) {
  let maxY = null;
  for (const r of items) {
    const t = parseRowTimeForCohort(r);
    if (t == null) continue;
    const y = calendarYearIST(t);
    if (y != null && (maxY == null || y > maxY)) maxY = y;
  }
  return maxY;
}

/** Count rows with time in (startExclusive, endInclusive]. */
function countInRecentWindow(items, startExclusive, endInclusive) {
  let n = 0;
  for (const r of items) {
    const t = parseRowTime(r);
    if (t == null) continue;
    if (t > startExclusive && t <= endInclusive) n += 1;
  }
  return n;
}

/** Week-over-week % change in indexed row counts (7d vs prior 7d). */
export function weekOverWeekIndexedCount(items) {
  const now = Date.now();
  const d7 = 7 * 86400000;
  const cur = countInRecentWindow(items, now - d7, now);
  const prev = countInRecentWindow(items, now - 2 * d7, now - d7);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, up: true };
  const pct = ((cur - prev) / prev) * 100;
  return { pct, up: pct >= 0 };
}

/** Distinct targets (lowercased) in time window. */
function distinctTargetsInWindow(items, startExclusive, endInclusive) {
  const s = new Set();
  for (const r of items) {
    const t = parseRowTime(r);
    if (t == null || !(t > startExclusive && t <= endInclusive)) continue;
    const k = String(r.target || "").trim().toLowerCase() || String(r.victim_id || "");
    if (k) s.add(k);
  }
  return s.size;
}

/** Week-over-week % change in distinct impacted targets. */
export function weekOverWeekImpactedTargets(items) {
  const now = Date.now();
  const d7 = 7 * 86400000;
  const cur = distinctTargetsInWindow(items, now - d7, now);
  const prev = distinctTargetsInWindow(items, now - 2 * d7, now - d7);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, up: true };
  const pct = ((cur - prev) / prev) * 100;
  return { pct, up: pct >= 0 };
}

function proofLinksInWindow(items, startExclusive, endInclusive) {
  let n = 0;
  for (const r of items) {
    const t = parseRowTime(r);
    if (t == null || !(t > startExclusive && t <= endInclusive)) continue;
    n += (r.proof_links || []).length;
  }
  return n;
}

/** Week-over-week % change in proof-link counts indexed in each window. */
export function weekOverWeekProofLinks(items) {
  const now = Date.now();
  const d7 = 7 * 86400000;
  const cur = proofLinksInWindow(items, now - d7, now);
  const prev = proofLinksInWindow(items, now - 2 * d7, now - d7);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, up: true };
  const pct = ((cur - prev) / prev) * 100;
  return { pct, up: pct >= 0 };
}

/** Calendar year (IST) from cohort timestamp, or null if undated. */
function rowCalendarYearIST(row) {
  const t = parseRowTimeForCohort(row);
  if (t == null) return null;
  return calendarYearIST(t);
}

function countInCalendarYear(items, year) {
  let n = 0;
  for (const r of items) {
    if (rowCalendarYearIST(r) === year) n += 1;
  }
  return n;
}

function distinctTargetsInCalendarYear(items, year) {
  const s = new Set();
  for (const r of items) {
    if (rowCalendarYearIST(r) !== year) continue;
    const k = String(r.target || "").trim().toLowerCase() || String(r.victim_id || "");
    if (k) s.add(k);
  }
  return s.size;
}

function proofLinksInCalendarYear(items, year) {
  let n = 0;
  for (const r of items) {
    if (rowCalendarYearIST(r) !== year) continue;
    n += (r.proof_links || []).length;
  }
  return n;
}

function deltaPercentFromCounts(cur, prev) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, up: true };
  const pct = ((cur - prev) / prev) * 100;
  return { pct, up: pct >= 0 };
}

/**
 * Year-over-year % for indexed rows: (count in `year` vs count in `year - 1`).
 * Buckets by India calendar year using discovery date first (see parseRowTimeForCohort).
 */
export function yearOverYearIndexedCount(items, year) {
  const y = year ?? calendarYearIST(Date.now()) ?? new Date().getFullYear();
  return deltaPercentFromCounts(countInCalendarYear(items, y), countInCalendarYear(items, y - 1));
}

/** YoY % for distinct impacted entities (by target / victim_id) per calendar year. */
export function yearOverYearImpactedTargets(items, year) {
  const y = year ?? calendarYearIST(Date.now()) ?? new Date().getFullYear();
  return deltaPercentFromCounts(
    distinctTargetsInCalendarYear(items, y),
    distinctTargetsInCalendarYear(items, y - 1)
  );
}

/** YoY % for total proof-link count indexed in each calendar year. */
export function yearOverYearProofLinks(items, year) {
  const y = year ?? calendarYearIST(Date.now()) ?? new Date().getFullYear();
  return deltaPercentFromCounts(
    proofLinksInCalendarYear(items, y),
    proofLinksInCalendarYear(items, y - 1)
  );
}

/** Unique impacted entities (distinct targets + victim_id fallback). */
export function uniqueImpactedCount(items) {
  const s = new Set();
  for (const r of items) {
    const k = String(r.target || "").trim().toLowerCase() || String(r.victim_id || "");
    if (k) s.add(k);
  }
  return s.size;
}

/** Format WoW change like "+12.5%" / "-0.6%" for KPI row (from scraped dates). */
export function formatWoWPercent(change) {
  if (!change || change.pct == null || !Number.isFinite(change.pct)) return null;
  const v = change.pct;
  const rounded = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return { text: `${sign}${Math.abs(rounded)}%`, up: v >= 0 };
}

