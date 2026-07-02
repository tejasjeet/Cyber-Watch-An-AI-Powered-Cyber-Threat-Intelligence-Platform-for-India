/** Deterministic “forensic” staging from index rows — illustrative only, not real leak contents. */

function hashStr(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DATA_TYPE_POOL = [
  { key: "EMAILS", label: "Emails", sev: "high" },
  { key: "PASSWORDS", label: "Passwords / hashes", sev: "critical" },
  { key: "INVOICES", label: "Invoices", sev: "high" },
  { key: "HR FILES", label: "HR files", sev: "critical" },
  { key: "CUSTOMER DATA", label: "Customer data", sev: "critical" },
  { key: "SOURCE CODE", label: "Source code", sev: "high" },
  { key: "FINANCIAL RECORDS", label: "Financial records", sev: "critical" },
  { key: "API KEYS", label: "API / cloud keys", sev: "critical" },
  { key: "BACKUPS", label: "Backup archives", sev: "medium" },
  { key: "PII DOCS", label: "Identity documents", sev: "critical" },
];

const SENSITIVE_POOL = [
  "PAN-style tax identifiers (pattern)",
  "Aadhaar / national ID references (possible)",
  "Payroll & compensation tables (possible)",
  "API credentials & service accounts (possible)",
  "Customer PII bundles (likely)",
  "Signed procurement / NDAs (possible)",
  "VPN / remote access configs (possible)",
];

export function parseLeakSizeToGb(sizeStr) {
  const s = String(sizeStr || "").trim().toUpperCase();
  const m = /^([\d.]+)\s*(TB|GB|MB)$/i.exec(s);
  if (!m) return 12;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 12;
  const u = m[2].toUpperCase();
  if (u === "TB") return n * 1024;
  if (u === "GB") return n;
  if (u === "MB") return n / 1024;
  return n;
}

export function parseImpactToNumber(impactStr) {
  const s = String(impactStr || "").toUpperCase();
  const m = /^([\d.]+)\s*([KMB])$/i.exec(s.replace(/\s/g, ""));
  if (!m) return 2_500_000;
  const n = Number(m[1]);
  const mult = m[2] === "B" ? 1e9 : m[2] === "M" ? 1e6 : 1e3;
  return Math.round(n * mult);
}

export function breachSeverityScore(seed, sizeGb, recordN) {
  const h = hashStr(seed) % 37;
  const sizePart = Math.min(35, Math.log10(1 + sizeGb) * 8);
  const recPart = Math.min(40, Math.log10(1 + recordN) * 5);
  return Math.min(100, Math.round(22 + sizePart + recPart + h * 0.15));
}

export function dataTypeMix(seed) {
  const h = hashStr(seed);
  const picks = [];
  const used = new Set();
  for (let k = 0; k < 6; k++) {
    const idx = (h + k * 17) % DATA_TYPE_POOL.length;
    if (used.has(idx)) continue;
    used.add(idx);
    picks.push(DATA_TYPE_POOL[idx]);
  }
  const raw = picks.map((p, i) => ({ ...p, w: 12 + ((h >> (i * 3)) & 15) }));
  const sum = raw.reduce((a, b) => a + b.w, 0);
  return raw.map((p) => ({
    ...p,
    pct: Math.round((p.w / sum) * 1000) / 10,
  }));
}

export function sensitiveDetections(seed) {
  const h = hashStr(seed);
  const n = 4 + (h % 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(SENSITIVE_POOL[(h + i * 5) % SENSITIVE_POOL.length]);
  }
  return [...new Set(out)];
}

export function fileTreeStructure(seed) {
  const h = hashStr(seed);
  const roots = [
    {
      name: "/exfil_root/",
      children: [
        { name: "HR/", children: [{ name: "payroll/" }, { name: "onboarding/" }] },
        { name: "finance/", children: [{ name: "invoices_2024/" }, { name: "wire_logs/" }] },
        { name: "customer_db/", children: [{ name: "exports/" }] },
        { name: "contracts/", children: [{ name: "legal/" }] },
        { name: "source_code/", children: [{ name: "backend/" }, { name: "infra/" }] },
      ],
    },
  ];
  if (h % 2 === 0) roots[0].children.push({ name: "backups/", children: [{ name: "sql_dumps/" }] });
  return roots;
}

export function downloadPreviewNames(seed) {
  const h = hashStr(seed);
  const pool = [
    "archive_01.zip",
    "employees_redacted.xlsx",
    "finance_2025_meta.pdf",
    "customer_extract.csv",
    "api_env_staging.txt",
    "hr_policy_pack.zip",
    "contracts_signed.tgz",
    "db_schema_notes.sql",
  ];
  return [0, 1, 2, 3].map((i) => pool[(h + i) % pool.length]);
}

export function attackTimeline(seed) {
  const labels = [
    { k: "Initial access", d: "T−14d" },
    { k: "Recon & staging", d: "T−10d" },
    { k: "Privilege escalation", d: "T−6d" },
    { k: "Lateral movement", d: "T−3d" },
    { k: "Bulk exfiltration", d: "T−24h" },
    { k: "Leak site pressure", d: "T0" },
  ];
  const h = hashStr(seed) % labels.length;
  return labels.map((x, i) => ({ ...x, active: i === h || i === labels.length - 1 }));
}

export function darkWebStub(seed, groupName) {
  const h = hashStr(seed + groupName);
  const online = h % 5 !== 0;
  return {
    leakSiteStatus: online ? "ONLINE (simulated)" : "UNKNOWN",
    mirrorCount: 2 + (h % 5),
    torReachability: online ? "ACTIVE (UI staging)" : "NOT VERIFIED",
    disclaimer: "Public index only — no live TOR crawl from this console.",
  };
}

export function industryImpactLine(sector) {
  const s = String(sector || "Enterprise");
  const bump = 12 + (hashStr(s) % 45);
  return `${s} sector composite risk index +${bump}% vs baseline (modelled)`;
}

export function attributionStub(groupName, seed) {
  const g = String(groupName || "Unknown");
  const c = 58 + (hashStr(seed + g) % 38);
  return { actor: g, confidence: c };
}

/** Simple node layout for SVG “graph” (not force physics). */
export function breachGraphModel(seed) {
  const h = hashStr(seed);
  const nodes = [
    { id: "ext", label: "EXFIL", x: 50, y: 50 },
    { id: "dc", label: "DC / AD", x: 22, y: 28 },
    { id: "db", label: "DB", x: 78, y: 30 },
    { id: "mail", label: "MAIL", x: 25, y: 72 },
    { id: "fs", label: "FS", x: 75, y: 70 },
  ];
  const edges = [
    ["ext", "dc"],
    ["ext", "db"],
    ["dc", "mail"],
    ["db", "fs"],
    ["dc", "fs"],
  ];
  if (h % 2 === 0) edges.push(["mail", "fs"]);
  return { nodes, edges };
}
