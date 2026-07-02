import { APP_COLLECTIONS } from "./dbSchema.js";

function slugifyGroup(name) {
  return (
    String(name || "unknown")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function rowTs(r) {
  const u = r.updated_at ? new Date(r.updated_at).getTime() : NaN;
  const d = r.discovered_date ? new Date(r.discovered_date).getTime() : NaN;
  const a = Number.isFinite(u) ? u : 0;
  const b = Number.isFinite(d) ? d : 0;
  return Math.max(a, b, 0);
}

/**
 * Aggregates `attacks` into `threat_groups`, snapshot `analytics`, optional `live_logs` line.
 * Safe to call repeatedly (uses last_sync_run then deletes stale group rows).
 */
export async function runDerivedCollectionsSync(db, opts = {}) {
  const attacksName = opts.attacksCollectionName || APP_COLLECTIONS.attacks;
  const attacks = db.collection(attacksName);
  const threatGroups = db.collection(APP_COLLECTIONS.threat_groups);
  const analytics = db.collection(APP_COLLECTIONS.analytics);
  const liveLogs = db.collection(APP_COLLECTIONS.live_logs);

  const runId = new Date();
  const map = new Map();

  const cursor = attacks.find(
    {},
    { projection: { group: 1, updated_at: 1, discovered_date: 1, victim_id: 1 } }
  );
  for await (const r of cursor) {
    const g = r.group && String(r.group).trim() ? String(r.group).trim() : "Unknown";
    const ts = rowTs(r);
    if (!map.has(g)) {
      map.set(g, { name: g, victim_count: 0, last_disclosure_at: null, maxTs: 0 });
    }
    const o = map.get(g);
    o.victim_count += 1;
    if (ts > o.maxTs) {
      o.maxTs = ts;
      o.last_disclosure_at = ts > 0 ? new Date(ts) : null;
    }
  }

  const totalVictims = await attacks.countDocuments({});
  const topGroups = [...map.values()]
    .sort((a, b) => b.victim_count - a.victim_count || a.name.localeCompare(b.name))
    .slice(0, 24)
    .map((o) => ({
      name: o.name,
      slug: slugifyGroup(o.name),
      victim_count: o.victim_count,
      last_disclosure_at: o.last_disclosure_at,
    }));

  const bulk = [];
  for (const o of map.values()) {
    const slug = slugifyGroup(o.name);
    bulk.push({
      replaceOne: {
        filter: { slug },
        replacement: {
          slug,
          name: o.name,
          victim_count: o.victim_count,
          last_disclosure_at: o.last_disclosure_at,
          last_sync_run: runId,
          source: "attacks_aggregate",
        },
        upsert: true,
      },
    });
  }

  if (bulk.length) {
    await threatGroups.bulkWrite(bulk, { ordered: false });
  }
  await threatGroups.deleteMany({ last_sync_run: { $ne: runId } });

  await analytics.replaceOne(
    { key: "dashboard_snapshot" },
    {
      key: "dashboard_snapshot",
      computed_at: runId,
      total_victims: totalVictims,
      unique_groups: map.size,
      top_groups: topGroups,
    },
    { upsert: true }
  );

  if (opts.logEvent !== false) {
    try {
      await liveLogs.insertOne({
        type: "derived_sync",
        message: `Synced threat_groups (${map.size} groups), analytics snapshot (${totalVictims} victims in attacks).`,
        created_at: runId,
        meta: { attacksCollection: attacksName },
      });
    } catch {
      /* ignore */
    }
  }

  return { groups: map.size, totalVictims, runAt: runId.toISOString() };
}

const MAX_AI_SUMMARY_CHARS = 400_000;

/**
 * Persist Gemini (or other) markdown for audits / Compass.
 */
export async function recordAiSummary(db, doc) {
  const coll = db.collection(APP_COLLECTIONS.ai_summaries);
  const analysis = String(doc.analysis || "").slice(0, MAX_AI_SUMMARY_CHARS);
  await coll.insertOne({
    kind: doc.kind,
    ref: String(doc.ref || ""),
    analysis,
    model: doc.model || "",
    provider: doc.provider || "",
    created_at: new Date(),
  });
}
