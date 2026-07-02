/**
 * One-off admin helper: set a temporary password for a user by email.
 * Usage (from server/): node scripts/set-temp-password.mjs user@example.com
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const emailArg = process.argv[2];
if (!emailArg) {
  console.error("Usage: node scripts/set-temp-password.mjs user@example.com");
  process.exit(1);
}

const email = String(emailArg).trim().toLowerCase();
const tempPassword = `CyberWatch-${crypto.randomBytes(4).toString("hex")}`;
const URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "ransomware_india";
const USERS = process.env.MONGODB_USERS_COLLECTION || "users";

const client = new MongoClient(URI);
try {
  await client.connect();
  const coll = client.db(DB_NAME).collection(USERS);
  const doc = await coll.findOne({ email });
  if (!doc) {
    console.error(`No user found for email: ${email}`);
    process.exit(2);
  }
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const r = await coll.updateOne({ _id: doc._id }, { $set: { passwordHash, updatedAt: new Date() } });
  if (r.matchedCount !== 1) {
    console.error("Password update failed");
    process.exit(3);
  }
  console.log(JSON.stringify({ email: doc.email, displayName: doc.displayName || "", tempPassword }, null, 2));
} finally {
  await client.close();
}
