import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { scanPhishingUrl } from "./phishingScan.js";
import { APP_COLLECTIONS } from "./dbSchema.js";

const COLLECTION = APP_COLLECTIONS.phishing_url;
const MAX_HISTORY_PER_USER = 20;

function bearerToken(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

function authUserId(req, jwtSecret) {
  const raw = bearerToken(req);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, jwtSecret);
    if (!payload.sub || !ObjectId.isValid(payload.sub)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function phishingColl(getMongoClient, dbName) {
  const mongoClient = typeof getMongoClient === "function" ? getMongoClient() : getMongoClient;
  if (!mongoClient) return null;
  return mongoClient.db(dbName).collection(COLLECTION);
}

function toIso(value) {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function toHistorySummary(doc) {
  return {
    id: String(doc._id),
    url: doc.scannedUrl || doc.url,
    riskScore: doc.riskScore,
    status: doc.status,
    date: toIso(doc.scannedAt),
  };
}

function toScanResponse(doc) {
  const base = doc.result && typeof doc.result === "object" ? { ...doc.result } : {};
  return {
    ...base,
    id: String(doc._id),
    scannedUrl: doc.scannedUrl || base.scannedUrl || doc.url,
    scannedAt: toIso(doc.scannedAt),
    riskScore: doc.riskScore ?? base.riskScore,
    status: doc.status ?? base.status,
  };
}

async function trimUserHistory(coll, userId) {
  const oid = new ObjectId(userId);
  const stale = await coll
    .find({ userId: oid })
    .sort({ scannedAt: -1, _id: -1 })
    .skip(MAX_HISTORY_PER_USER)
    .project({ _id: 1 })
    .toArray();
  if (stale.length) {
    await coll.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
  }
}

export async function ensurePhishingScanIndexes(db) {
  try {
    await db.collection(COLLECTION).createIndex(
      { userId: 1, scannedAt: -1 },
      { name: "idx_phishing_user_scanned" }
    );
  } catch (e) {
    console.warn("Mongo index idx_phishing_user_scanned:", e.message);
  }
}

/**
 * @param {import("express").Express} app
 * @param {{ getMongoClient: () => import("mongodb").MongoClient | null; dbName: string; jwtSecret: string; safeBrowsingApiKey: string; googleAiKey: string; googleAiModel: string }} opts
 */
export function mountPhishingRoutes(app, opts) {
  const { getMongoClient, dbName, jwtSecret, safeBrowsingApiKey, googleAiKey, googleAiModel } = opts;

  app.get("/api/phishing/history", async (req, res) => {
    const userId = authUserId(req, jwtSecret);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", hint: "Sign in to view scan history." });
    }
    const coll = phishingColl(getMongoClient, dbName);
    if (!coll) {
      return res.status(503).json({ error: "MongoDB unavailable" });
    }
    try {
      const docs = await coll
        .find({ userId: new ObjectId(userId) })
        .sort({ scannedAt: -1, _id: -1 })
        .limit(MAX_HISTORY_PER_USER)
        .toArray();
      return res.json({ items: docs.map(toHistorySummary) });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not load scan history" });
    }
  });

  app.get("/api/phishing/history/:id", async (req, res) => {
    const userId = authUserId(req, jwtSecret);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", hint: "Sign in to view saved scans." });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid scan id" });
    }
    const coll = phishingColl(getMongoClient, dbName);
    if (!coll) {
      return res.status(503).json({ error: "MongoDB unavailable" });
    }
    try {
      const doc = await coll.findOne({
        _id: new ObjectId(req.params.id),
        userId: new ObjectId(userId),
      });
      if (!doc?.result) {
        return res.status(404).json({ error: "Saved scan not found" });
      }
      return res.json(toScanResponse(doc));
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not load scan" });
    }
  });

  app.delete("/api/phishing/history/:id", async (req, res) => {
    const userId = authUserId(req, jwtSecret);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid scan id" });
    }
    const coll = phishingColl(getMongoClient, dbName);
    if (!coll) {
      return res.status(503).json({ error: "MongoDB unavailable" });
    }
    try {
      const r = await coll.deleteOne({
        _id: new ObjectId(req.params.id),
        userId: new ObjectId(userId),
      });
      if (r.deletedCount === 0) {
        return res.status(404).json({ error: "Scan not found" });
      }
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Could not delete scan" });
    }
  });

  app.post("/api/phishing/scan", async (req, res) => {
    const userId = authUserId(req, jwtSecret);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", hint: "Sign in to scan and save history." });
    }
    const url = req.body?.url;
    if (!url || typeof url !== "string" || !String(url).trim()) {
      return res.status(400).json({ error: 'Expected JSON body: { url: "https://example.com" }' });
    }
    if (!safeBrowsingApiKey) {
      return res.status(503).json({
        error: "Google Safe Browsing API key not configured",
        hint: "Set GOOGLE_SAFE_BROWSING_API_KEY in server/.env (Google Cloud Console → Safe Browsing API).",
      });
    }
    const coll = phishingColl(getMongoClient, dbName);
    if (!coll) {
      return res.status(503).json({ error: "MongoDB unavailable — scan history requires a database connection." });
    }
    try {
      const result = await scanPhishingUrl(url, {
        safeBrowsingApiKey,
        googleAiKey,
        googleAiModel,
      });
      const scannedAt = new Date(result.scannedAt || Date.now());
      const ins = await coll.insertOne({
        userId: new ObjectId(userId),
        url: String(url).trim(),
        scannedUrl: result.scannedUrl,
        riskScore: result.riskScore,
        status: result.status,
        scannedAt,
        result,
        createdAt: new Date(),
      });
      await trimUserHistory(coll, userId);
      return res.json({ ...result, id: String(ins.insertedId) });
    } catch (e) {
      const msg = e?.message || "Phishing scan failed";
      const status = /invalid url/i.test(msg) ? 400 : 500;
      return res.status(status).json({ error: msg });
    }
  });
}
