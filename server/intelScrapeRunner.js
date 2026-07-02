import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// spawn scraper/scrape_india.py --stdout-json-result (last line = JSON).
export function runScraperPipeline() {
  return new Promise((resolve, reject) => {
    const scraperDir = path.join(__dirname, "..", "scraper");
    const py = process.env.PYTHON || "python";
    const child = spawn(py, ["scrape_india.py", "--no-details", "--stdout-json-result"], {
      cwd: scraperDir,
      env: { ...process.env },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `scraper exited with code ${code}`));
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      try {
        const parsed = JSON.parse(last);
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        resolve({ items, stderr });
      } catch (e) {
        reject(
          new Error(
            `Could not parse scraper JSON (${e.message}). Stderr tail: ${stderr.slice(-800)}`
          )
        );
      }
    });
  });
}
