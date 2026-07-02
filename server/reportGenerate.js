import { geminiGenerateMarkdown } from "./aiProviders.js";

function pickStr(obj, key) {
  const v = obj?.[key];
  return v == null || v === "" ? "" : String(v).trim();
}

function isValidName(value) {
  const t = String(value ?? "").trim();
  return t.length >= 2 && /^[a-zA-Z\s.'-]+$/.test(t);
}

function normalizeIndianPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function isValidPhone(value) {
  const digits = normalizeIndianPhone(value);
  return digits.length === 10;
}

function isNoAmountAnswer(value) {
  const t = String(value ?? "").trim();
  if (!t) return false;
  return /^(no|nope|none|nil|na|n\/a|not applicable|nothing|zero|no loss|no financial loss|didn't lose|did not lose|lost nothing|0)$/i.test(t);
}

function isValidAmount(value, required) {
  const t = String(value ?? "").trim();
  if (!t) return !required;
  if (!required && isNoAmountAnswer(t)) return true;
  const cleaned = t.replace(/[,₹\s]/g, "");
  if (!required && cleaned === "0") return true;
  return /^\d+(\.\d{1,2})?$/.test(cleaned);
}

function isValidAge(value) {
  const t = String(value ?? "").trim();
  if (!/^\d+$/.test(t)) return false;
  const n = Number(t);
  return n >= 1 && n <= 120;
}

function isValidDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (["today", "yesterday", "day before yesterday"].includes(lower)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return !Number.isNaN(Date.parse(`${raw}T12:00:00`));
  const normalized = raw
    .toLowerCase()
    .replace(/^on\s+/i, "")
    .replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, " ");
  if (/^\d{1,2}\s+[a-z]+\s+\d{4}$/i.test(normalized)) return true;
  if (/^[a-z]+\s+\d{1,2}\s+\d{4}$/i.test(normalized)) return true;
  if (/^\d{1,2}(?:\s+of)?\s+this\s+month$/i.test(normalized)) return true;
  return !Number.isNaN(Date.parse(normalized));
}

function isValidDescription(value) {
  const t = String(value ?? "").trim();
  return t.length >= 20 && /[a-zA-Z]{3,}/.test(t);
}

function inferType(key) {
  if (key === "victimName") return "name";
  if (key === "victimPhone") return "phone";
  if (key === "victimAge") return "age";
  if (key === "incidentDate") return "date";
  if (key === "amountLost") return "amount";
  if (key === "description") return "description";
  return "text";
}

function fieldValid(type, value, required) {
  switch (type) {
    case "name":
      return isValidName(value);
    case "phone":
      return value ? isValidPhone(value) : !required;
    case "age":
      return isValidAge(value);
    case "date":
      return isValidDate(value);
    case "amount":
      return isValidAmount(value, required);
    case "description":
      return isValidDescription(value);
    default: {
      const t = String(value ?? "").trim();
      return t ? true : !required;
    }
  }
}

const DEFAULT_VICTIM_QUESTIONS = [
  { key: "victimName", label: "Victim full name", required: true, type: "name" },
  { key: "victimPhone", label: "Victim contact number", required: true, type: "phone" },
  { key: "victimAge", label: "Victim age", required: true, type: "age" },
];

function computeReadiness({ questions = [], victimQuestions = [], answers = {}, attachments = [], location = {} }) {
  const completed = [];
  const missing = [];

  const victims = victimQuestions.length ? victimQuestions : DEFAULT_VICTIM_QUESTIONS;
  for (const q of victims) {
    const type = q.type || inferType(q.key);
    const val = pickStr(answers, q.key);
    if (fieldValid(type, val, q.required !== false)) {
      completed.push(q.label || q.key);
    } else {
      missing.push(q.label || q.key);
    }
  }

  for (const q of questions) {
    const type = q.type || inferType(q.key);
    const val = pickStr(answers, q.key);
    if (!q.required) {
      if (val) completed.push(q.label.replace(/\?$/, ""));
      continue;
    }
    if (fieldValid(type, val, true)) {
      completed.push(q.label.replace(/\?$/, ""));
    } else {
      missing.push(q.label.replace(/\?$/, ""));
    }
  }

  if (pickStr(location, "state")) completed.push("State");
  else missing.push("State");
  if (pickStr(location, "city")) completed.push("City");
  else missing.push("City");

  const hasEvidence = Array.isArray(attachments) && attachments.length > 0;
  if (hasEvidence) completed.push("Evidence attachments");
  else missing.push("Evidence attachments");

  const total = completed.length + missing.length;
  const readinessScore = total ? Math.round((completed.length / total) * 100) : 0;

  return { readinessScore, completed, missing, ok: missing.length === 0 };
}

function buildTimeline(answers, categoryLabel) {
  const events = [];
  const date = pickStr(answers, "incidentDate");
  const time = pickStr(answers, "incidentTime");
  if (date) {
    events.push({
      date: time ? `${date} ${time}` : date,
      title: "Incident occurred",
      detail: pickStr(answers, "description") || `${categoryLabel} reported.`,
    });
  }
  if (pickStr(answers, "amountLost")) {
    events.push({
      date: date || "Unknown date",
      title: "Financial loss recorded",
      detail: `Amount: INR ${pickStr(answers, "amountLost")}`,
    });
  }
  if (pickStr(answers, "recoveryAttempts")) {
    events.push({
      date: date || "After incident",
      title: "Recovery attempts",
      detail: pickStr(answers, "recoveryAttempts"),
    });
  }
  if (!events.length) {
    events.push({
      date: new Date().toISOString().slice(0, 10),
      title: "Report prepared",
      detail: "Incident details collected via CyberWatch AI assistant.",
    });
  }
  return events;
}

function buildFallbackReport({ categoryLabel, answers, location, attachments }) {
  const city = location?.city || "____________";
  const state = location?.state || "____________";
  const country = location?.country || "India";
  const victimName = pickStr(answers, "victimName") || "The Complainant";
  const victimPhone = pickStr(answers, "victimPhone");
  const victimAge = pickStr(answers, "victimAge");
  const amount = pickStr(answers, "amountLost");
  const date = pickStr(answers, "incidentDate") || "____________";
  const description = pickStr(answers, "description") || "As described below.";
  const evidenceList =
    Array.isArray(attachments) && attachments.length
      ? attachments.map((a) => a.name).join(", ")
      : "None attached yet";

  const complaint = `To,
The Station House Officer / Cyber Crime Cell,
${city}, ${state}, ${country}

Subject: Complaint regarding ${categoryLabel}

Respected Sir/Madam,

I, ${victimName}${victimAge ? `, aged ${victimAge} years` : ""}, wish to lodge a formal complaint regarding a ${categoryLabel} incident that occurred on or around ${date}.
${victimPhone ? `\nContact number: ${victimPhone}.\n` : ""}
${description}

${amount ? `Financial loss reported: INR ${amount}.\n` : ""}${pickStr(answers, "transactionId") ? `Transaction reference: ${pickStr(answers, "transactionId")}.\n` : ""}${pickStr(answers, "fraudsterPhone") ? `Suspect contact: ${pickStr(answers, "fraudsterPhone")}.\n` : ""}${pickStr(answers, "fraudsterUpiId") ? `Suspect UPI ID: ${pickStr(answers, "fraudsterUpiId")}.\n` : ""}
Evidence attached / available: ${evidenceList}.

I request that appropriate action be taken under applicable IT Act and IPC provisions and that my complaint be registered with the Cyber Crime Portal.

Thanking you,

${victimName}
${city}, ${state}`;

  const summary = {
    victim: victimName,
    contact: victimPhone || "Not provided",
    age: victimAge || "Not provided",
    fraudType: categoryLabel,
    amountLost: amount || "Not specified",
    date,
    evidenceAttached: evidenceList,
    suspectDetails:
      [
        pickStr(answers, "fraudsterPhone") && `Phone: ${pickStr(answers, "fraudsterPhone")}`,
        pickStr(answers, "fraudsterUpiId") && `UPI: ${pickStr(answers, "fraudsterUpiId")}`,
        pickStr(answers, "fraudsterContact") && `Contact: ${pickStr(answers, "fraudsterContact")}`,
        pickStr(answers, "senderEmail") && `Email: ${pickStr(answers, "senderEmail")}`,
        pickStr(answers, "contactNumbers") && `Numbers: ${pickStr(answers, "contactNumbers")}`,
      ]
        .filter(Boolean)
        .join("; ") || "Not provided",
  };

  const recommendations = [
    "Preserve all screenshots, chats, and transaction records — do not delete evidence.",
    amount ? "Contact your bank immediately to block accounts and dispute unauthorized transactions." : null,
    "File a complaint on the National Cyber Crime Portal (cybercrime.gov.in).",
    "Obtain an acknowledgment / FIR reference number from the local Cyber Crime Cell.",
    pickStr(answers, "fraudsterPhone") ? "Share suspect phone numbers with authorities and your bank fraud desk." : null,
    "Do not engage further with the fraudster or pay additional money.",
  ].filter(Boolean);

  const readiness = computeReadiness({ questions: [], answers, attachments, location });

  return {
    complaint,
    summary,
    timeline: buildTimeline(answers, categoryLabel),
    recommendations,
    readinessScore: readiness.readinessScore,
    readinessChecklist: { completed: readiness.completed, missing: readiness.missing },
  };
}

async function buildAiReport({ categoryLabel, categoryId, answers, location, attachments, googleAiKey, googleAiModel }) {
  const system = `You are CyberWatch AI, a professional cyber crime reporting assistant for India.
Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "complaint": "string — formal letter to local Cyber Crime Cell",
  "summary": {
    "victim": "string",
    "contact": "string",
    "age": "string",
    "fraudType": "string",
    "amountLost": "string",
    "date": "string",
    "evidenceAttached": "string",
    "suspectDetails": "string"
  },
  "timeline": [{ "date": "string", "title": "string", "detail": "string" }],
  "recommendations": ["string"],
  "readinessScore": number,
  "readinessChecklist": { "completed": ["string"], "missing": ["string"] }
}
Use the victim's city/state for the addressee. Be factual — only use provided answers. Professional tone.`;

  const user = JSON.stringify(
    {
      category: categoryLabel,
      categoryId,
      answers,
      location,
      attachments: (attachments || []).map((a) => ({ name: a.name, type: a.type, size: a.size })),
    },
    null,
    2
  );

  const raw = await geminiGenerateMarkdown({
    apiKey: googleAiKey,
    model: googleAiModel,
    systemPrompt: system,
    userPrompt: user,
    signal: AbortSignal.timeout(120_000),
  });

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.complaint || !parsed.summary) throw new Error("Invalid AI report shape");
  return parsed;
}

/**
 * @param {{ category: string, categoryId?: string, categoryLabel?: string, answers: Record<string, string>, location: object, attachments: object[], googleAiKey?: string, googleAiModel?: string, questions?: object[], victimQuestions?: object[] }} input
 */
export async function generateCyberReport(input) {
  const categoryLabel = input.categoryLabel || input.category || "Cyber Crime";
  const fallback = buildFallbackReport({
    categoryLabel,
    answers: input.answers || {},
    location: input.location || {},
    attachments: input.attachments || [],
  });

  const readiness = computeReadiness({
    questions: input.questions || [],
    victimQuestions: input.victimQuestions || DEFAULT_VICTIM_QUESTIONS,
    answers: input.answers || {},
    attachments: input.attachments || [],
    location: input.location || {},
  });
  fallback.readinessScore = readiness.readinessScore;
  fallback.readinessChecklist = { completed: readiness.completed, missing: readiness.missing };
  if (fallback.summary) {
    fallback.summary.contact = fallback.summary.contact || pickStr(input.answers, "victimPhone") || "Not provided";
    fallback.summary.age = fallback.summary.age || pickStr(input.answers, "victimAge") || "Not provided";
  }

  if (!input.googleAiKey) return fallback;

  try {
    const ai = await buildAiReport({
      categoryLabel,
      categoryId: input.categoryId,
      answers: input.answers || {},
      location: input.location || {},
      attachments: input.attachments || [],
      googleAiKey: input.googleAiKey,
      googleAiModel: input.googleAiModel,
    });
    ai.readinessScore = readiness.readinessScore;
    ai.readinessChecklist = readiness.readinessChecklist;
    if (!ai.summary?.contact) ai.summary = { ...ai.summary, contact: pickStr(input.answers, "victimPhone") || "Not provided" };
    if (!ai.summary?.age) ai.summary = { ...ai.summary, age: pickStr(input.answers, "victimAge") || "Not provided" };
    if (!Array.isArray(ai.timeline) || !ai.timeline.length) ai.timeline = fallback.timeline;
    if (!Array.isArray(ai.recommendations) || !ai.recommendations.length) {
      ai.recommendations = fallback.recommendations;
    }
    return ai;
  } catch (e) {
    console.warn("generateCyberReport AI fallback:", e?.message || e);
    return fallback;
  }
}

export { computeReadiness };
