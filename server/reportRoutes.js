import jwt from "jsonwebtoken";
import { generateCyberReport, computeReadiness } from "./reportGenerate.js";

const CATEGORY_LABELS = {
  "upi-fraud": "UPI Fraud",
  "card-fraud": "Credit/Debit Card Fraud",
  "internet-banking": "Internet Banking Fraud",
  "fake-job": "Fake Job Scam",
  "investment-scam": "Investment Scam",
  "instagram-hacked": "Instagram Account Hacked",
  "whatsapp-scam": "WhatsApp Scam",
  "facebook-scam": "Facebook Scam",
  "email-phishing": "Email Phishing",
  "fake-shopping": "Fake Shopping Website",
  "identity-theft": "Identity Theft",
  "cyber-bullying": "Cyber Bullying",
  sextortion: "Online Blackmail / Sextortion",
  other: "Other",
};

function bearerToken(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

function authUserId(req, jwtSecret) {
  const raw = bearerToken(req);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, jwtSecret);
    return payload.sub || null;
  } catch {
    return null;
  }
}

/**
 * @param {import("express").Express} app
 * @param {{ jwtSecret: string; googleAiKey: string; googleAiModel: string }} opts
 */
export function mountReportRoutes(app, opts) {
  const { jwtSecret, googleAiKey, googleAiModel } = opts;

  app.post("/api/report/generate", async (req, res) => {
    const userId = authUserId(req, jwtSecret);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", hint: "Sign in to generate a complaint report." });
    }

    const { category, answers, location, attachments, questions, victimQuestions } = req.body || {};
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "Expected JSON body with category, answers, location, attachments" });
    }
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers object is required" });
    }

    const safeLocation = location && typeof location === "object" ? location : {};
    const safeAttachments = Array.isArray(attachments)
      ? attachments.slice(0, 20).map((a) => ({
          name: String(a?.name || "file").slice(0, 200),
          type: String(a?.type || "application/octet-stream").slice(0, 120),
          size: Number(a?.size) || 0,
        }))
      : [];

    const readiness = computeReadiness({
      questions: Array.isArray(questions) ? questions : [],
      victimQuestions: Array.isArray(victimQuestions) ? victimQuestions : [],
      answers,
      attachments: safeAttachments,
      location: safeLocation,
    });
    if (!readiness.ok) {
      return res.status(400).json({
        error: "Mandatory details are incomplete.",
        missing: readiness.missing,
        hint: `Please complete: ${readiness.missing.join("; ")}`,
      });
    }

    const categoryLabel = CATEGORY_LABELS[category] || String(category);

    try {
      const result = await generateCyberReport({
        category,
        categoryLabel,
        categoryId: category,
        answers,
        location: safeLocation,
        attachments: safeAttachments,
        questions: Array.isArray(questions) ? questions : [],
        victimQuestions: Array.isArray(victimQuestions) ? victimQuestions : [],
        googleAiKey,
        googleAiModel,
      });
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Report generation failed" });
    }
  });
}
