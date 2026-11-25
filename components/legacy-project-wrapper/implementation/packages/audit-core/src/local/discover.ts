// Discovering the rules a person keeps restating, from their own words (release B, spec 2.9, coordinator note Nov 24):
// a fixed rule list only finds rules it already knows. Short directive sentences from human turns (the ported
// DIRECTIVE gate isolates them) are normalized and grouped by token overlap across sessions; a group seen in three or
// more sessions is a restated rule, whatever its topic. The fixed list in rules.ts only labels groups it recognizes.
// Local only: not exported from src/index.ts.

import type { Session } from "./read.ts";
import { DIRECTIVE, RULE_LABELS, detectRules, stripPasteBlocks } from "./rules.ts";

// Imperatives that open an instruction but that DIRECTIVE (written for corrections) does not list.
const IMPERATIVE = /^(?:always|never|check|verify|confirm|make sure|ensure|keep|don'?t|dont|do not|no\b|only|stop|avoid|use|read|ask|wait|write|draft|show|tell|say|cite|include|lead with|start with)\b/i;

const STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "in", "on", "for", "it", "this", "that", "is", "are", "be", "me", "my", "i", "you", "u", "your", "we", "with", "at", "as", "so", "if", "then", "just", "please", "pls", "plz", "n", "all", "any", "from", "by", "into", "about", "what", "when", "before", "after", "up", "out", "its", "has", "have", "do", "will", "can", "should", "would", "also", "too", "very", "really", "here", "there", "them", "they", "he", "she", "him", "her", "our", "us"]);
// Negation is part of a rule's meaning: "send" and "don't send" are opposite rules.
const NEG = /\b(?:don'?t|dont|do not|never|no|not|stop|avoid|without)\b/i;

// Crude but consistent: "quote", "quoted", "quotes" and "quoting" all reduce to "quot".
const stem = (w: string) => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, "").replace(/e$/, "") : w) || w;

/** The content tokens of a directive sentence, with a NOT marker when it is a prohibition. */
export function ruleTokens(sentence: string): Set<string> {
  const words = sentence.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const tokens = new Set(words.filter((w) => !STOP.has(w) && !/^(?:dont|do|not|never|no|stop|avoid|without)$/.test(w) && w.length > 2).map(stem));
  if (NEG.test(sentence)) tokens.add("NOT");
  return tokens;
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

/** Overlap of the smaller set: a correction ("nope, you quoted a refund amount again") carries extra words that dilute
 *  Jaccard, but still contains the rule's core. Used for breaks only, not for grouping statements. */
const containment = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  const core = [...a].filter((x) => x !== "NOT");
  for (const x of core) if (b.has(x)) inter++;
  return inter / Math.max(1, Math.min(core.length, [...b].filter((x) => x !== "NOT").length));
};
export const BREAK_OVERLAP = 0.6;

const SENTENCES = (t: string) => t.split(/(?<=[.!?])\s+|\n+|;\s+/).map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);

/** A standing rule, not a one-off task: a prohibition, or an always / never / make sure / before / only / until
 *  clause. "Check my emails" is a task and does not count; "don't edit .literate" and "verify before merging" do. */
const RULE_SHAPED = /^(?:always|never|make sure|ensure|only|until|before\b)|\bbefore (?:any|anything|you|merging|sending|claiming|acting|editing|you act)\b|\b(?:don'?t|dont|do not|never|no)\b/i;

/** Generic working-habit families: the same discipline asked for about different objects, which word overlap cannot
 *  group. A sentence that opens with the family's verb joins it, whatever its object. Labels are the person-facing
 *  names. Not person-specific: these are habits operators ask of any agent. */
export const FAMILIES: { label: string; re: RegExp; breakRe: RegExp }[] = [
  {
    label: "verify before relying on it",
    re: /^(?:before anything:\s*)?(?:verify|confirm|double[- ]?check|check (?:that|whether|if)|cite)\b/i,
    breakRe: /\b(?:verif(?:y|ied)|did (?:u|you) (?:check|verify|confirm)|double[- ]?check|is (?:that|this) (?:true|right|verified)|unverified|not verified|source\?)\b/i,
  },
  {
    label: "ask before acting",
    re: /^(?:ask|check with) me (?:first|before)\b|\bwait for my (?:go|ok|word)\b/i,
    breakRe: /\b(?:did (?:u|you) (?:send|push|merge|post)|without asking|i didn'?t (?:say|ask)|who told (?:u|you))\b/i,
  },
];

/** Directive sentences of a turn worth grouping: 3 to 20 words, rule-shaped (or in a habit family), with at least two
 *  content tokens besides NOT. */
export function directives(text: string): { sentence: string; tokens: Set<string>; family: string | null }[] {
  const out: { sentence: string; tokens: Set<string>; family: string | null }[] = [];
  for (const s of SENTENCES(stripPasteBlocks(text))) {
    const words = s.split(/\s+/).length;
    if (words < 3 || words > 20) continue;
    const family = FAMILIES.find((f) => f.re.test(s))?.label ?? null;
    if (!family && !((DIRECTIVE.test(s) || IMPERATIVE.test(s)) && RULE_SHAPED.test(s))) continue;
    const tokens = ruleTokens(s);
    if (!family && [...tokens].filter((t) => t !== "NOT").length < 2) continue;
    out.push({ sentence: s, tokens, family });
  }
  return out;
}

export const SIMILAR = 0.5;
export const MIN_SESSIONS = 3;

export interface DiscoveredRule {
  /** A short label: a known rule's label when the group matches one, else the group's shortest sentence, clipped. */
  label: string;
  known: boolean;
  sessions: number;
  statements: number;
  /** Corrections (turns that open by rejecting or redirecting) matching the rule after its first statement. */
  laterBreaks: number;
  breakSessions: string[];
}

interface Group { tokens: Set<string>; family: string | null; sentences: string[]; sessions: Map<string, number>; statements: number }

/** Group directive sentences across sessions. `isCorrection(sessionId, turnIndex)` marks the turns that count as
 *  breaks (from measures.ts), so a rule's later corrections are counted separately from its statements. */
export function discoverRules(sessions: Session[], isCorrection: (sessionId: string, index: number) => boolean): DiscoveredRule[] {
  const groups: Group[] = [];
  const hits: { group: Group; session: string; at: number; correction: boolean }[] = [];
  for (const s of sessions) {
    s.turns.forEach((t, i) => {
      for (const d of directives(t.detectText)) {
        let best: Group | null = null, score = 0;
        if (d.family) best = groups.find((g) => g.family === d.family) ?? null, score = best ? 1 : 0;
        else for (const g of groups) { if (g.family) continue; const j = jaccard(d.tokens, g.tokens); if (j > score) { score = j; best = g; } }
        if (!best || score < SIMILAR) { best = { tokens: new Set(d.tokens), family: d.family, sentences: [], sessions: new Map(), statements: 0 }; groups.push(best); }
        best.sentences.push(d.sentence);
        best.statements++;
        if (!best.sessions.has(s.id) || best.sessions.get(s.id)! > t.at) best.sessions.set(s.id, t.at);
        hits.push({ group: best, session: s.id, at: t.at, correction: false });
      }
    });
  }
  // Breaks: a correction that touches a rule, whether or not it restates it. Family rules by the family's break
  // words anywhere in the correction; other rules by token overlap with any sentence of the correction.
  for (const s of sessions) {
    s.turns.forEach((t, i) => {
      if (!isCorrection(s.id, i)) return;
      const text = stripPasteBlocks(t.detectText);
      const sentenceTokens = SENTENCES(text).map(ruleTokens);
      for (const g of groups) {
        const touches = g.family
          ? FAMILIES.find((f) => f.label === g.family)!.breakRe.test(text)
          : sentenceTokens.some((tk) => containment(g.tokens, tk) >= BREAK_OVERLAP);
        if (touches) hits.push({ group: g, session: s.id, at: t.at, correction: true });
      }
    });
  }
  const out: DiscoveredRule[] = [];
  for (const g of groups) {
    if (g.sessions.size < MIN_SESSIONS) continue;
    const first = Math.min(...g.sessions.values());
    const breaks = hits.filter((h) => h.group === g && h.correction && h.at > first);
    const known = [...new Set(g.sentences.flatMap((s) => detectRules(s)))];
    const shortest = [...g.sentences].sort((a, b) => a.length - b.length)[0];
    out.push({
      label: g.family ?? (known.length ? RULE_LABELS[known[0]] : shortest.length > 70 ? `${shortest.slice(0, 67)}...` : shortest),
      known: !!g.family || known.length > 0,
      sessions: g.sessions.size,
      statements: g.statements,
      laterBreaks: breaks.length,
      breakSessions: [...new Set(breaks.map((b) => b.session))],
    });
  }
  return out.sort((a, b) => b.laterBreaks - a.laterBreaks || b.sessions - a.sessions);
}
