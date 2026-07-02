/**
 * Deterministic breach briefing markdown (no LLM). Mirrors prior section headings for layout compatibility.
 */
export function buildBreachBriefingMarkdown(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const sens = Array.isArray(ctx.detected_sensitive) ? ctx.detected_sensitive : [];
  const excerpt = ctx.list_summary_excerpt ? String(ctx.list_summary_excerpt).slice(0, 320).trim() : "";

  return `## AI breach analysis
This report is **generated locally** from your indexed disclosure and UI model — **no external AI**.

**${ctx.company}** — attributed group **${ctx.group}**, sector **${ctx.sector}**, modelled severity **${ctx.client_severity}/100**. Staged scale **${ctx.size_gb} GB-equivalent**, **${ctx.records_label}** records (estimate). Proof links in index: **${ctx.proof_link_count}**.

${excerpt ? `Public listing excerpt: *${excerpt}${excerpt.length >= 320 ? "…" : ""}*\n\n` : ""}Use **Open disclosure source** for the original OSINT URL when available.

## AI sensitive data inference (illustrative)
${sens.length ? sens.map((s) => `- ${s} **(Possible)**`).join("\n") : "- No synthetic sensitive-class hits for this stub **(Unknown)**"}

## Schema analyzer (hypothetical)
\`\`\`sql
-- Illustrative only — not extracted from any archive
CREATE TABLE users (
  id            BIGINT PRIMARY KEY,
  email         VARCHAR(320),
  password_hash VARCHAR(255),
  phone         VARCHAR(40),
  address_line  VARCHAR(512),
  created_at    TIMESTAMP
);
CREATE TABLE invoices (
  id         BIGINT PRIMARY KEY,
  customer_id BIGINT REFERENCES users(id),
  amount      DECIMAL(18,2),
  issued_at   DATE
);
\`\`\`

## AI defensive recommendations
1. Inventory accounts and secrets tied to this entity in your environment (if in scope).
2. Enforce MFA and session limits on remote access aligned with **${ctx.sector}** risk patterns.
3. Validate backups and recovery runbooks; preserve evidence per IR / legal guidance.

## Attack attribution (index-level)
Index attributes activity to **${ctx.group}**. Narrative confidence is **qualitative only** from public disclosure metadata — not covert intelligence.
`;

}
