import {
  computeNumbers, consumePermission, draftPayload, fill, issuePermission, memoryPermissionStore, normalizeRuns,
  parsePaste, redact, retryNote, shapeFailures, TooFewRuns, verifyDraft,
  type Draft, type Numbers, type Run,
} from "../../packages/audit-core/src/index.ts";
import { signPayload } from "../secret";
import { AuditModelError, type AuditModel } from "./audit-model";
import { V2Error } from "./errors";

// The agent audit, release A (spec specs/align/agent-audit.md): a person pastes their agent's runs, sees exactly what
// would be sent and to whom, clicks to send, and gets a one-page report. Nothing is stored (C5, founder ruling
// 2026-11-24): the runs and the report live in the request and the browser.

/** Who reads the text. Shown on the preview (C1). */
export const PROVIDER = "Anthropic (Claude), under Liminal's account";

// One process (see memoryPermissionStore). Kept on globalThis so a dev-server reload does not orphan open previews.
const g = globalThis as unknown as { __alignAuditPermissions?: ReturnType<typeof memoryPermissionStore> };
const permissions = (g.__alignAuditPermissions ??= memoryPermissionStore());
const sign = (p: string) => signPayload(p);

export interface Preview {
  runs: Run[];
  skipped: string[];
  redacted: { email: number; phone: number; key: number };
  thin: boolean;
  /** The exact text that will be sent to the model, byte for byte. */
  payload: string;
  provider: string;
  permission: string;
  expiresAt: number;
}

/** Parse, redact and price nothing: build the preview and a single-use permission for its exact text. */
export async function preview(paste: string): Promise<Preview> {
  const r = redact(paste);
  const parsed = parsePaste(r.text);
  const runs = normalizeRuns(parsed.runs);
  let n: Numbers;
  try {
    n = computeNumbers(runs);
  } catch (e) {
    if (e instanceof TooFewRuns) throw new V2Error(422, "too_few_runs", e.message, { runs: e.count });
    throw e;
  }
  const payload = draftPayload(runs, n, parsed.context);
  const { permission, expiresAt } = await issuePermission(payload, sign, permissions);
  return { runs, skipped: parsed.skipped, redacted: r.counts, thin: n.thin, payload, provider: PROVIDER, permission, expiresAt };
}

export interface Report {
  /** Null when the draft failed verification twice (R6) or the model declined; `withheld` says why. */
  try_this: { text: string; exact_text: string | null } | null;
  why: { kind: Draft["why"][number]["kind"]; claim: string; runs: string[] }[];
  purpose: string | null;
  cannot_tell: string[];
  how_you_will_know: string | null;
  withheld: string | null;
  numbers: Omit<Numbers, "table" | "categories" | "top"> & { top_category: string | null; top_count: number | null };
  categories: { category: string; count: number; runs: string[] }[];
  table: Numbers["table"];
  model: string;
  /** Tokens this audit used across its model calls (null for fakes). Counts only; no text. */
  tokens: { input: number; output: number } | null;
}

const REASONS: Record<string, string> = {
  malformed: "This send is missing its preview. Preview again.",
  bad_signature: "This preview was not issued by this server. Preview again.",
  expired: "This preview is more than ten minutes old. Preview again.",
  text_changed: "The text changed after the preview. Preview again so you can see exactly what is sent.",
  used: "This preview was already sent once. Preview again to run another audit.",
  unknown: "This preview is no longer valid on this server. Preview again.",
};

/** Run the audit for a previewed payload. The permission must match the payload exactly and is used up here. */
export async function runAudit(payload: unknown, permission: unknown, model: AuditModel, beforeModel: () => void = () => {}): Promise<Report> {
  if (typeof payload !== "string" || !payload) throw new V2Error(400, "bad_request", "Send the previewed text");
  const check = await consumePermission(permission, payload, sign, permissions);
  if (!check.ok) throw new V2Error(409, `consent_${check.reason}`, REASONS[check.reason]);
  // Limits that guard model spend count only consented sends, so refused requests cannot use them up.
  beforeModel();

  // The payload is trusted from here: this server built it and the permission binds it. Re-derive runs and numbers
  // from it rather than from anything else the request carries.
  const runs = (JSON.parse(payload) as { runs: Run[] }).runs;
  const n = computeNumbers(runs);

  let draft: Draft | null = null;
  let withheld: string | null = null;
  let previous: unknown = null;
  let failures: string[] = [];
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    let reply: unknown;
    try {
      reply = await model.draft(payload, attempt === 0 ? undefined : { previous: JSON.stringify(previous), note: retryNote(failures) });
    } catch (e) {
      if (e instanceof AuditModelError) {
        withheld = e.code === "refused" ? "The model declined to write a recommendation for these runs." : "The recommendation could not be written just now. The numbers below are complete.";
        break;
      }
      throw e;
    }
    previous = reply;
    failures = shapeFailures(reply);
    if (!failures.length) failures = verifyDraft(reply as Draft, runs, n).failures;
    if (!failures.length) draft = reply as Draft;
  }
  if (!draft && !withheld) withheld = "The recommendation did not pass our checks twice, so it is not shown. The numbers below are computed from your runs.";

  const { table, categories, top, ...rest } = n;
  return {
    try_this: draft ? { text: fill(draft.try_this.text, n), exact_text: draft.try_this.exact_text ? fill(draft.try_this.exact_text, n) : null } : null,
    why: draft ? draft.why.map((w) => ({ kind: w.kind, claim: fill(w.claim, n), runs: w.runs.map((x) => x.toUpperCase()) })) : [],
    purpose: draft ? fill(draft.purpose, n) : null,
    cannot_tell: draft ? draft.cannot_tell.map((c) => fill(c, n)) : [],
    how_you_will_know: draft ? fill(draft.how_you_will_know, n) : null,
    withheld,
    numbers: { ...rest, top_category: top?.category ?? null, top_count: top?.count ?? null },
    categories,
    table,
    model: model.name,
    tokens: model.usage ? { ...model.usage } : null,
  };
}
