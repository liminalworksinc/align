// The agent audit's data shapes (specs/align/agent-audit.md §2). Pure types and small guards; no network, no storage.

export type Used = "yes" | "no" | "unknown";

/** One change the person asked the agent for. `category` is normalized (category.ts); `note` is the person's words. */
export interface Change {
  category: string;
  note: string;
}

/** One run of the agent, as parsed from the pasted prompt output. Minutes are the person's or the agent's estimate (R5). */
export interface Run {
  id: string;
  date: string;
  asked: string;
  sources: string[];
  changes: Change[];
  minutes: number | null;
  used: Used;
}

/** What the paste said about the agent besides its runs (prompt v2 sections 1, 3 and 4). All optional. */
export interface PasteContext {
  purpose: string | null;
  instructions: string | null;
  mostCorrected: string[];
  wish: string | null;
}

export interface Parsed {
  runs: Run[];
  context: PasteContext;
  /** Lines the parser could not place, kept so the page can show what was skipped instead of dropping it silently. */
  skipped: string[];
}

export type FindingKind = "costs_time" | "caught_by_person" | "working";

/** One finding in the model's draft. `category` is required for costs_time and names the category it counts. */
export interface Finding {
  kind: FindingKind;
  claim: string;
  runs: string[];
  category?: string | null;
  /** caught_by_person only: "external" when the mistake was an action with an effect outside the session (send,
   *  publish, delete, deploy, pay, merge); otherwise "internal". */
  risk?: "external" | "internal" | null;
}

/** The model's draft (spec §3.1 step 4). Prose only: every number is filled in by code from placeholders (R1). */
export interface Draft {
  purpose: string;
  why: Finding[];
  /** What the recommendation addresses (founder ruling Nov 24: "caught mistakes first", ranked by risk):
   *  "caught", the caught_by_person finding (index in `why`) with the highest risk, then the most runs; otherwise
   *  "top_category" when one category holds at least 40% of changes; otherwise "none". */
  try_this: { text: string; exact_text?: string | null; category: string | null; addresses: "top_category" | "caught" | "none"; finding: number | null };
  cannot_tell: string[];
  how_you_will_know: string;
}

export const MIN_RUNS = 3;
export const THIN_BELOW = 6; // 3 to 5 runs: "thin evidence", no percentages
export const MAX_CATEGORIES = 5;
