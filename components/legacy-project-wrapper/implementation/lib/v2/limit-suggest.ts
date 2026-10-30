import { badRequest, forbidden, V2Error } from "./errors";
import { cleanText, isDay, limitsOf, LIMIT_SOURCE_TITLE_MAX, LIMIT_TEXT_MAX, type Limit, type LimitSource, type LimitType } from "./goal-limits";
import { goalObj, goalRow, visibleGoals, type GoalRow, type Measure } from "./goals";
import { takeAll } from "./limits";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { type Body } from "./validate";

// Suggesting limits from pasted meeting notes (PORT-002), ported from v1 lib/limits.ts (sentences, limitType,
// keyWords, sameAs, teamFor) with plain sentence rules and no model. It stores nothing and audits nothing: it returns,
// per goal, the rule-shaped sentences that are about that goal, and the person turns them into a new version (the
// goal's owner) or a change request (anyone else), so a limit is confirmed only by the goal's approval set.
// Only active goals the caller can read are candidates: a goal they can't read is never named and its words are never
// used to place a sentence.

export const NOTES_MAX = 20_000;
const SENTENCES_MAX = 200;
const QUOTE_MAX = 200;
/** Suggestions returned for one goal; more sentences about it count as dropped. */
const PER_GOAL_MAX = 10;
/** 20 a minute per person and 120 an hour per workspace. */
const PER_PERSON = { max: 20, windowMs: 60_000 };
const PER_WORKSPACE = { max: 120, windowMs: 3_600_000 };

// Sentence rules, checked in this order. A limit is a rule about the work, so only rule-shaped wording counts:
// "must", "has to", "never", "out of scope", "cannot exceed"; a plain "can't" ("I can't find it") does not.
const OUT_OF_SCOPE = /\b(out of scope|out-of-scope|not in scope|outside (the|our|this) scope|not part of (the|this|our) (goal|project|scope|demo|work))\b/i;
const MUST_NOT =
  /\b(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|cannot (all|be|exceed|go|use|run)|can not (all|be)|no more than|at most)\b/i;
const MUST = /\b(must|has to|have to|needs to|need to|should|is required to|are required to|at least|only use)\b/i;

const clip = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

/** Sentences of free text: on . ! ? before a capital (not after "e.g." or "vs."), newlines, "; " and bullets. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+|;\s+|\s+[-*•]\s+/)
    .map((x) => cleanText(x.replace(/^[-*•\d.)\s]+/, "")))
    .filter(Boolean);
}

/** The kind of limit a sentence states, or null: questions and sentences under 4 or over 45 words never count. */
export function limitType(sentence: string): LimitType | null {
  if (sentence.endsWith("?")) return null;
  const words = sentence.split(/\s+/).length;
  if (words < 4 || words > 45) return null;
  if (OUT_OF_SCOPE.test(sentence)) return "out_of_scope";
  // "Ensure all three don't fit" carries its own "not": as a "must not" it would read as a double negative.
  if (/\b(ensure|make sure)\b|^(target|aim for)\b/i.test(sentence)) return "must";
  if (MUST_NOT.test(sentence)) return "must_not";
  if (MUST.test(sentence)) return "must";
  return null;
}

const KEY_STOP = new Set(
  "the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don".split(" "),
);

/** Words that carry a sentence's meaning, for matching it against goals and limits: "gpu", "fit". */
export function keyWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !KEY_STOP.has(w)) out.add(w);
  return out;
}

const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(1, Math.min(a.size, b.size));
};

/** The limit in `limits` that says mostly the same words (overlap at least 0.6), if any. The type is not compared:
 *  notes say one rule both ways ("ensure all three don't fit", "all three must not fit"). */
export function sameAs<T extends { text: string }>(limits: T[], text: string): T | undefined {
  const k = keyWords(text);
  return limits.find((l) => overlap(keyWords(l.text), k) >= 0.6);
}

/** A goal's own words: its title and its measures. */
const goalWords = (g: GoalRow) => keyWords([g.title, ...(JSON.parse(g.measures_json) as Measure[]).map((m) => m.text)].join(" "));

/**
 * The goal a sentence is about. Each goal word the sentence uses counts 1 divided by how many goals use it, so a word
 * only one goal has decides more than one they share. A score under 1 is no goal. A tie goes to `prefer` when it is
 * one of the tied goals (the goal page the notes were pasted on); otherwise nobody.
 */
export function goalFor(goals: GoalRow[], sentence: string, prefer: string | null): GoalRow | null {
  const termsOf = new Map(goals.map((g) => [g, goalWords(g)]));
  const seen = new Map<string, number>();
  for (const set of termsOf.values()) for (const t of set) seen.set(t, (seen.get(t) ?? 0) + 1);
  const words = keyWords(sentence);
  const said = (t: string) => words.has(t) || [...words].some((w) => w.length > t.length && w.startsWith(t) && t.length >= 4); // "spec" in "specs"
  const scored = [...termsOf].map(([g, set]) => ({ g, n: [...set].filter(said).reduce((sum, t) => sum + 1 / seen.get(t)!, 0) })).sort((a, b) => b.n - a.n);
  if (!scored.length || scored[0].n < 1) return null;
  const tied = scored.filter((x) => Math.abs(x.n - scored[0].n) < 1e-9).map((x) => x.g);
  if (tied.length === 1) return tied[0];
  return (prefer && tied.find((g) => g.id === prefer)) || null;
}

export interface LimitSuggestion {
  type: LimitType;
  /** The limit as it would be saved: the sentence without a note heading ("Goal: …"), capitalised, at most 160. */
  text: string;
  /** The sentence as it was written, at most 200 characters. */
  quote: string;
  source: LimitSource;
  /** The id of the goal's current limit that says mostly the same, or null. */
  already: string | null;
}
export interface GoalSuggestions {
  goal: { id: string; title: string; version: number };
  /** The caller owns the goal: they add these in a new version. */
  can_edit: boolean;
  /** The caller may propose these in a change request (anyone but the owner). */
  can_propose: boolean;
  limits: LimitSuggestion[];
}

/** POST /limits/suggest: `{notes, source:{title?, date}, prefer_goal_id?}`. Owners and members (viewers 403
 *  read_only); 20 a minute per person and 120 an hour per workspace (429 rate_limited). Stores nothing. */
export function suggestLimits(pp: PolicyPrincipal, b: Body): { suggestions: GoalSuggestions[]; dropped: number } {
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  if (typeof b.notes !== "string" || !b.notes.trim()) throw badRequest("notes is required: paste the notes, or type the limit");
  if (b.notes.length > NOTES_MAX) throw badRequest(`notes is too long (max ${NOTES_MAX} characters)`);
  const src = (b.source ?? {}) as Body;
  if (typeof src !== "object" || Array.isArray(src)) throw badRequest("source must be an object with title and date");
  if (src.title !== undefined && src.title !== null && typeof src.title !== "string") throw badRequest("source.title must be a string");
  const title = typeof src.title === "string" ? cleanText(src.title) : "";
  if (title.length > LIMIT_SOURCE_TITLE_MAX) throw badRequest(`source.title is too long (max ${LIMIT_SOURCE_TITLE_MAX} characters)`);
  if (!isDay(src.date)) throw badRequest("source.date must be a day like 2026-10-22");
  let prefer: string | null = null;
  if (b.prefer_goal_id !== undefined && b.prefer_goal_id !== null) {
    if (typeof b.prefer_goal_id !== "string") throw badRequest("prefer_goal_id must be a goal id");
    const g = goalRow(pp.wsId, b.prefer_goal_id);
    if (!g || !canReadGoal(pp, goalObj(g))) throw new V2Error(404, "not_found", "Not found");
    prefer = g.id;
  }
  if (!takeAll([{ key: `limit-suggest:${pp.userId}`, ...PER_PERSON }, { key: `limit-suggest-ws:${pp.wsId}`, ...PER_WORKSPACE }])) {
    throw new V2Error(429, "rate_limited", "Too many requests, try again later");
  }

  const goals = visibleGoals(pp).filter((g) => g.status === "active");
  const all = sentences(b.notes).slice(0, SENTENCES_MAX);
  // One sentence is a person typing a limit: it goes to the goal page it was typed on when it names no goal.
  const typed = all.length === 1;
  const source: LimitSource = { kind: typed ? "manual" : "meeting", title, date: src.date };
  const fallback = typed && prefer ? (goals.find((g) => g.id === prefer) ?? null) : null;
  const byGoal = new Map<string, { g: GoalRow; current: Limit[]; limits: LimitSuggestion[] }>();
  let dropped = 0;
  for (const sentence of all) {
    const type = limitType(sentence);
    if (!type) continue;
    const g = goalFor(goals, sentence, prefer) ?? fallback;
    if (!g) {
      dropped++;
      continue;
    }
    const entry = byGoal.get(g.id) ?? { g, current: limitsOf(g), limits: [] };
    byGoal.set(g.id, entry);
    // "Goal: ensure ..." and "Next steps: ..." are note headings, not part of the limit.
    const text = clip(sentence.replace(/^[A-Za-z][\w ]{0,24}:\s+/, "").replace(/^\w/, (c) => c.toUpperCase()), LIMIT_TEXT_MAX);
    // The same rule said twice in one paste is one suggestion.
    if (sameAs(entry.limits, text) || entry.limits.length >= PER_GOAL_MAX) {
      dropped++;
      continue;
    }
    entry.limits.push({ type, text, quote: clip(sentence, QUOTE_MAX), source, already: sameAs(entry.current, text)?.id ?? null });
  }
  const suggestions = [...byGoal.values()].map(({ g, limits }) => {
    const owns = g.owner_id === pp.userId;
    return { goal: { id: g.id, title: g.title, version: g.version }, can_edit: owns, can_propose: !owns, limits };
  });
  return { suggestions, dropped };
}
