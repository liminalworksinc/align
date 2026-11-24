// Checking the model's draft against the honesty rules before anything is shown (spec §2.3, R1 to R4). A failing draft
// is retried once with these failures named; a second failure shows numbers and table without a recommendation (R6).

import { badPlaceholders, type Numbers } from "./numbers.ts";
import type { Draft, Finding, Run } from "./schema.ts";

export interface Verdict {
  ok: boolean;
  failures: string[];
}

// Number words a model might use to slip a figure past the digit check. "one" and "a" stay allowed ("try one change").
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|twice|double|triple|percent|percentage|majority|most of)\b/i;

// First words that mark a description rather than an action (R4: the Nov 19 failure was a first line that restated
// what the person already knew).
const NOT_AN_ACTION = new Set([
  "the", "your", "you", "it", "its", "it's", "this", "that", "these", "there", "most", "agent", "agents", "people", "we", "i",
  "our", "their", "they", "he", "she", "a", "an", "some", "many", "every", "each", "all", "nothing", "no", "one", "when",
  "because", "since", "while", "although", "if",
]);

const isStr = (v: unknown): v is string => typeof v === "string";

/** True when `text` carries a number of its own: a digit outside a placeholder or a known run id, or a number word. */
function carriesNumber(text: string, runIds: Set<string>): boolean {
  const stripped = text
    .replace(/\{[a-z_]+\}/g, " ")
    .replace(/\b[A-Za-z]+\d+[a-z]?\b/g, (tok) => (runIds.has(tok.toUpperCase()) ? " " : tok));
  return /\d/.test(stripped) || NUMBER_WORDS.test(stripped);
}

/** Shape check for an untrusted draft (the model's JSON). Returns the failures; empty when the shape is right. */
export function shapeFailures(d: unknown): string[] {
  const f: string[] = [];
  if (!d || typeof d !== "object") return ["draft is not an object"];
  const x = d as Record<string, unknown>;
  if (!isStr(x.purpose)) f.push("purpose must be a string");
  if (!Array.isArray(x.why)) f.push("why must be a list");
  else (x.why as unknown[]).forEach((w, i) => {
    const y = w as Record<string, unknown> | null;
    if (!y || typeof y !== "object") return f.push(`why[${i}] is not an object`);
    if (!["costs_time", "caught_by_person", "working"].includes(y.kind as string)) f.push(`why[${i}].kind is not allowed`);
    if (!isStr(y.claim)) f.push(`why[${i}].claim must be a string`);
    if (!Array.isArray(y.runs) || !(y.runs as unknown[]).every(isStr)) f.push(`why[${i}].runs must be a list of run ids`);
    if (y.category !== undefined && y.category !== null && !isStr(y.category)) f.push(`why[${i}].category must be a string or null`);
  });
  const t = x.try_this as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object" || !isStr(t.text)) f.push("try_this.text must be a string");
  else {
    if (t.exact_text !== undefined && t.exact_text !== null && !isStr(t.exact_text)) f.push("try_this.exact_text must be a string or null");
    if (t.category !== null && !isStr(t.category)) f.push("try_this.category must be a string or null");
  }
  if (!Array.isArray(x.cannot_tell) || !(x.cannot_tell as unknown[]).every(isStr)) f.push("cannot_tell must be a list of strings");
  if (!isStr(x.how_you_will_know)) f.push("how_you_will_know must be a string");
  return f;
}

/** Verify a well-shaped draft against R1 to R4 for these runs and numbers. */
export function verifyDraft(draft: Draft, runs: Run[], n: Numbers): Verdict {
  const failures: string[] = [];
  const ids = new Set(runs.map((r) => r.id.toUpperCase()));
  const runById = new Map(runs.map((r) => [r.id.toUpperCase(), r]));

  // R1: no number of the model's own anywhere in the prose; placeholders must be known and have a value.
  const prose: [string, string][] = [
    ["purpose", draft.purpose],
    ["try_this.text", draft.try_this.text],
    ["how_you_will_know", draft.how_you_will_know],
    ...draft.why.map((w, i): [string, string] => [`why[${i}].claim`, w.claim]),
    ...draft.cannot_tell.map((c, i): [string, string] => [`cannot_tell[${i}]`, c]),
  ];
  for (const [where, text] of prose) {
    if (carriesNumber(text, ids)) failures.push(`R1: ${where} states a number; use a placeholder`);
    for (const k of badPlaceholders(text, n)) failures.push(`R1: ${where} uses {${k}}, which has no value here`);
  }
  // exact_text is instruction text for the person's agent (it may say "under two sentences"); placeholders only.
  if (draft.try_this.exact_text) for (const k of badPlaceholders(draft.try_this.exact_text, n)) failures.push(`R1: try_this.exact_text uses {${k}}, which has no value here`);

  // Counts the report may show: 1 to 3 findings, at least 2 when evidence is not thin; at most 4 cannot_tell lines.
  const minWhy = n.thin ? 1 : 2;
  if (draft.why.length < minWhy || draft.why.length > 3) failures.push(`why must have ${minWhy} to 3 findings`);
  if (draft.cannot_tell.length > 4) failures.push("cannot_tell has more than 4 lines");

  // R2: every finding cites runs that exist and support it.
  draft.why.forEach((w: Finding, i) => {
    if (!w.runs.length) failures.push(`R2: why[${i}] cites no run`);
    for (const id of w.runs) if (!ids.has(id.toUpperCase())) failures.push(`R2: why[${i}] cites ${id}, which is not in the runs`);
    if (w.kind === "costs_time") {
      const cat = n.categories.find((c) => c.category === w.category);
      if (!cat) failures.push(`R2: why[${i}] is costs_time but names no category from the runs`);
      else for (const id of w.runs) {
        const r = runById.get(id.toUpperCase());
        if (r && !r.changes.some((c) => c.category === cat.category)) failures.push(`R2: why[${i}] cites ${id}, which has no ${cat.category} change`);
      }
    }
  });

  // R3: the recommendation addresses the largest time cost; with no dominant category it names none.
  if (n.dominant && n.top) {
    if (draft.try_this.category !== n.top.category) failures.push(`R3: try_this must address ${n.top.category}, the largest category`);
    if (!draft.why.some((w) => w.kind === "costs_time" && w.category === n.top!.category)) failures.push(`R3: no costs_time finding for ${n.top.category}`);
  } else if (draft.try_this.category !== null) {
    failures.push("R3: no category clearly leads, so try_this must not single one out (category null)");
  }

  // R4: the first line is an action, not a restatement.
  const first = draft.try_this.text.trim().split(/(?<=[.!?])\s/)[0] ?? "";
  const firstWord = (first.match(/[A-Za-z']+/)?.[0] ?? "").toLowerCase();
  if (!firstWord || NOT_AN_ACTION.has(firstWord)) failures.push("R4: try_this must start with what to do, not a description");

  return { ok: failures.length === 0, failures };
}
