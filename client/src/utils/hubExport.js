import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function safeFilenameBase(s) {
  return String(s || "report")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "report";
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


export function formatExportLabels(exportAt) {
  const d = exportAt instanceof Date ? exportAt : new Date(exportAt);
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return formatExportLabels(n);
  }
  return {
    iso: d.toISOString(),
    dateLocal: d.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" }),
    timeLocal: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    fullLocal: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ellipsize(s, n) {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(1, n - 1))}…`;
}

export function markdownToPlain(md) {
  let t = String(md);
  t = t.replace(/```mermaid[\s\S]*?```/gi, "[Mermaid diagram omitted]\n");
  t = t.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[a-z0-9]*\s*/i, "").replace(/```$/i, "").trim();
    return inner ? `\n${inner}\n` : "";
  });
  t = t.replace(/^#{1,6}\s*(.+)$/gm, "$1\n");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^\s*[-*+]\s+/gm, "• ");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/\r\n/g, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const PDF_TRUNC = 4500;

function truncPdf(s) {
  const t = String(s ?? "");
  if (t.length <= PDF_TRUNC) return t;
  return `${t.slice(0, PDF_TRUNC)}\n\n[Truncated for PDF length.]`;
}


function drawPdfMissionHeader(pdf, exportAt, subtitleLeft) {
  const pageW = pdf.internal.pageSize.getWidth();
  const bannerH = 94;
  pdf.setFillColor(11, 18, 32);
  pdf.rect(0, 0, pageW, bannerH, "F");
  pdf.setFillColor(56, 189, 248);
  pdf.rect(0, bannerH - 3, pageW, 3, "F");
  const { dateLocal, fullLocal, iso } = formatExportLabels(exportAt);
  pdf.setTextColor(147, 197, 253);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("CYBER ALERT MISSION CONTROL", 44, 36);
  pdf.setTextColor(226, 232, 240);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const sub = String(subtitleLeft || "").toUpperCase();
  pdf.text(sub, 44, 54);
  pdf.setFont("helvetica", "bold");
  const dateStr = `DATE: ${dateLocal}`;
  const dw = pdf.getTextWidth(dateStr);
  pdf.text(dateStr, pageW - 44 - dw, 54);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Exported: ${fullLocal}`, 44, 70);
  pdf.text(`ISO: ${iso}`, 44, 82);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
}

class PdfTextWriter {
  constructor(pdf, options = {}) {
    this.pdf = pdf;
    this.margin = 44;
    this.pageW = pdf.internal.pageSize.getWidth();
    this.pageH = pdf.internal.pageSize.getHeight();
    this.maxW = this.pageW - this.margin * 2;
    this.lineStep = 12;
    this.y = typeof options.startY === "number" ? options.startY : this.margin;
  }

  ensureSpace(lines = 1) {
    if (this.y + this.lineStep * lines > this.pageH - this.margin) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }

  sectionTitle(text) {
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(11);
    this.pdf.setTextColor(30, 58, 138);
    const wrapped = this.pdf.splitTextToSize(String(text), this.maxW);
    for (const line of wrapped) {
      this.ensureSpace(1);
      this.pdf.text(line, this.margin, this.y);
      this.y += 14;
    }
    this.pdf.setDrawColor(56, 189, 248);
    this.pdf.setLineWidth(0.8);
    this.pdf.line(this.margin, this.y, this.pageW - this.margin, this.y);
    this.y += 10;
    this.pdf.setTextColor(15, 23, 42);
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
  }

  body(text) {
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(30, 41, 59);
    const paras = String(text).split(/\n\n+/);
    for (const para of paras) {
      const wrapped = this.pdf.splitTextToSize(para.trim() || " ", this.maxW);
      for (const line of wrapped) {
        this.ensureSpace(1);
        this.pdf.text(line, this.margin, this.y);
        this.y += this.lineStep;
      }
      this.y += 5;
    }
  }

  keyValue(label, value) {
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(71, 85, 105);
    const lab = `${label}:`;
    this.ensureSpace(1);
    this.pdf.text(lab, this.margin, this.y);
    const lw = this.pdf.getTextWidth(lab);
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setTextColor(15, 23, 42);
    const wrapped = this.pdf.splitTextToSize(String(value ?? "—"), this.maxW - lw - 8);
    this.pdf.text(wrapped[0] || "—", this.margin + lw + 6, this.y);
    this.y += this.lineStep;
    for (let i = 1; i < wrapped.length; i++) {
      this.ensureSpace(1);
      this.pdf.text(wrapped[i], this.margin + lw + 6, this.y);
      this.y += this.lineStep;
    }
    this.y += 2;
  }

  line(text) {
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(15, 23, 42);
    const wrapped = this.pdf.splitTextToSize(String(text), this.maxW);
    for (const ln of wrapped) {
      this.ensureSpace(1);
      this.pdf.text(ln, this.margin, this.y);
      this.y += this.lineStep;
    }
  }
}

function primaryDisclosureLines(row) {
  if (!row || typeof row !== "object") return [];
  const keys = [
    ["Target", "target"],
    ["Group", "group"],
    ["Country", "country"],
    ["Website", "website"],
    ["Discovered date", "discovered_date"],
    ["Updated", "updated_at"],
    ["Reason", "reason"],
    ["Attack details", "attack_details"],
    ["List summary", "list_summary"],
    ["Source URL", "source_url"],
  ];
  const out = [];
  for (const [label, k] of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    out.push([label, Array.isArray(v) ? v.join(", ") : String(v)]);
  }
  return out;
}

export function exportVictimHubPdf(payload, nameBase) {
  const exportAt = new Date(payload.generatedAt || Date.now());
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  drawPdfMissionHeader(pdf, exportAt, "Entity intelligence report — India region");
  const w = new PdfTextWriter(pdf, { startY: 108 });

  w.sectionTitle("Report identity");
  w.keyValue("Hub title", payload.hubTitle || "—");
  w.keyValue("Victim ID", payload.victimId || "—");
  if (payload.discoveryIst) w.keyValue("Discovered (IST)", payload.discoveryIst);
  if (payload.attack_estimated) w.keyValue("Est. attack", String(payload.attack_estimated).trim());

  w.sectionTitle("Primary disclosure (source index)");
  const pairs = primaryDisclosureLines(payload.row);
  if (pairs.length) {
    for (const [lab, val] of pairs) {
      w.keyValue(lab, truncPdf(val));
    }
  } else {
    w.line("—");
  }

  w.sectionTitle("Derived KPIs (cohort / focus)");
  if (payload.kpis) {
    w.keyValue("Total observed", String(payload.kpis.totalObserved ?? "—"));
    w.keyValue("Critical priority", String(payload.kpis.criticalPriority ?? "—"));
    w.keyValue("Targeted sectors (distinct)", String(payload.kpis.targetedSectors ?? "—"));
    w.keyValue("Active campaigns (groups)", String(payload.kpis.activeCampaigns ?? "—"));
  }

  w.sectionTitle("7-day velocity (IST, cohort)");
  if (Array.isArray(payload.velocity) && payload.velocity.length) {
    w.body(payload.velocity.map((v) => `${v.day}  →  ${v.count} incident(s)`).join("\n"));
  } else w.line("—");

  w.sectionTitle("Sector mix (full loaded index)");
  if (Array.isArray(payload.sectorLegendRows) && payload.sectorLegendRows.length) {
    w.body(
      payload.sectorLegendRows.map((s) => `${s.name.padEnd(22, " ")}  ${String(s.count).padStart(4)} rows   (${Number(s.pct).toFixed(1)}%)`).join("\n")
    );
  } else w.line("—");

  w.sectionTitle(`Attribution — ${payload.attributionScope || ""}`);
  if (Array.isArray(payload.attribution) && payload.attribution.length) {
    w.body(payload.attribution.map((a) => `${ellipsize(a.full || a.name, 48).padEnd(50, " ")}  ${a.count}`).join("\n"));
  } else w.line("—");

  w.sectionTitle("Cohort rows (same-organisation match, capped)");
  if (Array.isArray(payload.cohortRows) && payload.cohortRows.length) {
    w.body(
      payload.cohortRows
        .map(
          (c) =>
            `${ellipsize(c.victim_id, 18)}  |  ${ellipsize(c.target, 28)}  |  ${ellipsize(c.group, 14)}  |  ${ellipsize(c.sector, 12)}  |  ${c.discovered_date || "—"}`
        )
        .join("\n")
    );
  } else w.line("—");

  w.sectionTitle("Executive AI summary (plain text)");
  if (payload.summaryMd) {
    w.body(truncPdf(markdownToPlain(payload.summaryMd)));
  } else {
    w.line("No AI summary generated for this export.");
  }

  pdf.save(`${safeFilenameBase(nameBase)}-report.pdf`);
}

async function captureHtmlToJpeg(hostEl, filenameBase) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = await html2canvas(hostEl, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: hostEl.scrollWidth,
    windowHeight: hostEl.scrollHeight,
  });
  const url = canvas.toDataURL("image/jpeg", 0.92);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilenameBase(filenameBase)}-report.jpg`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function buildMissionHtmlHeader(exportAt, subtitle) {
  const { dateLocal, fullLocal, iso } = formatExportLabels(exportAt);
  return `
  <div style="background:linear-gradient(180deg,#0b1220 0%,#0f172a 100%);color:#e2e8f0;padding:22px 26px 18px;border-bottom:4px solid #38bdf8;font-family:system-ui,-apple-system,sans-serif">
    <div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#7dd3fc;line-height:1.2">CYBER ALERT MISSION CONTROL</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:12px;gap:16px;font-size:11px;text-transform:uppercase;letter-spacing:.06em">
      <div style="color:#cbd5e1;max-width:70%">${escapeHtml(subtitle)}</div>
      <div style="font-weight:800;color:#fff;white-space:nowrap">DATE: ${escapeHtml(dateLocal)}</div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:#94a3b8">Exported: ${escapeHtml(fullLocal)} · <span style="opacity:.9">${escapeHtml(iso)}</span></div>
  </div>`;
}

export async function exportVictimHubJpg(payload, nameBase) {
  const exportAt = new Date(payload.generatedAt || Date.now());
  const pairs = primaryDisclosureLines(payload.row);
  const discRows = pairs
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;width:28%;color:#475569">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;white-space:pre-wrap;color:#0f172a">${escapeHtml(ellipsize(v, 2000))}</td></tr>`
    )
    .join("");

  const kpiBlock = payload.kpis
    ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12px">${["Total observed", "Critical priority", "Targeted sectors", "Active campaigns"]
        .map((label, i) => {
          const val = [payload.kpis.totalObserved, payload.kpis.criticalPriority, payload.kpis.targetedSectors, payload.kpis.activeCampaigns][i];
          return `<tr><td style="padding:6px 0;color:#64748b;width:42%">${label}</td><td style="padding:6px 0;font-weight:800">${escapeHtml(String(val ?? "—"))}</td></tr>`;
        })
        .join("")}</table>`
    : "";

  const vel = Array.isArray(payload.velocity)
    ? payload.velocity.map((v) => `<tr><td style="padding:4px 8px">${escapeHtml(v.day)}</td><td style="padding:4px 8px;font-weight:700">${v.count}</td></tr>`).join("")
    : "";

  const sectors = Array.isArray(payload.sectorLegendRows)
    ? payload.sectorLegendRows
        .map(
          (s) =>
            `<tr><td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">${escapeHtml(s.name)}</td><td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">${s.count}</td><td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">${Number(s.pct).toFixed(1)}%</td></tr>`
        )
        .join("")
    : "";

  const attr = Array.isArray(payload.attribution)
    ? payload.attribution
        .map(
          (a) =>
            `<tr><td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">${escapeHtml(ellipsize(a.full || a.name, 56))}</td><td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;font-weight:700">${a.count}</td></tr>`
        )
        .join("")
    : "";

  const cohort = Array.isArray(payload.cohortRows)
    ? payload.cohortRows
        .slice(0, 60)
        .map(
          (c) =>
            `<tr><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:11px">${escapeHtml(ellipsize(c.victim_id, 22))}</td><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:11px">${escapeHtml(ellipsize(c.target, 28))}</td><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:11px">${escapeHtml(ellipsize(c.group, 16))}</td><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:11px">${escapeHtml(ellipsize(c.sector, 14))}</td><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:11px">${escapeHtml(String(c.discovered_date || "—"))}</td></tr>`
        )
        .join("")
    : "";

  const summaryHtml = payload.summaryMd
    ? `<div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:12px;white-space:pre-wrap;color:#0f172a">${escapeHtml(ellipsize(markdownToPlain(payload.summaryMd), 12000))}</div>`
    : `<p style="color:#64748b;font-size:12px">No AI summary for this export.</p>`;

  const inner = `
    ${buildMissionHtmlHeader(exportAt, "Entity intelligence report — India region")}
    <div style="padding:20px 26px 28px;background:#fff;color:#0f172a">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-bottom:16px;font-size:12px">
        <div><span style="color:#64748b;font-weight:700">HUB TITLE</span><div style="font-weight:800;margin-top:4px">${escapeHtml(payload.hubTitle || "—")}</div></div>
        <div><span style="color:#64748b;font-weight:700">VICTIM ID</span><div style="font-weight:800;margin-top:4px;word-break:break-all">${escapeHtml(String(payload.victimId || "—"))}</div></div>
        ${payload.discoveryIst ? `<div><span style="color:#64748b;font-weight:700">DISCOVERED (IST)</span><div style="margin-top:4px">${escapeHtml(payload.discoveryIst)}</div></div>` : ""}
      </div>
      <h3 style="margin:0 0 8px;font-size:13px;color:#1e40af;letter-spacing:.04em">PRIMARY DISCLOSURE</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">${discRows || `<tr><td colspan="2" style="padding:12px;color:#64748b">—</td></tr>`}</table>
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">DERIVED KPIs</h3>
      ${kpiBlock}
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">7-DAY VELOCITY (COHORT)</h3>
      <table style="width:240px;border-collapse:collapse;font-size:12px">${vel || `<tr><td colspan="2" style="padding:8px">—</td></tr>`}</table>
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">SECTOR MIX (FULL INDEX)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#1d4ed8;color:#fff"><th style="padding:6px 8px;text-align:left">Sector</th><th style="padding:6px 8px">Rows</th><th style="padding:6px 8px">%</th></tr></thead><tbody>${sectors || ""}</tbody></table>
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">ATTRIBUTION — ${escapeHtml(payload.attributionScope || "")}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#1d4ed8;color:#fff"><th style="padding:6px 8px;text-align:left">Group</th><th style="padding:6px 8px">Count</th></tr></thead><tbody>${attr || ""}</tbody></table>
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">COHORT (UP TO 60 ROWS)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#1e293b;color:#fff"><th style="padding:5px">ID</th><th style="padding:5px">Target</th><th style="padding:5px">Group</th><th style="padding:5px">Sector</th><th style="padding:5px">Date</th></tr></thead><tbody>${cohort || ""}</tbody></table>
      <h3 style="margin:18px 0 8px;font-size:13px;color:#1e40af">EXECUTIVE AI SUMMARY</h3>
      ${summaryHtml}
    </div>`;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:920px;background:#fff;box-shadow:0 0 0 1px #ccc;z-index:2147483646;";
  host.innerHTML = inner;
  document.body.appendChild(host);
  try {
    await captureHtmlToJpeg(host, nameBase);
  } finally {
    host.remove();
  }
}

const JPG_ROW_CAP = 200;

function intelTableTotalWidth(col) {
  return col.wDate + col.wEntity + col.wSector + col.wGroup + col.wStatus;
}

function drawIntelTableHeader(pdf, top, margin, col) {
  const rowH = 18;
  const tw = intelTableTotalWidth(col);
  pdf.setFillColor(29, 78, 216);
  pdf.rect(margin, top, tw, rowH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  let x = margin + 3;
  const baseline = top + 12;
  pdf.text("Date", x, baseline);
  x += col.wDate;
  pdf.text("Target entity", x, baseline);
  x += col.wEntity;
  pdf.text("Sector", x, baseline);
  x += col.wSector;
  pdf.text("Threat group", x, baseline);
  x += col.wGroup;
  pdf.text("Status", x, baseline);
  pdf.setTextColor(15, 23, 42);
  return top + rowH + 2;
}

function drawIntelTableRow(pdf, top, margin, col, r, zebra) {
  const rowH = 14;
  const tw = intelTableTotalWidth(col);
  if (zebra) {
    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, top, tw, rowH, "F");
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  let x = margin + 3;
  const baseline = top + 10;
  pdf.text(ellipsize(r.date, 12), x, baseline);
  x += col.wDate;
  pdf.text(ellipsize(r.entity, 36), x, baseline);
  x += col.wEntity;
  pdf.text(ellipsize(r.sector, 14), x, baseline);
  x += col.wSector;
  pdf.text(ellipsize(r.group, 20), x, baseline);
  x += col.wGroup;
  pdf.text(ellipsize(r.status, 16), x, baseline);
  return top + rowH;
}

export function exportIntelligenceTablePdf(meta, nameBase) {
  const exportAt = new Date(meta.generatedAt || Date.now());
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  drawPdfMissionHeader(pdf, exportAt, "Strategic intelligence report — India region");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 44;
  let top = 108;
  const usable = pageW - margin * 2;
  const wDate = 54;
  const wStatus = 72;
  const wGroup = 100;
  const wSector = 78;
  const wEntity = usable - wDate - wSector - wGroup - wStatus;
  const col = { wDate, wEntity, wSector, wGroup, wStatus };

  const paramH = meta.searchNote ? 62 : 50;
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(margin, top, usable, paramH, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text("REPORT PARAMETERS", margin + 10, top + 16);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Ransomware group: ${meta.filterGroupLabel || "All"}`, margin + 10, top + 30);
  pdf.text(`Target sector: ${meta.filterSectorLabel || "All"}`, margin + 10, top + 42);
  const rec = `Records found: ${meta.total ?? meta.rows?.length ?? 0}`;
  pdf.setFont("helvetica", "bold");
  pdf.text(rec, pageW - margin - 10 - pdf.getTextWidth(rec), top + 30);
  if (meta.searchNote) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Search: ${ellipsize(meta.searchNote, 100)}`, margin + 10, top + 54);
  }
  top += paramH + 8;

  const rows = meta.rows || [];
  top = drawIntelTableHeader(pdf, top, margin, col);
  for (let i = 0; i < rows.length; i++) {
    if (top + 16 > pageH - margin) {
      pdf.addPage();
      top = margin;
      top = drawIntelTableHeader(pdf, top, margin, col);
    }
    top = drawIntelTableRow(pdf, top, margin, col, rows[i], i % 2 === 1);
  }
  if (rows.length === 0) {
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(100, 116, 139);
    pdf.text("No rows match the current filters.", margin, top + 10);
  }

  pdf.save(`${safeFilenameBase(nameBase)}-report.pdf`);
}

export async function exportIntelligenceTableJpg(meta, nameBase) {
  const exportAt = new Date(meta.generatedAt || Date.now());
  const rows = (meta.rows || []).slice(0, JPG_ROW_CAP);
  const totalRows = meta.total ?? (meta.rows || []).length;
  const note =
    totalRows > JPG_ROW_CAP
      ? `<p style="margin:10px 0 0;font-size:11px;color:#b45309;font-weight:700">Showing first ${JPG_ROW_CAP} of ${totalRows} rows in this image. Export PDF for the full table.</p>`
      : "";

  const bodyRows = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"}"><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(String(r.date))}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:12px">${escapeHtml(r.entity)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(r.sector)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(r.group)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(r.status)}</td></tr>`
    )
    .join("");

  const inner = `
    ${buildMissionHtmlHeader(exportAt, "Strategic intelligence report — India region")}
    <div style="padding:20px 26px 28px;background:#fff">
      <div style="background:#f1f5f9;border-radius:10px;padding:16px 18px;margin-bottom:18px;font-family:system-ui,sans-serif">
        <div style="font-weight:800;font-size:11px;color:#1e3a8a;letter-spacing:.06em;margin-bottom:10px">REPORT PARAMETERS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;color:#334155">
          <div><span style="color:#64748b;font-weight:600">Ransomware group</span><div style="font-weight:700">${escapeHtml(meta.filterGroupLabel || "All")}</div></div>
          <div><span style="color:#64748b;font-weight:600">Target sector</span><div style="font-weight:700">${escapeHtml(meta.filterSectorLabel || "All")}</div></div>
          <div><span style="color:#64748b;font-weight:600">Records found</span><div style="font-weight:800;font-size:18px;color:#0f172a">${meta.total ?? rows.length}</div></div>
          ${meta.searchNote ? `<div style="grid-column:1/-1"><span style="color:#64748b;font-weight:600">Search</span><div>${escapeHtml(meta.searchNote)}</div></div>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#2563eb;color:#fff">
          <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:.05em">DATE</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px">TARGET ENTITY</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px">SECTOR</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px">THREAT GROUP</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px">STATUS</th>
        </tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="5" style="padding:16px;color:#64748b">No rows.</td></tr>`}</tbody>
      </table>
      ${note}
    </div>`;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:1000px;background:#fff;z-index:2147483646;box-shadow:0 0 0 1px #cbd5e1;";
  host.innerHTML = inner;
  document.body.appendChild(host);
  try {
    await captureHtmlToJpeg(host, nameBase);
  } finally {
    host.remove();
  }
}
