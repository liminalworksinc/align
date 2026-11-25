// Standing-rule detection for the local audit (release B, spec 2.9): which of a known set of operator rules a turn
// states or enforces.
//
// PORTED VERBATIM FROM liminal-desktop closure/ingest/agent-corrections.ts at commit 41af8850: lines 48 to 55 (the
// rule list and its type) and 94 to 181 (the DIRECTIVE gate, corrective cues, the rule patterns and the sentence-level detector).
// Not imported across repos. The five rules began as one operator's observed corrections; they are generic enough
// to name across operators (attribution, outbound without a go, em dashes, ground on supplied sources, plan means
// plan). The labels people see are in RULE_LABELS below, not in the ported block.
//
// Local only: not exported from src/index.ts.

export const CORRECTION_THEMES = [
  "no-ai-attribution",
  "no-unapproved-outbound",
  "no-em-dash",
  "ground-on-supplied-sources",
  "plan-means-plan",
] as const;
export type CorrectionTheme = (typeof CORRECTION_THEMES)[number];

// Detection (pure)
// ---------------------------------------------------------------------------

// ADAPTED FROM: liminal-agents-v1/lib/operator/judgment-bar.ts (DIRECTIVE):
// the WIDE "operator is correcting or directing" opener, verbatim pattern.
// Here it gates the softer theme patterns (those flagged `gated`) so a bare
// mention ("the doc I pasted earlier has the numbers") does not count unless
// the sentence reads as a directive or a pushback.
export const DIRECTIVE =
  /^(no\b|nope|don'?t|do not|stop|actually|instead|rather|not (that|what|the)|that'?s not|that doesn'?t|i want|i need|i'?d|you (should|need|must)|make sure|never|always|use (the|a|an)?\b|avoid|prefer|keep it|less|more\b|why (are|did|is|would)|just\b|forget)/i;
/** Corrective cues anywhere in a sentence (the DIRECTIVE regex is anchored). */
const CORRECTIVE_CUE =
  /\b(why|didn'?t|did you|you (ignored|missed|forgot|skipped)|again|instead|please|use|read|stick to|based on|ground|follow|look at|go off)\b/i;

const NEG = String.raw`(?:no|not|don'?t|dont|do not|never|without|remove|omit|strip|drop|delete|stop|avoid)`;
const AI = String.raw`(?:ai|claude|codex|anthropic|openai|llms?|gpt|chatgpt|copilot)`;
const SHIP = String.raw`(?:commit|push|post|send|publish|launch|upload|deploy|merge|submit|email|tweet)`;
const SPAN = String.raw`[^.!?\n]{0,60}`;

interface ThemePattern {
  readonly theme: CorrectionTheme;
  readonly name: string;
  readonly re: RegExp;
  /** true when the sentence must also read as a directive / pushback. */
  readonly gated?: boolean;
}

export const THEME_PATTERNS: readonly ThemePattern[] = [
  // (a) no AI attribution / no company or project names in commits
  { theme: "no-ai-attribution", name: "coauthored-trailer", re: new RegExp(String.raw`\b${NEG}\b${SPAN}\bco-?authored(?:-by)?\b|\bco-?authored(?:-by)?\b${SPAN}\b(?:remove|omit|strip|drop|delete|never|no)\b`, "i") },
  { theme: "no-ai-attribution", name: "ai-attribution", re: new RegExp(String.raw`\b${NEG}\b${SPAN}\b${AI}\b[^.!?\n]{0,30}\b(?:attribution|mentions?|credit|co-?authors?|signatures?|trailers?)\b`, "i") },
  { theme: "no-ai-attribution", name: "no-mention-of-ai", re: new RegExp(String.raw`\bno mentions? of ${AI}\b`, "i") },
  { theme: "no-ai-attribution", name: "dont-out-the-tool", re: new RegExp(String.raw`\b(?:don'?t|dont|do not|never)\s+out\s+(?:the\s+)?${AI}\b`, "i") },
  { theme: "no-ai-attribution", name: "ai-in-commits", re: new RegExp(String.raw`\b${NEG}\b[^.!?\n]{0,40}\b${AI}\b[^.!?\n]{0,40}\b(?:in|from|to)\s+(?:the\s+|my\s+|any\s+)?(?:commits?|commit messages?|prs?|pull requests?|git history)\b`, "i") },
  { theme: "no-ai-attribution", name: "names-in-commits", re: new RegExp(String.raw`\b${NEG}\b[^.!?\n]{0,40}\b(?:company|project|client|employer)\s+names?\b[^.!?\n]{0,40}\b(?:commits?|commit messages?|prs?|pull requests?|history)\b`, "i") },

  // (b) no unapproved outbound
  { theme: "no-unapproved-outbound", name: "ship-without-go", re: new RegExp(String.raw`\b(?:don'?t|dont|do not|never|no)\s+(?:\w+\s+){0,2}?${SHIP}\w*\b${SPAN}\b(?:without|until|unless|before)\b[^.!?\n]{0,40}\b(?:ask\w*|approv\w*|go|go-ahead|ok|okay|confirm\w*|permission|say so|i say|review\w*|check\w*)\b`, "i") },
  { theme: "no-unapproved-outbound", name: "ship-not-yet", re: new RegExp(String.raw`\b(?:don'?t|dont|do not|never)\s+(?:\w+\s+){0,2}?${SHIP}\w*\b[^.!?\n]{0,40}\byet\b`, "i") },
  { theme: "no-unapproved-outbound", name: "dont-ship-it", re: new RegExp(String.raw`\b(?:don'?t|dont|do not)\s+${SHIP}\w*\s+(?:anything|it|this|that|them|the repo|it up|the (?:branch|pr|email|message|post|draft))\b`, "i") },
  { theme: "no-unapproved-outbound", name: "wait-for-go", re: /\b(?:wait (?:for|until) (?:my|i give(?: you)? the|i say)\b[^.!?\n]{0,20}\b(?:go|ok|okay|approval|green ?light|so)\b|(?:ask|check with) me (?:first|before))/i },

  // (c) no em dashes / AI-slop register
  { theme: "no-em-dash", name: "no-em-dash", re: new RegExp(String.raw`\b(?:${NEG}|zero|kill|replace)\b[^.!?\n]{0,40}\bem[- ]?dash(?:es)?\b|\bem[- ]?dash(?:es)?\b[^.!?\n]{0,30}\b(?:banned|forbidden|not allowed|again)\b|\bno (?:em )?dashes\b`, "i") },
  { theme: "no-em-dash", name: "ai-watermark", re: /\b(?:ai|llm)[- ]?watermarks?\b/i },
  { theme: "no-em-dash", name: "ai-slop", re: /\b(?:no-ai-slop|ai[- ]slop|sounds? like (?:an? )?ai|reads? like (?:an? )?ai)\b/i, gated: true },

  // (d) ground on supplied sources
  { theme: "ground-on-supplied-sources", name: "the-doc-i-gave", re: /\b(?:the|my|this|that)\s+(?:doc|document|docs|writeup|write-up|notes|spec|brief|draft|file|text|article|paper|report|outline|context|screenshot|link|research|page)s?\s+(?:that\s+|which\s+)?i\s+(?:just\s+|already\s+)?(?:pasted|gave you|sent you|shared|provided|attached|linked|dropped|uploaded)\b/i, gated: true },
  { theme: "ground-on-supplied-sources", name: "what-i-pasted", re: /\bwhat i (?:just |already )?(?:pasted|gave you|sent you|shared)\b/i, gated: true },

  // (e) plan means plan
  { theme: "plan-means-plan", name: "dont-implement", re: /\b(?:don'?t|dont|do not)\s+(?:implement|code|build|execute|change|edit|touch|modify|write (?:any )?code)\w*\b[^.!?\n]{0,60}\b(?:plan|yet|first)\b|\b(?:don'?t|dont|do not) implement anything\b/i },
  { theme: "plan-means-plan", name: "just-the-plan", re: /\b(?:just|only)\s+(?:write|make|draft|give me|do|put together|come up with)\s+(?:me\s+)?(?:a|the|an)\s+(?:\w+\s+)?plan\b|\bplan only\b|\bonly (?:a|the) plan\b|\bi (?:said|asked for|wanted) (?:a|the|just a) plan\b/i },
];

export interface ThemeHit {
  readonly theme: CorrectionTheme;
  /** pattern NAMES that fired (never the matched text). */
  readonly patterns: readonly string[];
}

/** Sentences of a cleaned turn (the patterns never cross a sentence). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Deterministic theme detection over one cleaned human turn. */
export function detectCorrectionThemes(text: string): ThemeHit[] {
  const byTheme = new Map<CorrectionTheme, Set<string>>();
  for (const sentence of sentences(text)) {
    const directive = DIRECTIVE.test(sentence) || CORRECTIVE_CUE.test(sentence);
    for (const pattern of THEME_PATTERNS) {
      if (pattern.gated === true && !directive) continue;
      if (!pattern.re.test(sentence)) continue;
      const names = byTheme.get(pattern.theme) ?? new Set<string>();
      names.add(pattern.name);
      byTheme.set(pattern.theme, names);
    }
  }
  return CORRECTION_THEMES.filter((theme) => byTheme.has(theme)).map((theme) => ({
    theme,
    patterns: [...byTheme.get(theme)!].sort(),
  }));
}

// ---------------------------------------------------------------------------
// Additions for the audit (new here, not ported)
// ---------------------------------------------------------------------------

/** Pasted blocks whose closing tag carries an id (`</pasted_content id="…">`), which the ported
 *  stripPastedMaterial (`<\/pasted_content>`) misses, and unclosed ones. Found Nov 24 on the founder's own logs:
 *  pasted status reports were read as her restating rules. The same miss exists upstream in liminal-desktop. */
export function stripPasteBlocks(text: string): string {
  return text
    .replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content\b[^>]*>/gi, " ")
    .replace(/<pasted_content\b[^>]*>[\s\S]*$/i, " ")
    .trim();
}

/** Short phrasings of the outbound rule the ported patterns miss ("no send", "just draft", "draft only"). */
const OUTBOUND_SHORT = /\b(?:no send|don'?t send|dont send|just (?:a )?draft|draft only|only (?:a )?draft|did (?:u|you) send)\b/i;

/** The rules a turn states or enforces: the ported detector over the turn with paste blocks removed, plus the
 *  short outbound phrasings above. */
export function detectRules(text: string): CorrectionTheme[] {
  const clean = stripPasteBlocks(text);
  const themes = new Set(detectCorrectionThemes(clean).map((h) => h.theme));
  if (OUTBOUND_SHORT.test(clean)) themes.add("no-unapproved-outbound");
  return CORRECTION_THEMES.filter((t) => themes.has(t));
}

/** Short, plain labels for the report and the preview (spec 2.9: rule labels, never the person's raw words). */
export const RULE_LABELS: Readonly<Record<CorrectionTheme, string>> = {
  "no-ai-attribution": "keep AI attribution out of commits and PRs",
  "no-unapproved-outbound": "don't send, post or push without a go",
  "no-em-dash": "no em dashes or AI-sounding writing",
  "ground-on-supplied-sources": "work from the sources I gave you",
  "plan-means-plan": "a plan means a plan, not an implementation",
};
