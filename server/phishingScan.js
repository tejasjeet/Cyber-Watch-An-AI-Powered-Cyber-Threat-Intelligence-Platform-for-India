import { geminiGenerateMarkdown } from "./aiProviders.js";

const SUSPICIOUS_KEYWORDS = [
  "login",
  "signin",
  "sign-in",
  "verify",
  "secure",
  "update",
  "password",
  "account",
  "wallet",
  "confirm",
  "banking",
  "support",
  "auth",
  "reset",
  "billing",
  "suspend",
  "unlock",
  "validation",
];

const BRAND_PATTERNS = [
  { brand: "Amazon", tokens: ["amazon", "amzn"] },
  { brand: "Google", tokens: ["google", "gmail", "goog"] },
  { brand: "Microsoft", tokens: ["microsoft", "office365", "outlook", "live-login"] },
  { brand: "Apple", tokens: ["apple", "icloud"] },
  { brand: "PayPal", tokens: ["paypal", "pay-pal"] },
  { brand: "Netflix", tokens: ["netflix"] },
  { brand: "Facebook", tokens: ["facebook", "fb-login", "meta-verify"] },
  { brand: "WhatsApp", tokens: ["whatsapp", "wa-verify"] },
  { brand: "HDFC Bank", tokens: ["hdfc", "hdfcbank"] },
  { brand: "SBI", tokens: ["sbi", "onlinesbi"] },
  { brand: "ICICI", tokens: ["icici"] },
];

const OFFICIAL_DOMAINS = [
  "amazon.com",
  "amazon.in",
  "google.com",
  "gmail.com",
  "microsoft.com",
  "apple.com",
  "paypal.com",
  "netflix.com",
  "facebook.com",
  "meta.com",
  "whatsapp.com",
  "hdfcbank.com",
  "onlinesbi.sbi",
  "icicibank.com",
];

function statusFromScore(score) {
  if (score <= 25) return "Safe";
  if (score <= 60) return "Medium Risk";
  return "High Risk";
}

function formatAgeDays(days) {
  if (days == null || !Number.isFinite(days)) return "Unknown";
  if (days < 1) return "Less than 1 day";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year" : `${years} years`;
}

function parseInputUrl(raw) {
  let s = String(raw ?? "").trim();
  if (!s) throw new Error("URL is required");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!u.hostname || !u.hostname.includes(".")) throw new Error("Invalid URL hostname");
  return u;
}

function extractHostParts(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const parts = host.split(".");
  const tld = parts.length >= 2 ? parts.slice(-1)[0] : host;
  const domain = parts.length >= 2 ? parts.slice(-2).join(".") : host;
  return { host, domain, tld };
}

function findSuspiciousKeywords(urlObj) {
  const hay = `${urlObj.hostname}${urlObj.pathname}${urlObj.search}`.toLowerCase();
  return SUSPICIOUS_KEYWORDS.filter((kw) => hay.includes(kw));
}

function detectBrandImpersonation(hostname) {
  const host = hostname.toLowerCase();
  for (const { brand, tokens } of BRAND_PATTERNS) {
    const hit = tokens.some((t) => host.includes(t));
    if (!hit) continue;
    const isOfficial = OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    if (!isOfficial) return brand;
  }
  return null;
}

async function checkGoogleSafeBrowsing(url, apiKey) {
  if (!apiKey) {
    return { flagged: false, threatTypes: [], message: "Safe Browsing API key not configured" };
  }
  const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`;
  const body = {
    client: { clientId: "cyberwatch", clientVersion: "1.0.0" },
    threatInfo: {
      threatTypes: [
        "MALWARE",
        "SOCIAL_ENGINEERING",
        "UNWANTED_SOFTWARE",
        "POTENTIALLY_HARMFUL_APPLICATION",
      ],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url }],
    },
  };
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await r.text();
  if (!r.ok) {
    let msg = raw.slice(0, 300);
    try {
      const j = JSON.parse(raw);
      msg = j.error?.message || msg;
    } catch {
      /* keep */
    }
    throw new Error(`Safe Browsing API error (${r.status}): ${msg}`);
  }
  const data = JSON.parse(raw || "{}");
  const matches = data.matches || [];
  const threatTypes = [...new Set(matches.flatMap((m) => m.threatType || []))];
  return {
    flagged: matches.length > 0,
    threatTypes,
    message:
      matches.length > 0
        ? `Threat detected${threatTypes.length ? `: ${threatTypes.join(", ")}` : ""}`
        : "No threats found",
  };
}

async function fetchDomainAge(domain) {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return { days: null, label: "Unknown" };
    const data = await r.json();
    const regEvent =
      data.events?.find((e) => e.eventAction === "registration") ||
      data.events?.find((e) => e.eventAction === "registered");
    if (!regEvent?.eventDate) return { days: null, label: "Unknown" };
    const regDate = new Date(regEvent.eventDate);
    const days = Math.max(0, Math.floor((Date.now() - regDate.getTime()) / 86_400_000));
    return { days, label: formatAgeDays(days), registeredAt: regDate.toISOString() };
  } catch {
    return { days: null, label: "Unknown" };
  }
}

async function countRedirects(startUrl, maxHops = 8) {
  let current = startUrl;
  let count = 0;
  for (let i = 0; i < maxHops; i++) {
    try {
      const r = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "CyberWatch-PhishingScanner/1.0" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        count += 1;
        current = new URL(loc, current).href;
        continue;
      }
      break;
    } catch {
      break;
    }
  }
  return count;
}

function computeRiskScore({ safeBrowsingFlagged, domainAgeDays, keywords, brandImpersonation, https }) {
  let score = 0;
  if (safeBrowsingFlagged) score += 60;
  if (domainAgeDays != null && domainAgeDays < 30) score += 15;
  if (keywords.length > 0) score += 10;
  if (brandImpersonation) score += 10;
  if (!https) score += 5;
  return Math.min(100, score);
}

function buildFallbackAnalysis({ url, riskScore, status, signals }) {
  const lines = [
    `This URL was assessed as **${status}** with a risk score of **${riskScore}/100**.`,
    "",
    "### Why this score",
    ...signals.map((s) => `- ${s}`),
    "",
    "### Recommendations",
    riskScore > 60
      ? "- Do not enter credentials or download files from this URL."
      : "- Exercise caution and verify the sender or link source before interacting.",
    "- Prefer navigating to services by typing the official domain or using a bookmark.",
    "- Report suspicious URLs to your security team or use browser reporting tools.",
  ];
  return lines.join("\n");
}

async function generateAiAnalysis(ctx, googleAiKey, googleAiModel) {
  const signalLines = ctx.signals.map((s) => `- ${s}`).join("\n");
  if (!googleAiKey) {
    return buildFallbackAnalysis(ctx);
  }
  const system = `You are a cybersecurity analyst for CyberWatch India. Explain URL phishing risk in clear, professional Markdown (3 short sections max):
1. Summary (2-3 sentences)
2. Why this URL may be suspicious (bullets grounded ONLY in the provided scan facts)
3. Recommendations (numbered, max 5)
Do not invent facts not in the scan data. Keep under 250 words.`;
  const user = `Scan facts for ${ctx.url}:
Risk score: ${ctx.riskScore}/100 (${ctx.status})
Safe Browsing flagged: ${ctx.safeBrowsingFlagged}
Domain age: ${ctx.domainAge}
HTTPS: ${ctx.https}
Keywords: ${ctx.keywords.join(", ") || "none"}
Brand impersonation: ${ctx.brandImpersonation || "none"}
Redirect count: ${ctx.redirectCount}
Signals:
${signalLines}`;
  try {
    return await geminiGenerateMarkdown({
      apiKey: googleAiKey,
      model: googleAiModel,
      systemPrompt: system,
      userPrompt: user,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return buildFallbackAnalysis(ctx);
  }
}

/**
 * @param {string} rawUrl
 * @param {{ safeBrowsingApiKey?: string, googleAiKey?: string, googleAiModel?: string }} opts
 */
export async function scanPhishingUrl(rawUrl, opts = {}) {
  const urlObj = parseInputUrl(rawUrl);
  const normalizedUrl = urlObj.href;
  const { host, domain, tld } = extractHostParts(urlObj.hostname);
  const https = urlObj.protocol === "https:";
  const keywords = findSuspiciousKeywords(urlObj);
  const brandImpersonation = detectBrandImpersonation(host);

  const [safeBrowsing, domainAge, redirectCount] = await Promise.all([
    checkGoogleSafeBrowsing(normalizedUrl, opts.safeBrowsingApiKey),
    fetchDomainAge(domain),
    countRedirects(normalizedUrl),
  ]);

  const signals = [];
  if (safeBrowsing.flagged) signals.push(`Google Safe Browsing flagged this URL (${safeBrowsing.message}).`);
  else signals.push("Google Safe Browsing reported no known threats.");
  if (domainAge.days != null && domainAge.days < 30) {
    signals.push(`Domain is newly registered (${domainAge.label}).`);
  } else if (domainAge.label !== "Unknown") {
    signals.push(`Domain age: ${domainAge.label}.`);
  }
  if (keywords.length) signals.push(`Suspicious keywords in URL: ${keywords.join(", ")}.`);
  if (brandImpersonation) signals.push(`Possible ${brandImpersonation} brand impersonation detected.`);
  if (!https) signals.push("URL does not use HTTPS.");
  if (redirectCount > 2) signals.push(`Multiple redirects detected (${redirectCount}).`);

  const riskScore = computeRiskScore({
    safeBrowsingFlagged: safeBrowsing.flagged,
    domainAgeDays: domainAge.days,
    keywords,
    brandImpersonation,
    https,
  });
  const status = statusFromScore(riskScore);

  const aiAnalysis = await generateAiAnalysis(
    {
      url: normalizedUrl,
      riskScore,
      status,
      safeBrowsingFlagged: safeBrowsing.flagged,
      domainAge: domainAge.label,
      https,
      keywords,
      brandImpersonation,
      redirectCount,
      signals,
    },
    opts.googleAiKey,
    opts.googleAiModel
  );

  return {
    riskScore,
    status,
    safeBrowsing: safeBrowsing.flagged,
    safeBrowsingResult: safeBrowsing.message,
    safeBrowsingThreatTypes: safeBrowsing.threatTypes,
    domainAge: domainAge.label,
    https,
    keywords,
    brandImpersonation: brandImpersonation || null,
    aiAnalysis,
    technicalDetails: {
      domain,
      tld,
      hostname: host,
      registrationAge: domainAge.label,
      sslStatus: https ? "Valid HTTPS" : "No HTTPS",
      redirectCount,
    },
    scannedUrl: normalizedUrl,
    scannedAt: new Date().toISOString(),
  };
}
