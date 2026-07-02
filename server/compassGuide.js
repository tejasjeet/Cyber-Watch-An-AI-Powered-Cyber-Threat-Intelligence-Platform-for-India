import { APP_COLLECTIONS } from "./dbSchema.js";

export async function upsertCompassGuide(client, dbName, opts) {
  const {
    attacksCollection = APP_COLLECTIONS.attacks,
    usersCollection = APP_COLLECTIONS.users,
  } = opts || {};
  const coll = client.db(dbName).collection("_COMPASS_READ_ME");
  const now = new Date();
  const doc = {
    _id: "START_HERE",
    title: "CYBER WATCH — collection map",
    database: dbName,
    problem_you_might_see:
      "If you only see admin / config / local: those are system DBs. Open your app database name on the left (see `database` above).",
    collections_registry: {
      [usersCollection]:
        "Auth: email, displayName, passwordHash (bcrypt), phone, optional avatarDataUrl (JPEG/PNG data URL), createdAt, updatedAt.",
      [attacksCollection]:
        "Victim index from Python scraper (ransomware.live India). Unique victim_id; sort by updated_at desc.",
      [APP_COLLECTIONS.ai_summaries]:
        "Gemini victim summaries: `kind: victim` + `ref` (victim_id), `analysis` markdown, `model`, `provider`, `created_at` (insert on POST /api/analyse only). Legacy rows may exist for older `group_deployment` / `breach` kinds.",
      [APP_COLLECTIONS.data_leaks]:
        "Optional breach dossier docs (legacy or manual): `victim_id`, `company`, `group`, `ai_summary`, `severity_score`, etc. GET /api/data-leaks/:victimId. The app no longer upserts from POST /api/analyse/breach (that route returns 410).",
      [APP_COLLECTIONS.threat_groups]:
        "Auto-synced from `attacks`: one doc per `group` with `victim_count`, `last_disclosure_at`, `slug` (unique), rebuilt on API startup, POST /api/intel/refresh, and POST /hooks/scrape-complete.",
      [APP_COLLECTIONS.countries]: "Reserved: country reference rows.",
      [APP_COLLECTIONS.live_logs]:
        "Append-only: `derived_sync` entries when threat_groups + analytics snapshot is rebuilt; extend for other ops logs.",
      [APP_COLLECTIONS.scrape_history]: "Reserved: one doc per scrape batch (timestamps, counts).",
      [APP_COLLECTIONS.analytics]:
        "Document `key: dashboard_snapshot`: `total_victims`, `unique_groups`, `top_groups[]`, `computed_at` (upsert on derived sync).",
      [APP_COLLECTIONS.notifications]: "Reserved: in-app alerts per user.",
      [APP_COLLECTIONS.reports]: "Reserved: generated PDF / export metadata.",
      [APP_COLLECTIONS.phishing_url]:
        "Phishing URL Scanner history: one doc per scan (`userId`, `url`, `scannedUrl`, `riskScore`, `status`, `scannedAt`, full `result` object with AI analysis). Written on POST /api/phishing/scan; listed via GET /api/phishing/history.",
      _sync_meta: `Ops: document _id \"${attacksCollection}\" → last_scrape_at, last_row_count (Python scraper updates).`,
      _COMPASS_READ_ME: "This help card (recreated on API startup when Mongo is up).",
    },
    what_to_do_in_compass: [
      `1) Click database **${dbName}**.`,
      `2) **${attacksCollection}** — main victim data; sort **updated_at** descending.`,
      `3) **${usersCollection}** — registered accounts.`,
      `4) **${APP_COLLECTIONS.phishing_url}** — Phishing URL Scanner search history (full saved reports per user).`,
      "5) **_sync_meta** — scrape heartbeat for the attacks collection.",
      "6) Other collections exist as empty shells until features write to them.",
    ],
    updated_at: now,
  };
  await coll.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
  try {
    await coll.createIndex({ updated_at: -1 }, { name: "idx_compass_guide_updated" });
  } catch {
    /* ignore */
  }
}
