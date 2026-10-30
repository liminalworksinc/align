import type { PolicyPrincipal } from "./policy";

// Agent activity toward a goal (PORT-003), over the last 14 days: derived from bindings (epochs), usage times and work
// signals, never from what agents or people wrote. Counts are for every reader of the goal; the detail (repo-relative
// file paths and the reader's own sessions) only for the goal's owner, members and leads of its team, and workspace
// owners. Never prompts, replies, task labels, commit subjects, tokens or cost.
//
// PORT-001 declares the shapes and signatures; PORT-003 fills them in.

export const ACTIVITY_WINDOW_DAYS = 14;

export interface GoalActivity {
  /** Distinct sessions with an epoch bound to (or governed by) the goal that overlaps the window. */
  sessions: number;
  /** Of those: shared, agent not stopped, and active (usage or epoch start) in the last 90 minutes. */
  active_now: number;
  by_harness: { "claude-code": number; codex: number };
  /** The latest usage, epoch start or work signal on the goal, or null. */
  last_activity_at: string | null;
  /** Only for the readers named above, else null. */
  detail: {
    /** The top 4 repo-relative paths of unexpired work signals on the goal. */
    files: string[];
    /** Distinct path hashes that have no path. */
    files_hidden: number;
    /** The reader's own sessions bound to the goal. */
    mine: { session_key: string; harness: "claude-code" | "codex"; state: string; last_activity_at: string | null }[];
  } | null;
}

/** One goal's activity in align_get_goal_activity, with the goal it is for. */
export type GoalActivityItem = GoalActivity & { goal: { id: string; title: string; team: { id: string; name: string } | null } };

const EMPTY: GoalActivity = { sessions: 0, active_now: 0, by_harness: { "claude-code": 0, codex: 0 }, last_activity_at: null, detail: null };

/** One goal's activity for a reader of the goal (404 V2Error when they can't read it). */
export function goalActivity(pp: PolicyPrincipal, goalId: string): GoalActivity {
  void pp;
  void goalId;
  return { ...EMPTY, by_harness: { ...EMPTY.by_harness } };
}

/** Every readable active goal's activity (those with detail first), and how many of the reader's own shared sessions
 *  have no goal in their current epoch (`unbound`). */
export function goalsActivity(pp: PolicyPrincipal): { goals: GoalActivityItem[]; unbound: number } {
  void pp;
  return { goals: [], unbound: 0 };
}
