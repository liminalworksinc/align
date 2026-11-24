// What a local audit sends, and the checks on it (release B, spec 2.9 / 2.10). No network, no model, no verifier:
// this module is what an outside person's runner is built from (bin/liminal-audit.mts), so it imports only types.
// Ranking, founder ruling Nov 24 for the local report: a rule the person keeps restating ranks first, by how often
// they state it (the restating is the cost), above a risky rule broken a few times; with none, caught mistakes first.

import type { DiscoveredRule } from "./discover.ts";
import type { Measures } from "./measures.ts";

const EXTERNAL = /\b(?:send|post|push|publish|deploy|delete|pay|merge|email|submit)\b/i;

export interface Target {
  label: string;
  why: "restated" | "broken_external" | "broken";
  sessions: number;
  statements: number | null;
  laterBreaks: number;
}

/** The rule the recommendation addresses, or null when there is none. Restated rules come from discovery (grouped from
 *  the person's own words); known rules from the fixed list contribute breaks for the caught-mistakes fallback. */
export function pickTarget(discovered: DiscoveredRule[], known: Measures["rules"]): Target | null {
  const restated = discovered.filter((r) => r.known).sort((a, b) => b.statements - a.statements || b.sessions - a.sessions)[0];
  if (restated) return { label: restated.label, why: "restated", sessions: restated.sessions, statements: restated.statements, laterBreaks: restated.laterBreaks };
  const broken = known.filter((r) => r.laterBreaks > 0).sort((a, b) => Number(EXTERNAL.test(b.label)) - Number(EXTERNAL.test(a.label)) || b.laterBreaks - a.laterBreaks)[0];
  if (broken) return { label: broken.label, why: EXTERNAL.test(broken.label) ? "broken_external" : "broken", sessions: broken.sessions, statements: null, laterBreaks: broken.laterBreaks };
  return null;
}

/** The exact text sent to the model: derived counts and short rule labels only. Stable key order. */
/** How often the target rule already appears in the instruction files the agents load (read locally; only the counts
 *  are sent). A rule that is already written down and still restated needs a mechanism, not more text. */
export interface Standing { files: number; mentions: number }

/** Lines in instruction-file text that state the target rule. Family rules use the family's own words. */
export function standingMentions(target: Target, text: string): number {
  const re = target.label === "verify before relying on it"
    ? /\b(?:verif(?:y|ied|ication)|check before|at (?:the|its) (?:source|issuer)|before (?:asserting|claiming))\b/i
    : new RegExp(target.label.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/gi, "")).filter((w) => w.length > 3).slice(0, 3).join(".*") || "$^", "i");
  return text.split("\n").filter((l) => re.test(l)).length;
}

export function localPayload(m: Measures, discovered: DiscoveredRule[], target: Target, aim: string, standing: Standing = { files: 0, mentions: 0 }): string {
  return JSON.stringify({
    aim,
    target: { rule: target.label, // a code-written label: pickTarget only picks known rules
 why_chosen: target.why, already_in_standing_instructions: standing.mentions > 0, standing_instruction_files_mentioning_it: standing.files, standing_instruction_lines_mentioning_it: standing.mentions, sessions: target.sessions, statements: target.statements, later_breaks_at_least: target.laterBreaks },
    measures: {
      days: 30,
      sessions: m.sessions,
      corrections: m.corrections,
      corrections_by_kind: m.byCategory,
      active_minutes_after_corrections: m.cost.minutes,
    },
    // Only labels the code writes (habit families, the fixed rule list) are sent. A discovered rule's label is a clipped
    // sentence in the person's own words, so it stays local and only the count of such rules goes.
    rules_restated: discovered.filter((r) => r.known).map((r) => ({ rule: r.label, sessions: r.sessions, statements: r.statements, later_breaks_at_least: r.laterBreaks })),
    other_restated_rules: discovered.filter((r) => !r.known).length,
    rules_known_broken: m.rules.filter((r) => r.laterBreaks > 0).map((r) => ({ rule: r.label, sessions: r.sessions, later_breaks: r.laterBreaks })),
    outcomes: m.outcomes?.map((o) => ({ outcome: o.outcome, sessions: o.sessions })) ?? null,
    corrections_per_session_by_project: m.byProject.map((p) => ({ project: p.project, sessions: p.sessions, per_session: p.perSession })),
  }, null, 2);
}

/** The report's lines, all computed in code, each with the count it rests on. */
export function reportLines(m: Measures, discovered: DiscoveredRule[], target: Target | null): string[] {
  const lines: string[] = [];
  if (target?.why === "restated") lines.push(`You stated "${target.label}" ${target.statements} times across ${target.sessions} sessions in the last 30 days. Later breaks: at least ${target.laterBreaks} (a break is counted only when you corrected on the same rule afterward, so this undercounts). Having to restate it is the cost.`);
  for (const r of m.rules.filter((x) => x.laterBreaks > 0)) lines.push(`"${r.label}": stated in ${r.sessions} sessions, broken ${r.laterBreaks} times after the first statement.`);
  for (const r of discovered.filter((x) => x.label !== target?.label)) lines.push(`Also restated: "${r.label}", ${r.statements} times across ${r.sessions} sessions.`);
  lines.push(`Corrections cost about ${m.cost.minutes} active minutes, over ${m.cost.correctionsCounted} corrections in ${m.sessions} sessions (an estimate: idle gaps over five minutes dropped).`);
  if (m.outcomes) {
    const o = Object.fromEntries(m.outcomes.map((x) => [x.outcome, x]));
    lines.push(`Outcomes: ${o.merged?.sessions ?? 0} sessions reached main, ${o.committed?.sessions ?? 0} committed but not merged, ${o.nothing_landed?.sessions ?? 0} landed nothing, ${o.unknown?.sessions ?? 0} unknown.`);
    if (o.committed && o.merged) lines.push(`Observation, not a cause: sessions committed but not merged averaged ${o.committed.perSession} corrections (${o.committed.sessions} sessions); merged sessions averaged ${o.merged.perSession} (${o.merged.sessions} sessions). Most outcomes are attributed by time.`);
  }
  lines.push(DISCOVERY_CAVEAT);
  lines.push(`Corrections per session: ${m.byProject.map((p) => `${p.project} ${p.perSession} (${p.sessions} sessions)`).join(", ")}.`);
  return lines;
}

// ---- The shareable file (spec 2.10, founder ruling Nov 24: wave 1 offers the local report to coding-agent users) ----

/** The aim an outside person's file carries: fixed, code-written, so no words of theirs travel. */
export const SHARED_AIM = "get more goals done with higher quality output from my coding agents";

/** Rule discovery was tuned on one founder's logs plus one synthetic voice: said plainly wherever results are shown. */
export const DISCOVERY_CAVEAT = "Rule discovery was tuned on very few people's logs and may miss rules you state in your own way.";

const OUTCOMES = new Set(["merged", "committed", "reverted", "nothing_landed", "unknown"]);
const WHY = new Set(["restated", "broken_external", "broken"]);

/** The payload with project folder names replaced by "project 1", "project 2" (folder names can identify work). */
export function sharePayload(m: Measures, discovered: DiscoveredRule[], target: Target, standing: Standing): string {
  const p = JSON.parse(localPayload(m, discovered, target, SHARED_AIM, standing));
  p.corrections_per_session_by_project = (p.corrections_per_session_by_project as { project: string }[]).map((x, i) => ({ ...x, project: `project ${i + 1}` }));
  return JSON.stringify(p, null, 2);
}

/** Every string a shareable file may contain besides its keys: labels the code wrote and fixed vocabulary. */
export function allowedStrings(codeLabels: string[]): (s: string) => boolean {
  const ok = new Set([SHARED_AIM, ...codeLabels]);
  return (s) => ok.has(s) || OUTCOMES.has(s) || WHY.has(s) || /^project \d+$/.test(s);
}

/** Free text from the person in a file about to be shared; empty means safe. Two independent checks: (1) every string
 *  value is allowed vocabulary; (2) no discovered-rule wording and no 20+ character sentence of any of their turns
 *  appears anywhere in the serialized file, keys included. */
export function freeTextFindings(serialized: string, allowed: (s: string) => boolean, theirWords: { discoveredLabels: string[]; turnTexts: string[] }): string[] {
  const f: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") { if (!allowed(v)) f.push(`${path} holds text that is not a code label: ${JSON.stringify(v.slice(0, 40))}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(JSON.parse(serialized), "");
  const lower = serialized.toLowerCase();
  for (const l of theirWords.discoveredLabels) {
    const core = l.replace(/\.\.\.$/, "").trim().toLowerCase();
    if (core.length >= 6 && lower.includes(core)) f.push(`a rule in the person's own words is present: ${JSON.stringify(l.slice(0, 40))}`);
  }
  for (const t of theirWords.turnTexts) {
    for (const sent of t.split(/(?<=[.!?])\s+|\n+/)) {
      // Trailing punctuation dropped, so text copied without its full stop is still caught.
      const s = sent.trim().toLowerCase().replace(/[\s.!?,;:]+$/, "");
      if (s.length >= 20 && lower.includes(s)) { f.push(`text from the person's prompts is present: ${JSON.stringify(s.slice(0, 40))}`); break; }
    }
  }
  return f;
}

