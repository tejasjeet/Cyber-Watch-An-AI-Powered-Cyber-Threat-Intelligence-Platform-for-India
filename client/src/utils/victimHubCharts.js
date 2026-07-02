import { ALL_SECTOR_LABELS, inferSector, parseRowDiscoveryTime, parseRowTime, pickFeedStatus, safeHostname } from "./insights.js";
import { formatDateKeyIST, istDateKeysLastNDays } from "./datetimeIST.js";

export function companySeedForHub(row, urlParam) {
  const h = safeHostname(row?.website);
  if (h) {
    const parts = h.replace(/^www\./, "").split(".");
    if (parts.length >= 2) return parts[0].toLowerCase();
    return (parts[0] || "").toLowerCase();
  }
  const raw = decodeURIComponent(urlParam || "").trim().toLowerCase();
  if (raw && raw.length < 80 && !/^[\da-f-]{24,}$/i.test(raw)) {
    return raw.split(/[/\\]/)[0].replace(/[^a-z0-9-]/g, "") || raw.slice(0, 40);
  }
  return String(row?.target || "entity")
    .toLowerCase()
    .replace(/[^\w.-]/g, " ")
    .trim()
    .split(/\s+/)[0];
}

export function cohortForHub(items, seed) {
  if (!seed || seed.length < 2) return [];
  const s = seed.toLowerCase();
  return items.filter((i) => {
    const h = (safeHostname(i.website) || "").toLowerCase();
    const t = (i.target || "").toLowerCase();
    if (!h && !t) return false;
    return h.includes(s) || t.includes(s) || h.split(".")[0] === s;
  });
}

export function hubKpis(cohort, focusRow) {
  const list = cohort.length ? cohort : focusRow ? [focusRow] : [];
  const critical = list.filter((r) => pickFeedStatus(r) === "CRITICAL").length;
  const sectors = new Set(list.map((r) => inferSector(r)));
  const groups = new Set(list.map((r) => r.group).filter(Boolean));
  return {
    totalObserved: list.length,
    criticalPriority: critical,
    targetedSectors: sectors.size,
    activeCampaigns: Math.max(groups.size, focusRow?.group ? 1 : 0),
  };
}

export function velocity7dForCohort(cohort) {
  const keys = istDateKeysLastNDays(7);
  const days = [];
  for (const key of keys) {
    let c = 0;
    for (const row of cohort) {
      const ts = parseRowDiscoveryTime(row) ?? parseRowTime(row);
      if (ts == null) continue;
      if (formatDateKeyIST(ts) === key) c += 1;
    }
    days.push({ day: key, count: c });
  }
  return days;
}

export function sectorPieData(cohort) {
  const m = new Map(ALL_SECTOR_LABELS.map((name) => [name, 0]));
  for (const row of cohort) {
    const s = inferSector(row);
    if (m.has(s)) m.set(s, (m.get(s) || 0) + 1);
    else m.set("Other", (m.get("Other") || 0) + 1);
  }
  return ALL_SECTOR_LABELS.map((name) => ({ name, value: m.get(name) || 0 }));
}

export function sectorIndexPieSlices(items) {
  const counts = sectorPieData(items);
  const tot = counts.reduce((a, x) => a + x.value, 0);
  if (tot === 0) return [];
  return counts
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .map((x) => ({
      name: x.name,
      count: x.value,
      value: Math.round((10000 * x.value) / tot) / 100,
    }));
}

export function sectorIndexLegendRows(items) {
  const counts = sectorPieData(items);
  const byName = new Map(counts.map((c) => [c.name, c.value]));
  const tot = counts.reduce((a, x) => a + x.value, 0);
  return ALL_SECTOR_LABELS.map((name) => {
    const count = byName.get(name) ?? 0;
    const pct = tot === 0 ? 0 : Math.round((10000 * count) / tot) / 100;
    return { name, count, pct };
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function attributionBars(items, limit = 8) {
  const m = new Map();
  for (const row of items) {
    const g = row.group || "Unknown";
    m.set(g, (m.get(g) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, count]) => ({
      name: name.length > 24 ? `${name.slice(0, 22)}…` : name,
      count,
      full: name,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
