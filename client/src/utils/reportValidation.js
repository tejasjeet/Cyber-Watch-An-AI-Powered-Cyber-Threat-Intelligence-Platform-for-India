/** Field validators for Cyber Crime Reporting Assistant */

import { resolveBankName } from "../data/indianBanks.js";

const VAGUE_ANSWERS =
  /^(don't know|dont know|do not know|unknown|not sure|not applicable|na|n\/a|none|no idea|idk|skip|nil|-)$/i;

export function validateVictimName(value) {
  const t = String(value ?? "").trim();
  if (!t) return { ok: false, error: "Please enter a valid name." };
  if (!/^[a-zA-Z\s.'-]+$/.test(t)) {
    return { ok: false, error: "Please enter a valid name (letters only, no numbers or symbols)." };
  }
  if (t.length < 2) return { ok: false, error: "Name must be at least 2 characters." };
  return { ok: true, value: t.replace(/\s+/g, " ") };
}

export function normalizeIndianPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function validateContactPhone(value, { required = true } = {}) {
  const digits = normalizeIndianPhone(value);
  if (!digits) {
    return required
      ? { ok: false, error: "Please enter a valid 10-digit mobile number." }
      : { ok: true, value: "" };
  }
  if (digits.length !== 10) {
    return { ok: false, error: "Indian mobile numbers must be exactly 10 digits." };
  }
  return { ok: true, value: digits };
}

export function validateAge(value) {
  const t = String(value ?? "").trim();
  if (!/^\d+$/.test(t)) return { ok: false, error: "Please enter a valid age (numbers only)." };
  const n = Number(t);
  if (n < 1 || n > 120) return { ok: false, error: "Please enter a reasonable age (1–120)." };
  return { ok: true, value: String(n) };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatIso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function stripOrdinals(text) {
  return String(text).replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1");
}

function normalizeDateText(raw) {
  return stripOrdinals(
    String(raw)
      .toLowerCase()
      .trim()
      .replace(/^on\s+/i, "")
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
  );
}

function buildDateAtNoon(year, month, day) {
  const d = new Date(year, month, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function parseFlexibleDate(raw, today) {
  const text = normalizeDateText(raw);

  const thisMonth = text.match(/^(\d{1,2})(?:\s+of)?\s+this\s+month$/);
  if (thisMonth) {
    return buildDateAtNoon(today.getFullYear(), today.getMonth(), Number(thisMonth[1]));
  }

  const lastMonth = text.match(/^(\d{1,2})(?:\s+of)?\s+last\s+month$/);
  if (lastMonth) {
    return buildDateAtNoon(today.getFullYear(), today.getMonth() - 1, Number(lastMonth[1]));
  }

  const dmy = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (dmy && MONTHS[dmy[2]] !== undefined) {
    return buildDateAtNoon(Number(dmy[3]), MONTHS[dmy[2]], Number(dmy[1]));
  }

  const mdy = text.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (mdy && MONTHS[mdy[1]] !== undefined) {
    return buildDateAtNoon(Number(mdy[3]), MONTHS[mdy[1]], Number(mdy[2]));
  }

  const dm = text.match(/^(\d{1,2})\s+([a-z]+)$/);
  if (dm && MONTHS[dm[2]] !== undefined) {
    return buildDateAtNoon(today.getFullYear(), MONTHS[dm[2]], Number(dm[1]));
  }

  const md = text.match(/^([a-z]+)\s+(\d{1,2})$/);
  if (md && MONTHS[md[1]] !== undefined) {
    return buildDateAtNoon(today.getFullYear(), MONTHS[md[1]], Number(md[2]));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return buildDateAtNoon(y, m - 1, d);
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [a, b, c] = text.split(/[/-]/).map(Number);
    return buildDateAtNoon(c, b - 1, a);
  }

  const parsed = Date.parse(stripOrdinals(raw.replace(/,/g, " ")));
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  return null;
}

export function parseIncidentDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, error: "Please enter a valid date of incident." };

  const lower = raw.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === "today") return { ok: true, value: formatIso(today), display: raw };
  if (lower === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { ok: true, value: formatIso(d), display: raw };
  }
  if (lower === "day before yesterday" || lower === "day before yesterday.") {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return { ok: true, value: formatIso(d), display: raw };
  }

  const d = parseFlexibleDate(raw, today);

  if (!d || Number.isNaN(d.getTime())) {
    return {
      ok: false,
      error: "Please enter a recognizable date (e.g. 28 June 2026, 28th of this month, today, or 15/06/2026).",
    };
  }

  const iso = formatIso(d);
  const year = d.getFullYear();
  if (year < 1990 || year > today.getFullYear() + 1) {
    return { ok: false, error: "Please enter a reasonable incident date." };
  }
  return { ok: true, value: iso, display: raw };
}

const NO_AMOUNT_ANSWERS =
  /^(no|nope|none|nil|na|n\/a|not applicable|nothing|zero|no loss|no financial loss|didn't lose|did not lose|lost nothing|0)$/i;

export function validateAmount(value, { required = true } = {}) {
  const t = String(value ?? "").trim();
  if (!t) {
    return required ? { ok: false, error: "Please enter a valid amount (numbers only)." } : { ok: true, value: "" };
  }
  if (!required && NO_AMOUNT_ANSWERS.test(t)) {
    return { ok: true, value: "0", display: "No financial loss" };
  }
  const cleaned = t.replace(/[,₹\s]/g, "");
  if (!required && cleaned === "0") {
    return { ok: true, value: "0", display: "No financial loss" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return {
      ok: false,
      error: required
        ? "Please enter a valid amount (numbers only, e.g. 5000)."
        : "Enter an amount in numbers, or type “no” if there was no financial loss.",
    };
  }
  return { ok: true, value: cleaned };
}

export function validateDescription(value) {
  const t = String(value ?? "").trim();
  if (t.length < 20) {
    return { ok: false, error: "Description must be at least 20 characters of meaningful text." };
  }
  if (!/[a-zA-Z]{3,}/.test(t)) {
    return { ok: false, error: "Please provide a meaningful description in words." };
  }
  return { ok: true, value: t };
}

export function validateBankName(value, { required = true } = {}) {
  const t = String(value ?? "").trim();
  if (!t) {
    return required
      ? { ok: false, error: "Please enter the bank name linked to your account." }
      : { ok: true, value: "" };
  }
  if (VAGUE_ANSWERS.test(t)) {
    return { ok: false, error: "Please enter a valid bank name (e.g. State Bank of India, HDFC Bank)." };
  }
  const resolved = resolveBankName(t);
  if (!resolved) {
    return {
      ok: false,
      error: "Please enter a recognized Indian bank name (e.g. SBI, HDFC Bank, ICICI Bank, Axis Bank).",
    };
  }
  return { ok: true, value: resolved };
}

export function validateUpiId(value, { required = false } = {}) {
  const t = String(value ?? "").trim();
  if (!t) {
    return required
      ? { ok: false, error: "Please enter a valid UPI ID." }
      : { ok: true, value: "" };
  }
  if (VAGUE_ANSWERS.test(t)) {
    return { ok: false, error: "Please enter a valid UPI ID (format: name@bank, e.g. yourname@okaxis)." };
  }
  const lower = t.toLowerCase();
  if (!/^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/.test(lower)) {
    return {
      ok: false,
      error: "Please enter a valid UPI ID (format: name@bankname, e.g. 9876543210@ybl or name@okaxis).",
    };
  }
  return { ok: true, value: lower };
}

export function validateTransactionId(value, { required = true } = {}) {
  const t = String(value ?? "").trim();
  if (!t) {
    return required
      ? { ok: false, error: "Please enter the UPI / transaction reference number." }
      : { ok: true, value: "" };
  }
  if (VAGUE_ANSWERS.test(t)) {
    return { ok: false, error: "Please enter a valid UPI / UTR reference number." };
  }

  const parts = t.split(/[,;\s]+/).filter(Boolean);
  const normalized = [];

  for (const part of parts) {
    const cleaned = part.replace(/\s/g, "").toUpperCase();
    if (/^\d{12}$/.test(cleaned)) {
      normalized.push(cleaned);
      continue;
    }
    if (/^[A-Z0-9]{10,22}$/.test(cleaned)) {
      normalized.push(cleaned);
      continue;
    }
    return {
      ok: false,
      error: "UPI/UTR reference must be 12 digits (e.g. 123456789012) or a 10–22 character alphanumeric ID.",
    };
  }

  return { ok: true, value: normalized.join(", ") };
}

export function validateQuestionAnswer(question, value) {
  const type = question.type || inferQuestionType(question.key);
  const required = question.required !== false;

  switch (type) {
    case "name":
    case "victimName":
      return validateVictimName(value);
    case "phone":
      return validateContactPhone(value, { required });
    case "age":
      return validateAge(value);
    case "date":
      return parseIncidentDate(value);
    case "amount":
      return validateAmount(value, { required });
    case "description":
      return validateDescription(value);
    case "bank":
      return validateBankName(value, { required });
    case "upiId":
      return validateUpiId(value, { required });
    case "transactionId":
      return validateTransactionId(value, { required });
    default: {
      const t = String(value ?? "").trim();
      if (!t && required) return { ok: false, error: "This field is required." };
      if (!t) return { ok: true, value: "" };
      if (required && VAGUE_ANSWERS.test(t)) {
        return { ok: false, error: "Please provide a specific answer for this field." };
      }
      return { ok: true, value: t };
    }
  }
}

function inferQuestionType(key) {
  if (key === "victimName") return "name";
  if (key === "victimPhone") return "phone";
  if (key === "victimAge") return "age";
  if (key === "incidentDate") return "date";
  if (key === "amountLost") return "amount";
  if (key === "description") return "description";
  if (key === "bankName") return "bank";
  if (key === "transactionId" || key === "transactionIds") return "transactionId";
  if (key === "upiId" || key === "fraudsterUpiId") return "upiId";
  if (/phone|Phone/i.test(key)) return "phone";
  return "text";
}

export const VICTIM_QUESTIONS = [
  {
    key: "victimName",
    label: "What is your full name (as it should appear on the complaint)?",
    required: true,
    type: "name",
  },
  {
    key: "victimPhone",
    label: "What is your contact number?",
    required: true,
    type: "phone",
  },
  {
    key: "victimAge",
    label: "What is your age?",
    required: true,
    type: "age",
  },
];

export function enrichCategoryQuestions(questions) {
  return (questions || []).map((q) => ({
    ...q,
    type: q.type || inferQuestionType(q.key),
  }));
}

export function validateReportCompleteness({ answers, location, category, attachments }) {
  const missing = [];
  const completed = [];

  for (const q of VICTIM_QUESTIONS) {
    const r = validateQuestionAnswer(q, answers[q.key]);
    if (r.ok && r.value) {
      completed.push(q.label.replace(/\?$/, ""));
    } else {
      missing.push(`Victim ${q.key === "victimName" ? "full name" : q.key === "victimPhone" ? "contact number" : "age"}`);
    }
  }

  if (!category?.questions) {
    missing.push("Fraud category");
  } else {
    for (const q of enrichCategoryQuestions(category.questions)) {
      if (!q.required) continue;
      const r = validateQuestionAnswer(q, answers[q.key]);
      if (r.ok && r.value) completed.push(q.label.replace(/\?$/, ""));
      else missing.push(q.label.replace(/\?$/, ""));
    }
  }

  if (!location?.state) missing.push("State");
  else completed.push("State");
  if (!location?.city) missing.push("City");
  else completed.push("City");

  const dateResult = parseIncidentDate(answers.incidentDate);
  if (dateResult.ok) completed.push("Incident date / timeline");
  else missing.push("Incident date / timeline");

  if (Array.isArray(attachments) && attachments.length > 0) completed.push("Evidence");
  else missing.push("Evidence attachments");

  const totalRequired = completed.length + missing.length;
  const readinessScore = totalRequired ? Math.round((completed.length / totalRequired) * 100) : 0;

  return {
    ok: missing.length === 0,
    missing,
    completed,
    readinessScore,
    readinessChecklist: { completed, missing },
  };
}
