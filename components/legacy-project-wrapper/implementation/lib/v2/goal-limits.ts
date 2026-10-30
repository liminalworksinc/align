// Limits on a goal (PORT-002): what work toward it must do, must not do, or leaves out of scope. They are goal
// content, like measures: stored on each version (limits_json on v2_goals and v2_goal_versions), confirmed by the
// goal's approval set through a new version or an approved change request, and delivered to agents only inside a saved
// version's snapshot. A limit names no person: who confirmed it is the version's created_by. (The rate limiter is
// lib/v2/limits.ts; this module is the goal's limits.)
//
// PORT-001 declares the shapes and signatures; PORT-002 fills them in.

export type LimitType = "must" | "must_not" | "out_of_scope";

/** Where a limit came from: a meeting (title and date) or written by hand. */
export interface LimitSource {
  kind: "meeting" | "manual";
  /** 0..120 characters ("" when written by hand). */
  title: string;
  /** YYYY-MM-DD. */
  date: string;
}

/** One limit of a goal version (at most 5 per version). */
export interface Limit {
  /** lim_<12 base32>, kept across versions while the limit is kept. */
  id: string;
  type: LimitType;
  /** 1..160 characters. */
  text: string;
  source: LimitSource | null;
}

/** The limits stored on a goal or goal version row. */
export function limitsOf(row: { limits_json: string }): Limit[] {
  return JSON.parse(row.limits_json) as Limit[];
}

/** Validate a request's `limits` (the list a person sends) against the previous version's limits: a sent id is kept
 *  only when `prev` has it, else the limit gets a new one. Throws a 400 V2Error naming the bad field. */
export function limitsIn(v: unknown, prev: Limit[]): Limit[] {
  void v;
  void prev;
  throw new Error("limitsIn is not implemented yet (PORT-002)");
}
