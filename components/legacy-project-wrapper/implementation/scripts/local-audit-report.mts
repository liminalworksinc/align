// Producing a local-audit report from a file someone ran `liminal-audit.mjs` to make (spec 2.10).
//
// Route (a), by hand, BUILT: the person sends the founder their liminal-audit-<date>.json; she runs, on her machine,
//   node scripts/local-audit-report.mts <file>          checks the file and prints exactly what would be sent
//   node scripts/local-audit-report.mts <file> --send   sends it under her local Anthropic login, writes the report
// Route (b), hosted, STUB: the file would go through the preview-and-permission endpoint the paste path uses. It needs
// the model key on the hosted server and a deploy, neither approved (founder decisions open as of 2026-11-24).
//
// The file is untrusted input: its strings are re-checked against the code's own labels before anything is sent.

import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { FAMILIES } from "../packages/audit-core/src/local/discover.ts";
import { DISCOVERY_CAVEAT, allowedStrings, freeTextFindings } from "../packages/audit-core/src/local/payload.ts";
import { LOCAL_DRAFT_SCHEMA, LOCAL_SYSTEM_PROMPT, verifyLocalDraft } from "../packages/audit-core/src/local/report.ts";
import { RULE_LABELS } from "../packages/audit-core/src/local/rules.ts";

export function routeHosted(): never {
  throw new Error("Hosted delivery is not enabled: it needs the model key on the hosted server and a deploy, both founder decisions not yet made. Use route (a).");
}

/** The payload from a shared file, or the reasons it is refused. */
export function readShared(text: string): { payload: Record<string, unknown> } | { refused: string[] } {
  let file: { format?: unknown; payload?: unknown };
  try { file = JSON.parse(text); } catch { return { refused: ["not JSON"] }; }
  if (file.format !== "liminal-local-audit/1") return { refused: ["not a liminal-local-audit/1 file"] };
  if (!file.payload || typeof file.payload !== "object") return { refused: ["no payload"] };
  const payload = file.payload as Record<string, unknown>;
  const allowed = allowedStrings([...Object.values(RULE_LABELS), ...FAMILIES.map((f) => f.label)]);
  const f = freeTextFindings(JSON.stringify(payload), allowed, { discoveredLabels: [], turnTexts: [] });
  const t = payload.target as Record<string, unknown> | undefined;
  if (!t || typeof t.rule !== "string") f.push("no target rule");
  return f.length ? { refused: f } : { payload };
}

async function main() {
  const [path, flag] = process.argv.slice(2);
  if (!path) { console.error("usage: local-audit-report.mts <liminal-audit-file.json> [--send]"); process.exit(1); }
  if (process.env.FLY_APP_NAME) routeHosted();
  const r = readShared(readFileSync(path, "utf8"));
  if ("refused" in r) { console.error("Refused, nothing sent:"); for (const x of r.refused) console.error(`- ${x}`); process.exit(2); }
  const payload = JSON.stringify(r.payload, null, 2);
  if (flag !== "--send") {
    console.log(`What would be sent (${payload.length} bytes), exactly:\n${payload}\n\nRe-run with --send to send it under your Anthropic login.`);
    return;
  }
  const client = new Anthropic({ maxRetries: 1, timeout: 120_000 }); // her `ant auth login` profile
  const already = (r.payload.target as Record<string, unknown>).already_in_standing_instructions === true;
  const call = async (messages: Anthropic.Beta.BetaMessageParam[]) => {
    const res = await client.beta.messages.create({
      model: process.env.AUDIT_MODEL || "claude-opus-5-5", max_tokens: 8000, system: LOCAL_SYSTEM_PROMPT, messages,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: LOCAL_DRAFT_SCHEMA as unknown as Record<string, unknown> } },
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, json: JSON.parse(text) as unknown };
  };
  let msgs: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: payload }];
  let d = await call(msgs);
  let f = verifyLocalDraft(d.json, already);
  if (f.length) { // R6: retry once with the failures named, then withhold
    msgs = [...msgs, { role: "assistant", content: d.text }, { role: "user", content: `Your draft failed these checks; reply with corrected JSON only:\n- ${f.join("\n- ")}` }];
    d = await call(msgs);
    f = verifyLocalDraft(d.json, already);
  }
  const out = path.replace(/\.json$/, "") + "-report.json";
  writeFileSync(out, JSON.stringify({ recommendation: f.length ? null : d.json, withheld_because: f.length ? f : undefined, caveat: DISCOVERY_CAVEAT, from: r.payload }, null, 2) + "\n");
  console.log(`Wrote ${out}${f.length ? " (recommendation withheld: it failed the checks twice)" : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
