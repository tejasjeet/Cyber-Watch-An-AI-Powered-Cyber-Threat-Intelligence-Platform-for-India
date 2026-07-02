// Gemini + Groq (keys from env only).
function geminiBaseUrl() {
  const ver = (process.env.GOOGLE_AI_API_VERSION || "v1beta").replace(/^\/+|\/+$/g, "");
  if (!/^[a-zA-Z0-9._-]+$/.test(ver)) return "https://generativelanguage.googleapis.com/v1beta";
  return `https://generativelanguage.googleapis.com/${ver}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableGeminiHttp(status) {
  return status === 429 || status === 503 || status === 504;
}

async function geminiGenerateOnce({ apiKey, model, systemPrompt, userPrompt, signal }) {
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");
  const m = model || "gemini-2.5-flash";
  const url = `${geminiBaseUrl()}/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const apiVer = (process.env.GOOGLE_AI_API_VERSION || "v1beta").replace(/^\/+|\/+$/g, "") || "v1beta";
  const body =
    apiVer === "v1"
      ? {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Follow these instructions for the entire answer:\n${systemPrompt}\n\n---\n\n${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
        }
      : {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
        };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await r.text();
  if (!r.ok) {
    let msg = raw.slice(0, 800);
    try {
      const j = JSON.parse(raw);
      msg = j.error?.message || j.error?.status || msg;
    } catch {
      /* keep */
    }
    const err = new Error(`Gemini HTTP ${r.status}: ${msg}`);
    err.statusCode = r.status;
    throw err;
  }
  const data = JSON.parse(raw);
  const br = data.promptFeedback?.blockReason;
  if (br) throw new Error(`Gemini blocked response: ${br}`);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

/**
 * @param {{ apiKey: string, model?: string, systemPrompt: string, userPrompt: string, signal?: AbortSignal }} opts
 * @returns {Promise<string>} Markdown (GFM) from Gemini
 */
export async function geminiGenerateMarkdown(opts) {
  const MAX = 4;
  const BASE_MS = 500;
  let last;
  for (let attempt = 0; attempt < MAX; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_MS * 2 ** (attempt - 1));
    }
    try {
      return await geminiGenerateOnce(opts);
    } catch (e) {
      last = e;
      const sc = e && typeof e === "object" && "statusCode" in e ? e.statusCode : undefined;
      const retryHttp = typeof sc === "number" && isRetryableGeminiHttp(sc);
      const retryNet =
        !sc &&
        /fetch failed|network|ECONNRESET|ETIMEDOUT|socket|TLS/i.test(String(e?.message || e?.cause || e));
      if (attempt < MAX - 1 && (retryHttp || retryNet)) {
        continue;
      }
      throw e;
    }
  }
  throw last;
}

export async function groqStreamNdjson({ apiKey, model, system, user, res, signal }) {
  if (!apiKey) {
    res.status(503).type("application/json").json({ error: "GROQ_API_KEY is not set" });
    return;
  }
  const m = model || "llama-3.3-70b-versatile";

  let upstream;
  try {
    upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: true,
        temperature: 0.35,
        max_completion_tokens: 2048,
      }),
      signal,
    });
  } catch (e) {
    const cause = e?.cause;
    const extra = cause && typeof cause === "object" ? cause.message || cause.code || "" : "";
    return res.status(502).json({
      error: `Groq connection failed: ${e?.message || e}${extra ? ` (${extra})` : ""}`,
    });
  }

  if (!upstream.ok) {
    const t = await upstream.text();
    return res.status(upstream.status).json({ error: `Groq ${upstream.status}: ${t.slice(0, 800)}` });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const reader = upstream.body?.getReader();
  if (!reader) {
    res.write(JSON.stringify({ error: "Groq: empty response body" }) + "\n");
    res.end();
    return;
  }

  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        let j;
        try {
          j = JSON.parse(payload);
        } catch {
          continue;
        }
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) res.write(JSON.stringify({ c: piece }) + "\n");
      }
    }
  } catch (e) {
    res.write(JSON.stringify({ error: String(e?.message || e) }) + "\n");
  }
  res.write(JSON.stringify({ done: true }) + "\n");
  res.end();
}
