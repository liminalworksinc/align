// The local audit's measures (release B, spec 2.9): corrections, what they cost, rules that did not stick, and where
// the rework lives. Pure over sessions from read.ts. Every number is an estimate and carries the count it rests on.
// Local only: not exported from src/index.ts.

import type { Outcome } from "./outcomes.ts";
import type { Session, Usage } from "./read.ts";
import { DIRECTIVE, RULE_LABELS, detectRules, stripPasteBlocks, type CorrectionTheme } from "./rules.ts";

/** A correction opens by rejecting or redirecting what the agent just did. New here (not ported): the desktop
 *  DIRECTIVE gate also matches new requests ("I need", "use the"), which are not corrections. */
const REJECTS = /^(?:no\b|nope\b|wait\b|don'?t\b|dont\b|do not\b|stop\b|actually\b|instead\b|not (?:that|what|the|like|yet)\b|that'?s not\b|thats not\b|that doesn'?t\b|why (?:are|did|is|would|didn'?t)\b|you (?:missed|forgot|ignored|skipped|didn'?t)\b|wrong\b|fix\b|redo\b|again\b|undo\b|revert\b|did (?:u|you)\b)/i;

export type CorrectionCategory = "style" | "facts" | "redo" | "scope" | "other";
const CATEGORY: [CorrectionCategory, RegExp][] = [
  ["style", /\b(tone|wording|shorter|longer|plainer|simpler|junior|stiff|wordy|em ?dash|format|style|voice|sounds?)\b/i],
  ["facts", /\b(wrong|incorrect|not true|false|stale|missed|forgot|verify|check|inaccurate|source)\b/i],
  ["redo", /\b(fix|again|redo|retry|rewrite|re-?do|start over|revert|undo)\b/i],
  ["scope", /\b(only|just|scope|too much|instead|not what|don'?t|dont|stop|skip|yet|wait)\b/i],
];

const firstSentence = (t: string) => (t.split(/(?<=[.!?])\s+|\n+/)[0] ?? "").trim();

export interface Correction { session: string; at: number; category: CorrectionCategory; rules: CorrectionTheme[] }

/** Corrections in a session: a short typed turn, not the first, that opens by rejecting or redirecting, or that
 *  enforces a known rule under the ported DIRECTIVE gate. */
export function corrections(s: Session): (Correction & { index: number })[] {
  const out: (Correction & { index: number })[] = [];
  s.turns.forEach((t, i) => {
    const text = stripPasteBlocks(t.detectText);
    if (i === 0 || t.long || !text) return;
    const rules = detectRules(text);
    const opens = REJECTS.test(firstSentence(text));
    if (!opens && !(rules.length && DIRECTIVE.test(firstSentence(text)))) return;
    const category = CATEGORY.find(([, re]) => re.test(text))?.[0] ?? "other";
    out.push({ session: s.id, at: t.at, category, rules, index: i });
  });
  return out;
}

const IDLE_CAP_MS = 5 * 60_000;

/** Active minutes in [from, to): gaps between consecutive activity timestamps, gaps over five minutes dropped. */
export function activeMinutes(activity: number[], from: number, to: number): number {
  let ms = 0;
  let prev = from;
  for (const t of activity) {
    if (t <= from) continue;
    if (t >= to) break;
    const gap = t - prev;
    if (gap <= IDLE_CAP_MS) ms += gap;
    prev = t;
  }
  const tail = to - prev;
  if (Number.isFinite(tail) && tail > 0 && tail <= IDLE_CAP_MS) ms += tail;
  return ms / 60_000;
}

/** List prices per million tokens (input, output, cache read, cache write), Nov 2026. Unknown models: tokens only. */
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "claude-fable-5-2": [8, 40, 0.2, 10],
  "claude-opus-5": [5, 25, 0.5, 6.25],
};
/** Tokens split by kind. Dollars only for new work (uncached input plus output) at list prices: cache reads are
 *  context re-read, not new work, and a subscription user does not pay list prices. Never the headline cost. */
function cost(u: Usage[]): { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; newWorkDollarsAtList: number | null; priced: number } {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let dollars = 0, priced = 0;
  for (const x of u) {
    tokens.input += x.input; tokens.output += x.output; tokens.cacheRead += x.cacheRead; tokens.cacheWrite += x.cacheWrite;
    const p = PRICES[x.model];
    if (!p) continue;
    priced++;
    dollars += (x.input * p[0] + x.output * p[1]) / 1e6;
  }
  return { tokens, newWorkDollarsAtList: priced ? Math.round(dollars * 100) / 100 : null, priced };
}

const isoWeek = (t: number) => {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

export interface Measures {
  sessions: number;
  corrections: number;
  byCategory: Record<CorrectionCategory, number>;
  /** Cost of corrections. The headline is active minutes, with the count of corrections it rests on; tokens are split
   *  by kind; dollars are new work only, at list prices, and never shown as what the rework cost the person. */
  cost: { minutes: number; correctionsCounted: number; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; newWorkDollarsAtList: number | null; usageRecordsPriced: number; note: string };
  costByCategory: Record<CorrectionCategory, number>;
  /** Rules stated in 3 or more sessions, with corrections on the same rule after its first statement. */
  rules: { rule: CorrectionTheme; label: string; sessions: number; laterBreaks: number; breakSessions: string[] }[];
  byProject: { project: string; sessions: number; corrections: number; perSession: number }[];
  byWeek: { week: string; sessions: number; corrections: number; perSession: number }[];
  /** Outcome per session (outcomes.ts), when supplied: counts, and corrections per session for each outcome. */
  outcomes: { outcome: Outcome; sessions: number; corrections: number; perSession: number }[] | null;
}

/** Outcomes are read from git by the caller (outcomes.ts) and passed in, so measure() stays pure. */
export type OutcomeOf = (s: Session) => Outcome;

const zero = (): Record<CorrectionCategory, number> => ({ style: 0, facts: 0, redo: 0, scope: 0, other: 0 });
const r1 = (x: number) => Math.round(x * 10) / 10;

export function measure(sessions: Session[], outcomeOf?: OutcomeOf): Measures {
  const byOutcome = new Map<Outcome, { sessions: number; corrections: number }>();
  const byCategory = zero(), costByCategory = zero();
  let total = 0, minutes = 0;
  const usageInWindows: Usage[] = [];
  const ruleSessions = new Map<CorrectionTheme, Map<string, number>>(); // rule -> session -> first time stated there
  const ruleCorrections: { rule: CorrectionTheme; session: string; at: number }[] = [];
  const proj = new Map<string, { sessions: number; corrections: number }>();
  const week = new Map<string, { sessions: Set<string>; corrections: number }>();

  for (const s of sessions) {
    const p = proj.get(s.project) ?? { sessions: 0, corrections: 0 };
    p.sessions++;
    proj.set(s.project, p);
    const w0 = isoWeek(s.turns[0].at);
    const w = week.get(w0) ?? { sessions: new Set(), corrections: 0 };
    w.sessions.add(s.id);
    week.set(w0, w);

    // Every statement of a known rule, in any human turn (long dispatched prompts included).
    for (const t of s.turns) for (const theme of detectRules(t.detectText)) {
      const m = ruleSessions.get(theme) ?? new Map();
      if (!m.has(s.id) || m.get(s.id)! > t.at) m.set(s.id, t.at);
      ruleSessions.set(theme, m);
    }

    const cs = corrections(s);
    const isCorr = new Set(cs.map((c) => c.index));
    if (outcomeOf) {
      const o = outcomeOf(s);
      const e = byOutcome.get(o) ?? { sessions: 0, corrections: 0 };
      e.sessions++; e.corrections += cs.length;
      byOutcome.set(o, e);
    }
    for (const c of cs) {
      total++; byCategory[c.category]++; p.corrections++;
      const wk = week.get(isoWeek(c.at)) ?? { sessions: new Set(), corrections: 0 };
      wk.corrections++;
      week.set(isoWeek(c.at), wk);
      let j = c.index + 1;
      while (j < s.turns.length && isCorr.has(j)) j++;
      const end = j < s.turns.length ? s.turns[j].at : (s.activity.at(-1) ?? c.at);
      // Consecutive corrections share one window: count it once, at the first of them.
      if (!isCorr.has(c.index - 1)) {
        const m = activeMinutes(s.activity, c.at, end);
        minutes += m; costByCategory[c.category] += m;
        usageInWindows.push(...s.usage.filter((u) => u.at >= c.at && u.at < end));
      }
      for (const rule of c.rules) ruleCorrections.push({ rule, session: s.id, at: c.at });
    }
  }

  const rules: Measures["rules"] = [];
  for (const [rule, m] of ruleSessions) {
    if (m.size < 3) continue;
    const first = Math.min(...m.values());
    const breaks = ruleCorrections.filter((c) => c.rule === rule && c.at > first && !(m.get(c.session) === c.at && c.at === first));
    rules.push({ rule, label: RULE_LABELS[rule], sessions: m.size, laterBreaks: breaks.length, breakSessions: [...new Set(breaks.map((b) => b.session))] });
  }
  rules.sort((a, b) => b.laterBreaks - a.laterBreaks || b.sessions - a.sessions);

  const c = cost(usageInWindows);
  return {
    sessions: sessions.length,
    corrections: total,
    byCategory,
    cost: {
      minutes: Math.round(minutes),
      correctionsCounted: total,
      tokens: c.tokens,
      newWorkDollarsAtList: c.newWorkDollarsAtList,
      usageRecordsPriced: c.priced,
      note: "Estimate: active time from each correction to your next non-correction message, idle gaps over 5 minutes dropped. Tokens come from the agent's own usage records in those windows; cache reads are context re-read, not new work. Dollars, where shown, are uncached input plus output at list API prices, not what you paid.",
    },
    costByCategory: Object.fromEntries(Object.entries(costByCategory).map(([k, v]) => [k, Math.round(v)])) as Record<CorrectionCategory, number>,
    rules,
    byProject: [...proj].map(([project, v]) => ({ project, ...v, perSession: r1(v.corrections / v.sessions) })).sort((a, b) => b.corrections - a.corrections),
    byWeek: [...week].map(([wk, v]) => ({ week: wk, sessions: v.sessions.size, corrections: v.corrections, perSession: r1(v.corrections / Math.max(1, v.sessions.size)) })).sort((a, b) => a.week.localeCompare(b.week)),
    outcomes: outcomeOf ? [...byOutcome].map(([outcome, v]) => ({ outcome, ...v, perSession: r1(v.corrections / v.sessions) })).sort((a, b) => b.sessions - a.sessions) : null,
  };
}
