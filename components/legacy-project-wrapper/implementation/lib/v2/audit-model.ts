import Anthropic from "@anthropic-ai/sdk";
import { DRAFT_JSON_SCHEMA, SYSTEM_PROMPT } from "../../packages/audit-core/src/prompt.ts";
import { config } from "../config";

// The agent audit's model client (spec §3.2). One small interface so the endpoint can run against a fake in tests.
// Server-side, Liminal's own key (founder ruling 2026-11-24): AUDIT_ANTHROPIC_API_KEY, read from the environment, never
// logged, never sent to the browser. Neither the key nor any request or response body is ever written to a log.
//
// NOT ENABLED HOSTED until the founder approves putting the key on the hosted server and its outbound calls: without
// the variable the endpoint answers 503 and nothing is sent anywhere.

export interface AuditModel {
  /** Which model drafted, for the report's footer. */
  readonly name: string;
  /** Tokens used by this instance's calls so far (for measuring cost per audit). Absent on fakes. */
  readonly usage?: { input: number; output: number };
  /** One drafting call. `retry` carries the previous draft and the checks it failed. Returns the parsed JSON reply,
   *  still untrusted: the caller shape-checks and verifies it. */
  draft(payload: string, retry?: { previous: string; note: string }): Promise<unknown>;
}

export class AuditModelError extends Error {
  readonly code: "refused" | "incomplete" | "unreadable" | "unavailable";
  constructor(code: AuditModelError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Default model: the current Opus. AUDIT_MODEL overrides it (for example to compare Sonnet on the fixtures). */
const DEFAULT_MODEL = "claude-opus-5-5";

function anthropicModel(apiKey: string | null, model: string): AuditModel {
  // apiKey null: local development only, the SDK's own credential chain (an `ant auth login` profile on this machine).
  const client = apiKey ? new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 }) : new Anthropic({ maxRetries: 1, timeout: 120_000 });
  const usage = { input: 0, output: 0 };
  return {
    name: model,
    usage,
    async draft(payload, retry) {
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: payload }];
      if (retry) messages.push({ role: "assistant", content: retry.previous }, { role: "user", content: retry.note });
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages,
          // If the model declines, the API re-runs the request on a fallback model it picks by refusal category.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> },
          },
        });
      } catch (e) {
        // Status only: the SDK's error message can quote the request.
        const status = e instanceof Anthropic.APIError ? e.status : undefined;
        throw new AuditModelError("unavailable", `The model could not be reached${status ? ` (${status})` : ""}`);
      }
      usage.input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      usage.output += res.usage.output_tokens;
      if (res.stop_reason === "refusal") throw new AuditModelError("refused", "The model declined to write this audit");
      if (res.stop_reason === "max_tokens") throw new AuditModelError("incomplete", "The model's draft was cut off");
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      try {
        return JSON.parse(text);
      } catch {
        throw new AuditModelError("unreadable", "The model's draft was not valid JSON");
      }
    },
  };
}

/** A deterministic stand-in for tests and local page work (AUDIT_MODEL=fake; refused when hosted). It drafts from the
 *  payload's own numbers and always obeys the rules, so the endpoint's verification path is exercised end to end. */
export function fakeModel(): AuditModel {
  return {
    name: "fake",
    async draft(payload) {
      const p = JSON.parse(payload) as {
        context: { purpose: string | null };
        runs: { id: string; changes: { category: string }[] }[];
        numbers: { dominant: boolean; top_category: string | null; thin_evidence: boolean };
      };
      const top = p.numbers.top_category;
      const topRuns = p.runs.filter((r) => r.changes.some((c) => c.category === top)).map((r) => r.id);
      const quiet = p.runs.filter((r) => r.changes.length === 0).map((r) => r.id);
      const why = p.numbers.dominant && top
        ? [
            { kind: "costs_time", category: top, claim: `{top_count} of {total_changes} changes were to the ${top}, in {top_runs} of {runs} runs.`, runs: topRuns.slice(0, 3) },
            { kind: "working", category: null, claim: "The rest of the work needed few changes.", runs: (quiet.length ? quiet : p.runs.map((r) => r.id)).slice(0, 1) },
          ]
        : [
            { kind: "working", category: null, claim: "No single kind of change stands out across these runs.", runs: p.runs.slice(0, 2).map((r) => r.id) },
            { kind: "costs_time", category: p.runs[0]?.changes[0]?.category ?? null, claim: "Changes are spread across several parts of the output.", runs: p.runs.filter((r) => r.changes.some((c) => c.category === p.runs[0]?.changes[0]?.category)).slice(0, 1).map((r) => r.id) },
          ];
      return {
        purpose: p.context.purpose ?? "An agent whose runs are listed below; its purpose was not stated.",
        why: p.numbers.thin_evidence ? why.slice(0, 1) : why,
        try_this: p.numbers.dominant && top
          ? { text: `Write a short guide for the ${top} step from your best examples and add it to the agent's instructions.`, exact_text: null, category: top, addresses: "top_category", finding: null }
          : { text: "Audit again after your next runs; no single change stands out in these.", exact_text: null, category: null, addresses: "none", finding: null },
        cannot_tell: ["Whether the agent's output was correct; only what you changed was counted."],
        how_you_will_know: "Compare changes per run, now {median_changes}, on your next audit.",
      };
    },
  };
}

/** The configured model, or null when audits are not enabled on this server. */
export function auditModel(): AuditModel | null {
  const which = process.env.AUDIT_MODEL;
  if (which === "fake") return config().hosted ? null : fakeModel();
  const key = process.env.AUDIT_ANTHROPIC_API_KEY;
  if (key) return anthropicModel(key, which || DEFAULT_MODEL);
  // AUDIT_LOCAL_PROFILE=1: use this machine's Anthropic login (development and the founder's dry run). Never hosted.
  if (process.env.AUDIT_LOCAL_PROFILE === "1" && !config().hosted) return anthropicModel(null, which || DEFAULT_MODEL);
  return null;
}
