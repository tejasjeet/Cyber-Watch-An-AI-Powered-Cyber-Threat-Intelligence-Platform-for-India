/**
 * Deterministic group deployment briefing (no LLM).
 * @param {string} groupName
 * @param {object} context — output of \`buildGroupDeploymentAiContext\`
 */
export function buildGroupDeploymentBriefingMarkdown(groupName, context) {
  if (!groupName || !context || typeof context !== "object") return "";
  const n = Number(context.victim_count) || 0;
  const last = context.last_index_activity_ist || context.last_index_activity_iso || "—";
  const mixes = (context.sector_mix || [])
    .slice(0, 8)
    .map((s) => `- **${s.name}**: ${s.count}`)
    .join("\n");
  const states = (context.state_mix || [])
    .slice(0, 8)
    .map((s) => `- **${s.name}**: ${s.count}`)
    .join("\n");
  const weekly = (context.weekly_counts_tail || [])
    .map((w) => `- ${w.week}: **${w.count}**`)
    .join("\n");
  const card = context.ui_card;
  const cardLine = card
    ? `UI card: **${card.status}**, threat band **${card.activity}**, TTP tag **${card.predominant_ttp || "—"}**.`
    : "No group card metadata in context.";

  return `## AI deployment summary
This briefing is **generated locally** from the India index JSON — **no external AI**.

Group **${groupName}** appears **${n}** times in the loaded index. Last index activity (from row timestamps): **${last}**.

${cardLine}

## TTP-style tradecraft (inferred)
- **Initial access** — exposed edge services / credentialed access per common ransomware tradecraft **(Possible)**.
- **Execution** — commodity tooling or scripted staging **(Possible)**.
- **Persistence** — scheduled tasks or service abuse **(Unknown)** without host telemetry.
- **Exfiltration** — bulk staging then leak-site pressure consistent with public reporting **(Possible)**.
- **Impact** — encryption and/or data exposure per disclosure listings **(Likely)** for indexed victims.

## Predicted next target sectors
${mixes || "- Insufficient sector_mix in context — **Unknown**"}

## Regional load (sample)
${states || "—"}

## Recent weekly counts (tail)
${weekly || "—"}

## Defensive recommendations
1. Reduce remote-access blast radius (MFA, PAM, allow-lists).
2. Immutable backups and tested restore for high-value **${groupName}**-shaped targets in your sector mix.
3. Centralize logging and outbound egress monitoring for staging patterns.

## Data source
All figures above are derived only from \`victim_count\`, \`sector_mix\`, \`state_mix\`, \`weekly_counts_tail\`, and \`sample_disclosures\` in the supplied context.
`;

}
