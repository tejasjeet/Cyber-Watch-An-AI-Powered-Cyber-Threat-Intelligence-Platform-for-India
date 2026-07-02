/**
 * Wipes application collections and recreates empty shells + indexes + Compass guide.
 *
 * Run from server folder:
 *   set RESET_DB_CONFIRM=DELETE_ALL_DATA   (Windows cmd)
 *   $env:RESET_DB_CONFIRM='DELETE_ALL_DATA' (PowerShell)
 *   npm run db:reset
 *
 * NEVER commit RESET_DB_CONFIRM in .env — one-shot terminal env only.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import {
  ALL_APP_COLLECTION_NAMES,
  APP_COLLECTIONS,
  ensureAppCollections,
  ensureAttackIndexes,
  ensureOptionalCollectionIndexes,
} from "../dbSchema.js";
import { upsertCompassGuide } from "../compassGuide.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "ransomware_india";
const ATTACKS = process.env.MONGODB_ATTACKS_COLLECTION || process.env.MONGODB_COLLECTION || APP_COLLECTIONS.attacks;
const USERS = process.env.MONGODB_USERS_COLLECTION || APP_COLLECTIONS.users;

if (process.env.RESET_DB_CONFIRM !== "DELETE_ALL_DATA") {
  console.error(
    "Refusing to run: set environment RESET_DB_CONFIRM=DELETE_ALL_DATA for this shell only, then: npm run db:reset"
  );
  process.exit(1);
}

const LEGACY = ["india_attacks"];
const META = ["_sync_meta", "_COMPASS_READ_ME"];

async function dropIfExists(db, name) {
  try {
    const cols = await db.listCollections({ name }).toArray();
    if (cols.length) {
      await db.collection(name).drop();
      console.log("Dropped:", name);
    }
  } catch (e) {
    console.warn("Drop skipped:", name, e.message);
  }
}

async function main() {
  const isAtlas = /^mongodb\+srv:/i.test(URI);
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: isAtlas || URI.includes(".mongodb.net") ? 20000 : 8000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  for (const n of [...LEGACY, ...META, ...ALL_APP_COLLECTION_NAMES]) {
    await dropIfExists(db, n);
  }

  await ensureAppCollections(db);
  await ensureOptionalCollectionIndexes(db);
  await ensureAttackIndexes(db, ATTACKS);
  const { ensureUserIndexes } = await import("../authRoutes.js");
  await ensureUserIndexes(() => db.collection(USERS));
  await upsertCompassGuide(client, DB_NAME, { attacksCollection: ATTACKS, usersCollection: USERS });

  console.log("Reset complete. Collections:", ALL_APP_COLLECTION_NAMES.join(", "));
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
