import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId, Binary } from "mongodb";

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Never throw: invalid expiresIn breaks login/register with HTTP 500. */
function signAuthToken(secret, subject, expiresIn) {
  const sub = String(subject);
  const raw = typeof expiresIn === "string" && expiresIn.trim() ? expiresIn.trim() : "7d";
  const payload = { sub };
  try {
    return jwt.sign(payload, secret, { expiresIn: raw });
  } catch (e1) {
    try {
      return jwt.sign(payload, secret, { expiresIn: "7d" });
    } catch (e2) {
      console.warn("jwt.sign expiresIn fallback:", e1?.message || e1, e2?.message || e2);
      return jwt.sign(payload, secret, {});
    }
  }
}

/** MongoDB may return bcrypt hash as string, Buffer, or BSON Binary. */
function bcryptHashFromDoc(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Binary) {
    return raw.toString("utf8");
  }
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof Uint8Array) return Buffer.from(raw).toString("utf8");
  if (typeof raw === "object" && raw !== null && raw.buffer instanceof ArrayBuffer) {
    return Buffer.from(raw.buffer).toString("utf8");
  }
  return String(raw);
}

function normEmail(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

const MAX_AVATAR_DATA_URL_CHARS = 2_200_000;

function safeIsoFromDoc(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    const t = d.getTime();
    return Number.isFinite(t) ? d.toISOString() : null;
  }
  return null;
}

function publicUser(doc) {
  if (!doc) return null;
  const phoneRaw = doc.phone;
  const phone =
    phoneRaw == null || phoneRaw === ""
      ? ""
      : String(phoneRaw)
          .trim()
          .slice(0, 40);
  return {
    id: String(doc._id),
    email: doc.email,
    displayName: doc.displayName || "",
    phone,
    avatarDataUrl: doc.avatarDataUrl && typeof doc.avatarDataUrl === "string" ? doc.avatarDataUrl : null,
    createdAt: safeIsoFromDoc(doc.createdAt),
    updatedAt: safeIsoFromDoc(doc.updatedAt),
  };
}

function authHeaderUserId(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/**
 * @param {{ getUsersCollection: () => import("mongodb").Collection | null; ensureMongoBeforeAuth?: () => Promise<boolean>; getLastMongoError?: () => string }} opts
 */
async function resolveUsersCollection(opts) {
  let coll = opts.getUsersCollection();
  if (!coll && typeof opts.ensureMongoBeforeAuth === "function") {
    try {
      const ok = await opts.ensureMongoBeforeAuth();
      if (ok) coll = opts.getUsersCollection();
    } catch {
      /* connectMongo / ping already logged */
    }
  }
  return coll;
}

function authMongo503(res, opts) {
  const detail = typeof opts.getLastMongoError === "function" ? opts.getLastMongoError() : "";
  return res.status(503).json({
    error: "MongoDB is not connected — the API cannot read or write user accounts until Atlas is reachable.",
    hint: detail
      ? `Last error: ${detail}. Fix: MongoDB Atlas → Network Access (allow your current IP or 0.0.0.0/0 for demos), verify MONGODB_URI user/password in server/.env, then restart the Node server.`
      : "Check server console, MONGODB_URI in server/.env, and restart the API.",
  });
}

/**
 * @param {import("express").Express} app
 * @param {{ getUsersCollection: () => import("mongodb").Collection | null; ensureMongoBeforeAuth?: () => Promise<boolean>; getLastMongoError?: () => string; jwtSecret: string; jwtExpires: string }} opts
 */
export function mountAuthRoutes(app, opts) {
  const { jwtSecret, jwtExpires } = opts;

  app.post("/api/auth/register", async (req, res) => {
    const coll = await resolveUsersCollection(opts);
    if (!coll) {
      return authMongo503(res, opts);
    }
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const displayName = String(req.body?.displayName ?? "").trim();

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (displayName.length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date();
    try {
      const ins = await coll.insertOne({
        email,
        passwordHash,
        displayName,
        phone: "",
        createdAt: now,
        updatedAt: now,
      });
      const token = signAuthToken(jwtSecret, ins.insertedId.toString(), jwtExpires);
      const doc = await coll.findOne({ _id: ins.insertedId });
      if (!doc) {
        return res.status(500).json({
          error: "Registration saved but user could not be read back",
          detail: "Check MongoDB connectivity and users collection.",
        });
      }
      return res.status(201).json({ token, user: publicUser(doc) });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      console.error("register:", e?.message || e);
      return res.status(500).json({
        error: "Registration failed",
        detail: typeof e?.message === "string" ? e.message : String(e),
      });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const coll = await resolveUsersCollection(opts);
      if (!coll) {
        return authMongo503(res, opts);
      }
      const email = normEmail(req.body?.email);
      const password = String(req.body?.password ?? "");

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const doc = await coll.findOne({ email });
      if (!doc?.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const hash = bcryptHashFromDoc(doc.passwordHash);
      if (!hash.startsWith("$2")) {
        console.error("login: passwordHash is not bcrypt for", email);
        return res.status(500).json({
          error: "Account record is corrupted (invalid password hash). Ask an admin to fix or delete this user in MongoDB.",
        });
      }
      let ok;
      try {
        ok = await bcrypt.compare(password, hash);
      } catch (e) {
        console.error("login bcrypt.compare:", e?.message || e);
        return res.status(500).json({
          error: "Could not verify stored password for this account.",
          detail: typeof e?.message === "string" ? e.message : "",
        });
      }
      if (!ok) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = signAuthToken(jwtSecret, String(doc._id), jwtExpires);
      return res.json({ token, user: publicUser(doc) });
    } catch (e) {
      console.error("POST /api/auth/login:", e?.message || e);
      return res.status(500).json({
        error: "Login failed on the server",
        detail: typeof e?.message === "string" ? e.message : String(e),
      });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const coll = await resolveUsersCollection(opts);
    if (!coll) {
      return authMongo503(res, opts);
    }
    const raw = authHeaderUserId(req);
    if (!raw) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }
    let payload;
    try {
      payload = jwt.verify(raw, jwtSecret);
    } catch {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    if (!payload.sub || !ObjectId.isValid(payload.sub)) {
      return res.status(401).json({ error: "Invalid session" });
    }
    const doc = await coll.findOne({ _id: new ObjectId(payload.sub) });
    if (!doc) {
      return res.status(401).json({ error: "User not found" });
    }
    return res.json({ user: publicUser(doc) });
  });

  app.patch("/api/auth/profile", async (req, res) => {
    try {
      const coll = await resolveUsersCollection(opts);
      if (!coll) {
        return authMongo503(res, opts);
      }
      const raw = authHeaderUserId(req);
      if (!raw) {
        return res.status(401).json({ error: "Missing Authorization Bearer token" });
      }
      let payload;
      try {
        payload = jwt.verify(raw, jwtSecret);
      } catch {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      if (!payload.sub || !ObjectId.isValid(payload.sub)) {
        return res.status(401).json({ error: "Invalid session" });
      }

      const displayName =
        req.body?.displayName != null ? String(req.body.displayName).trim() : undefined;
      const phone = req.body?.phone != null ? String(req.body.phone).trim().slice(0, 40) : undefined;
      const hasAvatarKey = Object.prototype.hasOwnProperty.call(req.body || {}, "avatarDataUrl");
      const avatarRaw = hasAvatarKey ? req.body.avatarDataUrl : undefined;

      const setDoc = { updatedAt: new Date() };
      if (displayName !== undefined) {
        if (!displayName) {
          return res.status(400).json({ error: "Display name cannot be empty" });
        }
        setDoc.displayName = displayName.slice(0, 120);
      }
      if (phone !== undefined) {
        setDoc.phone = phone;
      }
      if (hasAvatarKey) {
        if (avatarRaw === null || avatarRaw === "") {
          setDoc.avatarDataUrl = null;
        } else if (typeof avatarRaw === "string") {
          if (avatarRaw.length > MAX_AVATAR_DATA_URL_CHARS) {
            return res.status(400).json({ error: "Profile image is too large to store" });
          }
          if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(avatarRaw.slice(0, 40))) {
            return res.status(400).json({
              error: "Profile image must be a data URL (image/jpeg, png, webp, or gif)",
            });
          }
          setDoc.avatarDataUrl = avatarRaw;
        } else {
          return res.status(400).json({ error: "avatarDataUrl must be a string or null" });
        }
      }
      if (Object.keys(setDoc).length === 1) {
        return res.status(400).json({
          error: "No valid fields to update (displayName, phone, avatarDataUrl)",
        });
      }

      const oid = new ObjectId(payload.sub);
      const upd = await coll.updateOne({ _id: oid }, { $set: setDoc });
      if (upd.matchedCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      const doc = await coll.findOne({ _id: oid });
      if (!doc) {
        return res.status(404).json({ error: "User not found after update" });
      }
      return res.json({ user: publicUser(doc) });
    } catch (e) {
      console.error("PATCH /api/auth/profile:", e?.message || e);
      return res.status(500).json({
        error: "Profile update failed",
        detail: typeof e?.message === "string" ? e.message : String(e),
      });
    }
  });
}

export async function ensureUserIndexes(getUsersCollection) {
  const coll = getUsersCollection();
  if (!coll) return;
  try {
    await coll.createIndex({ email: 1 }, { unique: true, name: "uq_users_email" });
  } catch (e) {
    console.warn("Mongo users index uq_users_email:", e.message);
  }
}
