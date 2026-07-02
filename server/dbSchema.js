export const APP_COLLECTIONS = Object.freeze({
  users: "users",
  attacks: "attacks",
  ai_summaries: "ai_summaries",
  threat_groups: "threat_groups",
  countries: "countries",
  live_logs: "live_logs",
  scrape_history: "scrape_history",
  analytics: "analytics",
  notifications: "notifications",
  reports: "reports",
  data_leaks: "data_leaks",
  phishing_url: "phishing url",
});

export const ALL_APP_COLLECTION_NAMES = Object.values(APP_COLLECTIONS);

export async function ensureAppCollections(db) {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of ALL_APP_COLLECTION_NAMES) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      existing.add(name);
    }
  }
}

export async function ensureAttackIndexes(db, attacksCollectionName = APP_COLLECTIONS.attacks) {
  const coll = db.collection(attacksCollectionName);
  try {
    await coll.createIndex({ victim_id: 1 }, { unique: true, name: "uq_victim_id" });
  } catch (e) {
    console.warn("Mongo index uq_victim_id:", e.message);
  }
  try {
    await coll.createIndex({ updated_at: -1 }, { name: "idx_updated_at_desc" });
  } catch (e) {
    console.warn("Mongo index idx_updated_at_desc:", e.message);
  }
  try {
    await coll.createIndex({ group: 1 }, { name: "idx_group", sparse: true });
  } catch (e) {
    console.warn("Mongo index idx_group:", e.message);
  }
}

export async function ensureOptionalCollectionIndexes(db) {
  const tryIdx = async (collName, spec, opts) => {
    try {
      await db.collection(collName).createIndex(spec, opts);
    } catch {
      /* ignore */
    }
  };
  await tryIdx(APP_COLLECTIONS.scrape_history, { finished_at: -1 }, { sparse: true, name: "idx_scrape_finished" });
  await tryIdx(APP_COLLECTIONS.ai_summaries, { victim_id: 1, created_at: -1 }, { sparse: true, name: "idx_ai_victim_created" });
  await tryIdx(APP_COLLECTIONS.live_logs, { created_at: -1 }, { sparse: true, name: "idx_live_created" });
  await tryIdx(APP_COLLECTIONS.threat_groups, { slug: 1 }, { sparse: true, name: "idx_threat_slug" });
  await tryIdx(APP_COLLECTIONS.countries, { code: 1 }, { sparse: true, name: "idx_country_code" });
  await tryIdx(APP_COLLECTIONS.analytics, { key: 1, computed_at: -1 }, { sparse: true, name: "idx_analytics_key_time" });
  await tryIdx(APP_COLLECTIONS.notifications, { userId: 1, created_at: -1 }, { sparse: true, name: "idx_notif_user_created" });
  await tryIdx(APP_COLLECTIONS.reports, { created_at: -1 }, { sparse: true, name: "idx_reports_created" });
  await tryIdx(APP_COLLECTIONS.data_leaks, { victim_id: 1 }, { sparse: true, name: "idx_data_leaks_victim" });
  await tryIdx(APP_COLLECTIONS.phishing_url, { userId: 1, scannedAt: -1 }, { sparse: true, name: "idx_phishing_user_scanned" });
}
