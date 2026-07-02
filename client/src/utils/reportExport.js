import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  PageBreak,
  ImageRun,
  BorderStyle,
  LineRuleType,
} from "docx";

/** Shared layout constants — PDF is source of truth; DOCX mirrors these exactly. */
const LAYOUT = {
  margin: 48,
  headerHeight: 72,
  headerTitleY: 40,
  bodyStartY: 96,
  bodyFontSize: 10,
  bodyLineHeight: 14,
  headerFontSize: 14,
  annexureTitleSize: 12,
  annexureSubtitleSize: 9,
  annexureBodySize: 10,
  headerTitle: "CYBER WATCH — Cyber Crime Complaint",
  headerBg: "0B1220",
  headerColor: "38BDF8",
  bodyColor: "1E1E1E",
  annexureTitleColor: "0B1220",
  annexureMutedColor: "505050",
  font: "Arial",
};

function cleanFilenamePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function resolveVictimName(victimName, summary) {
  const name = cleanFilenamePart(victimName || summary?.victim);
  if (!name) return "";
  if (/^(the complainant|not provided|unknown|—|-)$/i.test(name)) return "";
  return name;
}

export function buildComplaintDownloadFilename({ category, victimName, summary, extension }) {
  const fraudCategory = cleanFilenamePart(category || summary?.fraudType) || "Cyber Crime";
  const victim = resolveVictimName(victimName, summary);
  const ext = String(extension || "pdf").replace(/^\./, "");

  const base = victim
    ? `CyberWatch Complaint for ${fraudCategory} of ${victim}`
    : `CyberWatch Complaint for ${fraudCategory}`;

  return `${base}.${ext}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function ptToTwips(pt) {
  return Math.round(pt * 20);
}

function ptToPx(pt) {
  return Math.round(pt * (96 / 72));
}

function halfPoints(pt) {
  return Math.round(pt * 2);
}

async function prepareImageForExport(entry) {
  const file = entry?.file;
  if (!file || !file.type.startsWith("image/")) return null;

  let dataUrl;
  let format;

  if (file.type === "image/png") {
    dataUrl = await fileToDataUrl(file);
    format = "PNG";
  } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
    dataUrl = await fileToDataUrl(file);
    format = "JPEG";
  } else {
    const url = entry.preview || URL.createObjectURL(file);
    try {
      const img = await loadImageElement(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      format = "JPEG";
    } finally {
      if (!entry.preview) URL.revokeObjectURL(url);
    }
  }

  const img = await loadImageElement(dataUrl);
  return {
    dataUrl,
    format,
    width: img.naturalWidth,
    height: img.naturalHeight,
    name: entry.name || file.name,
  };
}

async function collectEvidenceForExport(evidenceFiles = []) {
  const images = [];
  const otherFiles = [];
  for (const entry of evidenceFiles) {
    const prepared = await prepareImageForExport(entry);
    if (prepared) images.push(prepared);
    else if (entry?.file || entry?.name) otherFiles.push(entry);
  }
  return { images, otherFiles };
}

function scaleToFit(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * ratio, height: height * ratio };
}

function imageMediaType(format) {
  return format === "PNG" ? "png" : "jpg";
}

function createPdfMeasurer() {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - LAYOUT.margin * 2;
  return { pdf, pageWidth, pageHeight, contentWidth };
}

/** Build layout once from PDF metrics — DOCX consumes the same structure. */
function buildSharedReportLayout(complaint, images, otherFiles) {
  const { pdf, pageWidth, pageHeight, contentWidth } = createPdfMeasurer();

  pdf.setFontSize(LAYOUT.bodyFontSize);
  const bodyLines = pdf.splitTextToSize(String(complaint || ""), contentWidth);

  const maxImageHeight = pageHeight - LAYOUT.margin * 2 - 20;
  const annexureImages = images.map((img, index) => {
    const { width, height } = scaleToFit(img.width, img.height, contentWidth, maxImageHeight);
    return {
      index: index + 1,
      name: img.name,
      dataUrl: img.dataUrl,
      format: img.format,
      widthPt: width,
      heightPt: height,
    };
  });

  return {
    pageWidth,
    pageHeight,
    contentWidth,
    bodyLines,
    annexureImages,
    otherFiles: otherFiles.map((f) => ({
      name: f.name || f.file?.name || "file",
      type: f.type || f.file?.type || "document",
    })),
  };
}

function ensureSpace(pdf, y, needed, margin) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin) {
    pdf.addPage();
    return margin;
  }
  return y;
}

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function bodyLineParagraph(text, { spacingBefore = 0 } = {}) {
  return new Paragraph({
    spacing: {
      before: spacingBefore,
      after: 0,
      line: ptToTwips(LAYOUT.bodyLineHeight),
      lineRule: LineRuleType.EXACT,
    },
    children: [
      new TextRun({
        text: text || " ",
        size: halfPoints(LAYOUT.bodyFontSize),
        color: LAYOUT.bodyColor,
        font: LAYOUT.font,
      }),
    ],
  });
}

function buildDocxFromLayout(layout) {
  const marginTwips = ptToTwips(LAYOUT.margin);
  const headerTopPad = ptToTwips(LAYOUT.headerTitleY - LAYOUT.headerFontSize);
  const headerBottomPad = ptToTwips(LAYOUT.headerHeight - LAYOUT.headerTitleY - 4);
  const bodyTopGap = ptToTwips(LAYOUT.bodyStartY - LAYOUT.headerHeight);

  const children = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: LAYOUT.headerBg, type: ShadingType.CLEAR, color: "auto" },
              margins: {
                top: headerTopPad,
                bottom: headerBottomPad,
                left: marginTwips,
                right: marginTwips,
              },
              borders: NO_BORDER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: LAYOUT.headerTitle,
                      bold: true,
                      size: halfPoints(LAYOUT.headerFontSize),
                      color: LAYOUT.headerColor,
                      font: LAYOUT.font,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];

  layout.bodyLines.forEach((line, i) => {
    children.push(bodyLineParagraph(line, { spacingBefore: i === 0 ? bodyTopGap : 0 }));
  });

  if (layout.annexureImages.length || layout.otherFiles.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));

    children.push(
      new Paragraph({
        spacing: { after: ptToTwips(22) },
        children: [
          new TextRun({
            text: "ANNEXURE — EVIDENCE ATTACHMENTS",
            bold: true,
            size: halfPoints(LAYOUT.annexureTitleSize),
            color: LAYOUT.annexureTitleColor,
            font: LAYOUT.font,
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: { after: ptToTwips(20) },
        children: [
          new TextRun({
            text: "The following screenshots and documents were submitted in support of this complaint.",
            size: halfPoints(LAYOUT.annexureSubtitleSize),
            color: LAYOUT.annexureMutedColor,
            font: LAYOUT.font,
          }),
        ],
      })
    );

    for (const img of layout.annexureImages) {
      children.push(
        new Paragraph({
          spacing: { after: ptToTwips(14) },
          children: [
            new TextRun({
              text: `Evidence ${img.index}: ${img.name}`,
              bold: true,
              size: halfPoints(LAYOUT.annexureBodySize),
              color: LAYOUT.bodyColor,
              font: LAYOUT.font,
            }),
          ],
        })
      );

      children.push(
        new Paragraph({
          spacing: { after: ptToTwips(24) },
          children: [
            new ImageRun({
              type: imageMediaType(img.format),
              data: dataUrlToBytes(img.dataUrl),
              transformation: {
                width: ptToPx(img.widthPt),
                height: ptToPx(img.heightPt),
              },
            }),
          ],
        })
      );
    }

    if (layout.otherFiles.length) {
      children.push(
        new Paragraph({
          spacing: { after: ptToTwips(16) },
          children: [
            new TextRun({
              text: "Additional files submitted:",
              bold: true,
              size: halfPoints(LAYOUT.annexureBodySize),
              color: LAYOUT.bodyColor,
              font: LAYOUT.font,
            }),
          ],
        })
      );

      for (const f of layout.otherFiles) {
        children.push(
          new Paragraph({
            spacing: { after: ptToTwips(14), line: ptToTwips(LAYOUT.bodyLineHeight), lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text: `• ${f.name} (${f.type})`,
                size: halfPoints(LAYOUT.annexureSubtitleSize),
                color: LAYOUT.annexureMutedColor,
                font: LAYOUT.font,
              }),
            ],
          })
        );
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 0, right: marginTwips, bottom: marginTwips, left: marginTwips },
          },
        },
        children,
      },
    ],
  });
}

function renderPdf(layout) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = LAYOUT.margin;
  const pageWidth = layout.pageWidth;
  let y = margin;

  pdf.setFillColor(11, 18, 32);
  pdf.rect(0, 0, pageWidth, LAYOUT.headerHeight, "F");
  pdf.setTextColor(56, 189, 248);
  pdf.setFontSize(LAYOUT.headerFontSize);
  pdf.text(LAYOUT.headerTitle, margin, LAYOUT.headerTitleY);
  pdf.setTextColor(30, 30, 30);
  y = LAYOUT.bodyStartY;

  pdf.setFontSize(LAYOUT.bodyFontSize);
  for (const line of layout.bodyLines) {
    y = ensureSpace(pdf, y, LAYOUT.bodyLineHeight, margin);
    pdf.text(line, margin, y);
    y += LAYOUT.bodyLineHeight;
  }

  if (layout.annexureImages.length || layout.otherFiles.length) {
    y = ensureSpace(pdf, y, 40, margin);
    y += 24;
    pdf.addPage();
    y = margin;
    pdf.setFontSize(LAYOUT.annexureTitleSize);
    pdf.setTextColor(11, 18, 32);
    pdf.text("ANNEXURE — EVIDENCE ATTACHMENTS", margin, y);
    y += 22;
    pdf.setFontSize(LAYOUT.annexureSubtitleSize);
    pdf.setTextColor(80, 80, 80);
    pdf.text(
      "The following screenshots and documents were submitted in support of this complaint.",
      margin,
      y
    );
    y += 20;

    for (const img of layout.annexureImages) {
      y = ensureSpace(pdf, y, 30, margin);
      pdf.setFontSize(LAYOUT.annexureBodySize);
      pdf.setTextColor(30, 30, 30);
      pdf.text(`Evidence ${img.index}: ${img.name}`, margin, y);
      y += 14;

      y = ensureSpace(pdf, y, img.heightPt + 16, margin);
      pdf.addImage(img.dataUrl, img.format, margin, y, img.widthPt, img.heightPt);
      y += img.heightPt + 24;
    }

    if (layout.otherFiles.length) {
      y = ensureSpace(pdf, y, 20, margin);
      pdf.setFontSize(LAYOUT.annexureBodySize);
      pdf.setTextColor(30, 30, 30);
      pdf.text("Additional files submitted:", margin, y);
      y += 16;
      pdf.setFontSize(LAYOUT.annexureSubtitleSize);
      for (const f of layout.otherFiles) {
        y = ensureSpace(pdf, y, LAYOUT.bodyLineHeight, margin);
        pdf.text(`• ${f.name} (${f.type})`, margin, y);
        y += LAYOUT.bodyLineHeight;
      }
    }
  }

  return pdf;
}

export async function downloadReportPdf({ complaint, summary, category, victimName, evidenceFiles = [] }) {
  const { images, otherFiles } = await collectEvidenceForExport(evidenceFiles);
  const layout = buildSharedReportLayout(complaint, images, otherFiles);
  const pdf = renderPdf(layout);
  pdf.save(
    buildComplaintDownloadFilename({ category, victimName, summary, extension: "pdf" })
  );
}

export async function downloadReportDocx({ complaint, summary, category, victimName, evidenceFiles = [] }) {
  const { images, otherFiles } = await collectEvidenceForExport(evidenceFiles);
  const layout = buildSharedReportLayout(complaint, images, otherFiles);
  const doc = buildDocxFromLayout(layout);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildComplaintDownloadFilename({ category, victimName, summary, extension: "docx" });
  a.click();
  URL.revokeObjectURL(url);
}
