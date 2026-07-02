import dotenv from "dotenv";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { Server as SocketIOServer } from "socket.io";
import { geminiGenerateMarkdown, groqStreamNdjson } from "./aiProviders.js";
import { mountAuthRoutes, ensureUserIndexes } from "./authRoutes.js";
import { upsertCompassGuide } from "./compassGuide.js";
import {
  APP_COLLECTIONS,
  ensureAppCollections,
  ensureAttackIndexes,
  ensureOptionalCollectionIndexes,
} from "./dbSchema.js";
import jwt from "jsonwebtoken";
import { getIntelItems, setIntelItems } from "./liveIntelCache.js";
import { runScraperPipeline } from "./intelScrapeRunner.js";
import { mountPhishingRoutes, ensurePhishingScanIndexes } from "./phishingRoutes.js";
import { mountReportRoutes } from "./reportRoutes.js";
import { recordAiSummary, runDerivedCollectionsSync } from "./syncDerivedCollections.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "ransomware_india";
const MONGODB_ATTACKS_COLLECTION =
  process.env.MONGODB_ATTACKS_COLLECTION || process.env.MONGODB_COLLECTION || APP_COLLECTIONS.attacks;
const MONGODB_USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || "users";
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-in-production";
let JWT_EXPIRES_IN = String(process.env.JWT_EXPIRES_IN || "7d").trim() || "7d";
try {
  jwt.sign({ _probe: 1 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
} catch (e) {
  console.warn(
    `JWT_EXPIRES_IN is invalid (${e?.message || e}); using 7d. Check server/.env JWT_EXPIRES_IN (e.g. 7d, 24h, 3600).`
  );
  JWT_EXPIRES_IN = "7d";
}
if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET not set — using insecure default. Set JWT_SECRET in server/.env for production.");
}
const SCRAPE_HOOK_SECRET = process.env.SCRAPE_HOOK_SECRET || "";
const POLL_MS = Number(process.env.POLL_MS || 15000);
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
const GOOGLE_AI_MODEL = process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
const GOOGLE_SAFE_BROWSING_API_KEY =
  process.env.GOOGLE_SAFE_BROWSING_API_KEY || process.env.SAFE_BROWSING_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const READ_INTEL_FROM_MONGO =
  String(process.env.READ_INTEL_FROM_MONGO || "").toLowerCase() === "true" ||
  process.env.READ_INTEL_FROM_MONGO === "1";
const INTEL_REFRESH_COOLDOWN_MS = Math.max(
  0,
  Number(process.env.INTEL_REFRESH_COOLDOWN_SEC || "120")
) * 1000;
let lastIntelRefreshAt = 0;

const REQUIRE_MONGO =
  String(process.env.REQUIRE_MONGO || "").toLowerCase() === "true" || process.env.REQUIRE_MONGO === "1";
const fileStorePath = path.resolve(
  process.env.DATA_FILE || path.join(__dirname, "data", "attacks.json")
);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "4mb" }));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true },
});

let mongoClient;
/** @type {import("mongodb").Collection | null} */
let collection = null;
let lastMongoError = "";

function getUsersCollection() {
  if (!mongoClient) return null;
  try {
    return mongoClient.db(MONGODB_DB).collection(MONGODB_USERS_COLLECTION);
  } catch {
    return null;
  }
}
/** @type {"mongo" | "file"} */
let dataMode = "file";
let lastFingerprint = "";
let fileSig = "";

function fingerprintDoc(doc) {
  if (!doc?.updated_at) return "";
  const t =
    doc.updated_at instanceof Date
      ? doc.updated_at.toISOString()
      : String(doc.updated_at);
  return t;
}

function parseFileStore() {
  try {
    const raw = fs.readFileSync(fileStorePath, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}

function sortByUpdated(items) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updated_at || 0).getTime();
    const tb = new Date(b.updated_at || 0).getTime();
    return tb - ta;
  });
}

async function intelItemsOrWarmFromDatastore(maxRows = 3000) {
  let all = sortByUpdated(getIntelItems());
  if (all.length) return all;
  const cap = Math.min(Math.max(maxRows, 1), 5000);
  if (collection) {
    try {
      const rows = await collection.find({}).sort({ updated_at: -1 }).limit(cap).toArray();
      all = sortByUpdated(rows);
      if (all.length) {
        setIntelItems(all);
        return all;
      }
    } catch (e) {
      console.warn("intelItemsOrWarmFromDatastore (Mongo):", e.message);
    }
  }
  all = sortByUpdated(parseFileStore());
  if (all.length) setIntelItems(all);
  return all;
}

async function loadItemsForAi(limit) {
  const cap = Math.min(Math.max(Number(limit) || 80, 1), 200);
  if (!READ_INTEL_FROM_MONGO) {
    const live = await intelItemsOrWarmFromDatastore(2000);
    if (live.length) return live.slice(0, cap);
    return [];
  }
  if (collection) {
    try {
      return await collection.find({}).sort({ updated_at: -1 }).limit(cap).toArray();
    } catch (e) {
      console.warn("loadItemsForAi mongo:", e.message);
    }
  }
  return sortByUpdated(parseFileStore()).slice(0, cap);
}

function truncStr(s, max) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function digestForGroqStream(items) {
  return items.map((r) => ({
    i: truncStr(r.victim_id, 40),
    t: truncStr(r.target, 72),
    g: truncStr(r.group, 36),
    d: String(r.discovered_date || "").slice(0, 12),
    c: truncStr(r.country, 24),
    p: Array.isArray(r.proof_links) ? r.proof_links.length : 0,
  }));
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostFromWebsite(website) {
  if (!website) return "";
  try {
    const u = String(website).startsWith("http") ? website : `https://${website}`;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function findVictimInItems(items, victimParam) {
  const raw = decodeURIComponent(victimParam || "").trim();
  if (!raw) return null;
  const byId = items.find((r) => String(r.victim_id) === String(raw));
  if (byId) return byId;
  const slug = raw.toLowerCase();
  if (slug.length < 2) return null;
  let best = null;
  let bestScore = 0;
  for (const r of items) {
    const h = hostFromWebsite(r.website);
    const t = (r.target || "").toLowerCase();
    let sc = 0;
    if (h === slug) sc = 100;
    else if (h.endsWith(`.${slug}`) || (slug.includes(".") && h.endsWith(slug))) sc = 90;
    else if (h.includes(slug)) sc = 60;
    else if (t.includes(slug)) sc = 50;
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }
  if (bestScore >= 50) return best;
  if (bestScore >= 40 && slug.length >= 4) return best;
  return null;
}

async function findVictimDocument(victimParam) {
  const raw = decodeURIComponent(victimParam || "").trim();
  if (!raw) return null;
  const fromFile = () => findVictimInItems(parseFileStore(), victimParam);

  if (!READ_INTEL_FROM_MONGO) {
    await intelItemsOrWarmFromDatastore(4000);
    const fromLive = findVictimInItems(sortByUpdated(getIntelItems()), victimParam);
    if (fromLive) return fromLive;
    if (collection) {
      try {
        let doc = await collection.findOne({ victim_id: raw });
        if (doc) return doc;
        const slug = raw.toLowerCase();
        if (slug.length >= 3) {
          const er = escapeRegex(slug);
          doc = await collection.findOne({
            $or: [{ target: new RegExp(er, "i") }, { website: new RegExp(er, "i") }],
          });
        }
        if (doc) return doc;
      } catch (e) {
        console.warn("findVictimDocument (Mongo warm path):", e.message);
      }
    }
    return fromFile();
  }

  if (collection) {
    try {
      let doc = await collection.findOne({ victim_id: raw });
      if (doc) return doc;
      const slug = raw.toLowerCase();
      if (slug.length >= 3) {
        const er = escapeRegex(slug);
        doc = await collection.findOne({
          $or: [{ target: new RegExp(er, "i") }, { website: new RegExp(er, "i") }],
        });
      }
      if (doc) return doc;
    } catch (e) {
      console.warn("findVictimDocument:", e.message);
    }
    const fallback = fromFile();
    if (fallback) return fallback;
    return null;
  }
  return fromFile();
}

function refreshFileSigFromDisk() {
  try {
    const st = fs.statSync(fileStorePath);
    fileSig = `${st.mtimeMs}:${st.size}`;
  } catch {
    fileSig = "missing";
  }
}

async function connectMongo() {
  try {
    const isAtlas = /^mongodb\+srv:/i.test(MONGODB_URI);
    const slowNet = isAtlas || MONGODB_URI.includes(".mongodb.net");
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: slowNet ? 20000 : 5000,
    });
    await mongoClient.connect();
    const db = mongoClient.db(MONGODB_DB);
    await ensureAppCollections(db);
    await ensureOptionalCollectionIndexes(db);
    await ensurePhishingScanIndexes(db);
    collection = db.collection(MONGODB_ATTACKS_COLLECTION);
    await collection.findOne({}, { projection: { _id: 1 } });
    await ensureAttackIndexes(mongoClient.db(MONGODB_DB), MONGODB_ATTACKS_COLLECTION);
    await ensureUserIndexes(getUsersCollection);
    await upsertCompassGuide(mongoClient, MONGODB_DB, {
      attacksCollection: MONGODB_ATTACKS_COLLECTION,
      usersCollection: MONGODB_USERS_COLLECTION,
    });
    console.log(`MongoDB: ${MONGODB_DB}.${MONGODB_ATTACKS_COLLECTION} (indexes: victim_id unique, updated_at, group)`);
    console.log(`MongoDB users: ${MONGODB_DB}.${MONGODB_USERS_COLLECTION} (unique email)`);
    console.log(`Compass: open database "${MONGODB_DB}" → collection "_COMPASS_READ_ME" → document START_HERE`);
    dataMode = "mongo";
    lastMongoError = "";
    return true;
  } catch (e) {
    lastMongoError = e.message || String(e);
    console.warn("MongoDB unavailable — using JSON file store:", e.message);
    collection = null;
    dataMode = "file";
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {
        /* ignore */
      }
    }
    mongoClient = undefined;
    refreshFileSigFromDisk();
    console.log(`File store: ${fileStorePath}`);
    return false;
  }
}

async function broadcastIfChanged(reason) {
  if (!collection) return;
  try {
    const latest = await collection.findOne(
      {},
      { sort: { updated_at: -1 }, projection: { updated_at: 1 } }
    );
    const total = await collection.countDocuments({});
    const fp = `${total}:${fingerprintDoc(latest)}`;
    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      io.emit("attacks:update", { reason, total, at: new Date().toISOString() });
    }
  } catch (e) {
    console.error("broadcastIfChanged:", e.message);
  }
}

function checkFileAndNotify(reason) {
  if (dataMode !== "file") return;
  let sig = "missing";
  try {
    const st = fs.statSync(fileStorePath);
    sig = `${st.mtimeMs}:${st.size}`;
  } catch {
    /* missing */
  }
  if (sig !== fileSig) {
    fileSig = sig;
    const n = parseFileStore().length;
    io.emit("attacks:update", { reason, total: n, at: new Date().toISOString() });
  }
}

const geoJsonPath = path.join(__dirname, "..", "client", "public", "geo", "india-states.geojson");

app.get("/api/geo/india-states", (_req, res) => {
  fs.readFile(geoJsonPath, "utf8", (err, data) => {
    if (err) {
      return res.status(404).json({
        error: "GeoJSON not found",
        hint: "Run `npm run prepare:geo` in the client folder, then restart the dev server.",
      });
    }
    res.type("application/json").send(data);
  });
});

app.get("/api/health", async (_req, res) => {
  let syncMeta = null;
  if (mongoClient && collection) {
    try {
      syncMeta = await mongoClient.db(MONGODB_DB).collection("_sync_meta").findOne({ _id: MONGODB_ATTACKS_COLLECTION });
    } catch {
      /* ignore */
    }
  }
  res.json({
    ok: true,
    mongo: Boolean(collection),
    authUsers: Boolean(mongoClient && getUsersCollection()),
    lastMongoError: collection ? "" : lastMongoError,
    usersCollection: MONGODB_USERS_COLLECTION,
    attacksCollection: MONGODB_ATTACKS_COLLECTION,
    collection: MONGODB_ATTACKS_COLLECTION,
    appCollections: Object.values(APP_COLLECTIONS),
    compassReadme: "_COMPASS_READ_ME",
    fileStore: dataMode === "file",
    dataFile: fileStorePath,
    db: MONGODB_DB,
    lastScrapeAt: syncMeta?.last_scrape_at || syncMeta?.updated_at || null,
    readIntelFromMongo: READ_INTEL_FROM_MONGO,
    intelCacheCount: getIntelItems().length,
    t: new Date().toISOString(),
  });
});

function authBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

app.post("/api/intel/refresh", async (req, res) => {
  const tok = authBearerToken(req);
  if (!tok) {
    return res.status(401).json({
      error: "unauthorized",
      hint: "Send Authorization: Bearer <jwt> from the logged-in session.",
    });
  }
  try {
    jwt.verify(tok, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
  const now = Date.now();
  const cached = getIntelItems();
  if (
    INTEL_REFRESH_COOLDOWN_MS > 0 &&
    cached.length > 0 &&
    now - lastIntelRefreshAt < INTEL_REFRESH_COOLDOWN_MS
  ) {
    return res.json({
      ok: true,
      skipped: true,
      reason: "cooldown",
      count: cached.length,
      cooldownSec: Math.ceil(INTEL_REFRESH_COOLDOWN_MS / 1000),
    });
  }
  try {
    const { items } = await runScraperPipeline();
    setIntelItems(items);
    lastIntelRefreshAt = Date.now();
    if (mongoClient) {
      try {
        const syn = await runDerivedCollectionsSync(mongoClient.db(MONGODB_DB), {
          attacksCollectionName: MONGODB_ATTACKS_COLLECTION,
        });
        console.log("Derived collections sync (intel-refresh):", syn.groups, "groups,", syn.totalVictims, "victims");
      } catch (e) {
        console.warn("runDerivedCollectionsSync (intel-refresh):", e.message);
      }
    }
    io.emit("attacks:update", {
      reason: "intel-refresh",
      total: items.length,
      at: new Date().toISOString(),
    });
    return res.json({ ok: true, count: items.length, skipped: false });
  } catch (e) {
    console.error("POST /api/intel/refresh:", e.message);
    return res.status(500).json({ error: e.message || "scraper_failed" });
  }
});

app.get("/api/threat-groups", async (_req, res) => {
  if (!mongoClient) {
    return res.status(503).json({ error: "MongoDB unavailable", items: [], count: 0 });
  }
  try {
    const coll = mongoClient.db(MONGODB_DB).collection(APP_COLLECTIONS.threat_groups);
    const items = await coll.find({}).sort({ victim_count: -1 }).limit(500).toArray();
    return res.json({ items, count: items.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/analytics/snapshot", async (_req, res) => {
  if (!mongoClient) {
    return res.status(503).json({ error: "MongoDB unavailable" });
  }
  try {
    const coll = mongoClient.db(MONGODB_DB).collection(APP_COLLECTIONS.analytics);
    const doc = await coll.findOne({ key: "dashboard_snapshot" });
    return res.json({ snapshot: doc || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/attacks", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  if (READ_INTEL_FROM_MONGO && collection) {
    try {
      const items = await collection
        .find({})
        .sort({ updated_at: -1 })
        .limit(limit)
        .toArray();
      return res.json({ items, count: items.length, store: "mongodb" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (!READ_INTEL_FROM_MONGO) {
    const all = await intelItemsOrWarmFromDatastore(3500);
    const items = all.slice(0, limit);
    return res.json({ items, count: items.length, store: "scraper" });
  }
  const all = sortByUpdated(parseFileStore());
  const items = all.slice(0, limit);
  return res.json({ items, count: items.length, store: "file" });
});

app.get("/api/attacks/:victimId", async (req, res) => {
  const victimId = req.params.victimId;
  if (!victimId) return res.status(400).json({ error: "missing victim id" });
  try {
    const item = await findVictimDocument(victimId);
    if (!item) {
      return res.status(404).json({
        error: "victim_not_found",
        message: "No row matched this id or name in the active datastore.",
        hint: "Use ANALYSE from Victims / Live feed (uses victim_id), or a substring of target / hostname (e.g. saleskido, infosysbpm). If Mongo is empty, sync data or rely on server/data/attacks.json.",
      });
    }
    const store = READ_INTEL_FROM_MONGO
      ? dataMode === "mongo"
        ? "mongodb"
        : "file"
      : "scraper";
    return res.json({ item, store });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/analyse", async (req, res) => {
  if (!GOOGLE_AI_API_KEY) {
    return res.status(503).json({
      error: "Google AI (Gemini) API key not configured",
      hint: "Set GOOGLE_AI_API_KEY in server/.env (Google AI Studio). See docs/REFERENCE.md and server/.env.example.",
    });
  }
  const victim = req.body?.victim;
  const chartContext = req.body?.chart_context;
  if (!victim || typeof victim !== "object") {
    return res.status(400).json({ error: "Expected JSON body: { victim: { ... } }" });
  }
  if (!victim.target && !victim.victim_id) {
    return res.status(400).json({ error: "victim must include target and/or victim_id" });
  }

  const tldrSection =
    chartContext && typeof chartContext === "object"
      ? `## Executive summary
- 4–6 bullets: interpret **hub_kpis**, **velocity_7d**, **sector_distribution_index_pct** (full loaded index), **cohort_sector_mix_counts** (this organisation’s rows only), and **attribution_matrix** from chart_context. Say what is verified vs unknown from the victim JSON.`
      : `## TL;DR
- Max **5** bullets: what happened, who claimed it (if in JSON), what is verified vs unknown.`;

  const system = `You are a senior cyber threat analyst for an India national ransomware victim index (OSINT-style scrape: ransomware.live–class disclosures).

You are strong at **reading JSON chart context** (numbers, labels, series) and turning them into accurate narrative — do not contradict the JSON.

Output **GitHub-flavored Markdown** only. Be concise: short paragraphs, tight bullets, no filler.

Use this structure (headings in order):
${tldrSection}

## Attack at a glance
- One **GFM table** (Field | Value) for: primary target, attributed group, disclosure dates, country, source URL presence, proof links count (numbers only from JSON).

## Visual intelligence
- Include **1–2 Mermaid diagrams** in separate fenced blocks (\`\`\`mermaid ... \`\`\`).
- Prefer: \`flowchart LR\` or \`flowchart TD\` for attack/disclosure → attribution → impact (use nodes labeled "Unknown" when the JSON does not support a fact).
- Optionally \`pie\` or \`gantt\` **only** if every numeric slice or date comes from the supplied JSON (otherwise skip that chart).
- Do **not** output base64 images or HTML charts.

## Narrative (concise)
### Entity & exposure
### Threat actor & campaign context
### Likely impact
(Only facts supported by the JSON; otherwise state **Unknown**.)

### Defensive & recovery actions
Numbered list, max **7** items, practical and sector-agnostic unless the JSON implies a sector.

### Data gaps & OSINT next steps
What an analyst should verify next.

Hard rules: Never invent ransom amounts, exact leak/exfil volumes, insider timelines, or internal company data. If the JSON is thin, say so explicitly. Professional tone.`;

  const chartBlock =
    chartContext && typeof chartContext === "object"
      ? `\n\nHub / chart context (derived from scrape index only, JSON):\n${JSON.stringify(chartContext, null, 2)}`
      : "";

  const userContent = `Analyze this single indexed disclosure (JSON). Ground every claim in these fields; cite "Unknown" when missing.\n\n${JSON.stringify(victim, null, 2)}${chartBlock}`;

  try {
    const upstreamSignal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(120_000)
        : undefined;
    const analysis = await geminiGenerateMarkdown({
      apiKey: GOOGLE_AI_API_KEY,
      model: GOOGLE_AI_MODEL,
      systemPrompt: system,
      userPrompt: userContent,
      signal: upstreamSignal,
    });
    if (mongoClient) {
      try {
        await recordAiSummary(mongoClient.db(MONGODB_DB), {
          kind: "victim",
          ref: String(victim.victim_id || victim.target || "unknown"),
          analysis,
          model: GOOGLE_AI_MODEL,
          provider: "google-gemini",
        });
      } catch (e) {
        console.warn("recordAiSummary (victim):", e.message);
      }
    }
    return res.json({ analysis, model: GOOGLE_AI_MODEL, provider: "google-gemini" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Gemini request failed" });
  }
});

app.post("/api/analyse/group-deployment", (_req, res) => {
  return res.status(410).json({
    error: "Gone",
    detail: "Group deployment briefing is generated locally in the web app; this endpoint is no longer used.",
  });
});

mountPhishingRoutes(app, {
  getMongoClient: () => mongoClient,
  dbName: MONGODB_DB,
  jwtSecret: JWT_SECRET,
  safeBrowsingApiKey: GOOGLE_SAFE_BROWSING_API_KEY,
  googleAiKey: GOOGLE_AI_API_KEY,
  googleAiModel: GOOGLE_AI_MODEL,
});

mountReportRoutes(app, {
  jwtSecret: JWT_SECRET,
  googleAiKey: GOOGLE_AI_API_KEY,
  googleAiModel: GOOGLE_AI_MODEL,
});

app.get("/api/data-leaks/:victimId", async (req, res) => {
  if (!mongoClient) {
    return res.status(503).json({ error: "MongoDB unavailable", doc: null });
  }
  try {
    const victimId = decodeURIComponent(String(req.params.victimId || ""));
    if (!victimId) return res.status(400).json({ error: "victimId required" });
    const doc = await mongoClient
      .db(MONGODB_DB)
      .collection(APP_COLLECTIONS.data_leaks)
      .findOne({ victim_id: victimId });
    return res.json({ doc: doc || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/analyse/breach", (_req, res) => {
  return res.status(410).json({
    error: "Gone",
    detail: "Breach analysis is generated locally in the web app; this endpoint is no longer used.",
  });
});

app.post("/api/live/stream-analytics", async (req, res) => {
  if (!GROQ_API_KEY) {
    return res.status(503).json({
      error: "Groq API key not configured",
      hint: "Set GROQ_API_KEY in server/.env. See docs/REFERENCE.md.",
    });
  }
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 28);
  try {
    const items = await loadItemsForAi(limit);
    const digest = digestForGroqStream(items);
    const system = `Ransomware index analyst (India). Stream short markdown: velocity, sectors, groups, anomalies.
Rules: only facts from the JSON rows; no invented incidents; tight bullets.`;
    const user = `n=${digest.length} newest-first rows:\n${JSON.stringify(digest)}`;
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(90_000)
        : undefined;
    await groqStreamNdjson({
      apiKey: GROQ_API_KEY,
      model: GROQ_MODEL,
      system,
      user,
      res,
      signal,
    });
  } catch (e) {
    if (!res.headersSent) {
      return res.status(500).json({ error: e.message || "Groq stream failed" });
    }
    try {
      res.write(JSON.stringify({ error: String(e.message || e) }) + "\n");
      res.end();
    } catch {
      /* ignore */
    }
  }
});

app.get("/api/stats", async (_req, res) => {
  if (READ_INTEL_FROM_MONGO && collection) {
    try {
      const total = await collection.countDocuments({});
      const latest = await collection.findOne(
        {},
        { sort: { updated_at: -1 }, projection: { updated_at: 1, target: 1 } }
      );
      return res.json({ total, latest, store: "mongodb" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (!READ_INTEL_FROM_MONGO) {
    const all = await intelItemsOrWarmFromDatastore(3500);
    const latest = all[0] ? { updated_at: all[0].updated_at, target: all[0].target } : null;
    return res.json({ total: all.length, latest, store: "scraper" });
  }
  const all = sortByUpdated(parseFileStore());
  const latest = all[0] ? { updated_at: all[0].updated_at, target: all[0].target } : null;
  return res.json({ total: all.length, latest, store: "file" });
});

app.post("/hooks/scrape-complete", async (req, res) => {
  if (SCRAPE_HOOK_SECRET) {
    const h = req.headers["x-scrape-secret"];
    if (h !== SCRAPE_HOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }
  if (mongoClient) {
    try {
      await runDerivedCollectionsSync(mongoClient.db(MONGODB_DB), {
        attacksCollectionName: MONGODB_ATTACKS_COLLECTION,
      });
    } catch (e) {
      console.warn("runDerivedCollectionsSync (scrape-hook):", e.message);
    }
  }
  broadcastIfChanged("scrape-hook").catch(() => {});
  checkFileAndNotify("scrape-hook");
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  socket.emit("attacks:hello", { t: new Date().toISOString() });
});

async function startChangeStream() {
  if (!collection) return;
  try {
    const cs = collection.watch([], { fullDocument: "updateLookup" });
    cs.on("change", () => {
      broadcastIfChanged("change-stream").catch(() => {});
    });
    cs.on("error", (err) => {
      console.warn("Change stream unavailable (use replica set or rely on hook/poll):", err.message);
    });
    console.log("Change stream: listening");
  } catch (e) {
    console.warn("Change stream not started:", e.message);
  }
}

setInterval(() => {
  if (dataMode === "mongo") {
    broadcastIfChanged("poll").catch(() => {});
  } else {
    checkFileAndNotify("poll");
  }
}, POLL_MS);

async function ensureMongoBeforeAuth() {
  if (mongoClient) {
    try {
      await mongoClient.db(MONGODB_DB).command({ ping: 1 });
      return true;
    } catch (e) {
      console.warn("MongoDB ping failed; reconnecting:", e.message);
      try {
        await mongoClient.close();
      } catch {
        /* ignore */
      }
      mongoClient = undefined;
      collection = null;
      dataMode = "file";
    }
  }
  return await connectMongo();
}

mountAuthRoutes(app, {
  getUsersCollection,
  ensureMongoBeforeAuth,
  getLastMongoError: () => lastMongoError,
  jwtSecret: JWT_SECRET,
  jwtExpires: JWT_EXPIRES_IN,
});

server.listen(PORT, async () => {
  const ok = await connectMongo();
  if (REQUIRE_MONGO && !ok) {
    console.error(
      "REQUIRE_MONGO is set but MongoDB could not be reached. Start Mongo (e.g. `docker compose up -d` from repo root) or unset REQUIRE_MONGO for JSON file fallback."
    );
    process.exit(1);
  }
  if (ok) {
    await startChangeStream();
    try {
      const syn = await runDerivedCollectionsSync(mongoClient.db(MONGODB_DB), {
        attacksCollectionName: MONGODB_ATTACKS_COLLECTION,
      });
      console.log(
        `Derived collections: synced threat_groups (${syn.groups} groups), analytics snapshot (${syn.totalVictims} victims)`
      );
    } catch (e) {
      console.warn("Startup runDerivedCollectionsSync:", e.message);
    }
    await broadcastIfChanged("startup");
    console.log(
      READ_INTEL_FROM_MONGO
        ? "Stack: Node.js API + MongoDB (dashboard reads attacks from DB)"
        : "Stack: Node.js API + MongoDB (writes only from scraper) + in-memory intel cache (dashboard reads scraper path; POST /api/intel/refresh)"
    );
  } else {
    checkFileAndNotify("startup");
    console.warn("Stack: Node.js API + JSON file (Mongo unavailable — dev fallback only)");
  }
  console.log(`API + WebSocket http://localhost:${PORT}`);
  if (!GOOGLE_AI_API_KEY) console.warn("Google Gemini: GOOGLE_AI_API_KEY unset — POST /api/analyse disabled.");
  if (!GOOGLE_SAFE_BROWSING_API_KEY) {
    console.warn("Safe Browsing: GOOGLE_SAFE_BROWSING_API_KEY unset — POST /api/phishing/scan disabled.");
  }
  if (!GROQ_API_KEY) console.warn("Groq: GROQ_API_KEY unset — POST /api/live/stream-analytics disabled.");
});
