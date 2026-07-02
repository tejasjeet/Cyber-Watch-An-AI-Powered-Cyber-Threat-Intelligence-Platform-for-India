/**
 * Downloads Natural Earth 50m admin-1 (110m geojson in repo is a tiny subset).
 * Keeps India (IND) only → public/geo/india-states.geojson for Leaflet + /api/geo/india-states.
 * Run: npm run prepare:geo   (from client/)
 */
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "geo");
const outFile = path.join(outDir, "india-states.geojson");

const URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "cyber-watch-geo-prepare/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error("Redirect without location"));
          return resolve(fetchText(loc.startsWith("http") ? loc : new URL(loc, url).href));
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log("Fetching:", URL);
  const text = await fetchText(URL);
  const j = JSON.parse(text);
  const all = j.features || [];
  const ind = all.filter((f) => f.properties?.adm0_a3 === "IND");
  if (!ind.length) throw new Error("No India (IND) features found in Natural Earth dataset");
  const out = { type: "FeatureCollection", name: "india-states", features: ind };
  fs.writeFileSync(outFile, JSON.stringify(out), "utf8");
  console.log("Wrote", outFile, `(${ind.length} state polygons)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
