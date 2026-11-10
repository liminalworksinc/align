// Caller-owned goal activity types and explicit resource bindings.
import { all, get } from "./db";
import { visibleGoals, visibleGoal, type GoalRow } from "./goals";
import { activityEvidence, type EvidenceClass } from "./home-core.mts";
import { nowIso } from "./ids";
import type { PolicyPrincipal } from "./policy";
import { create_goal_activity } from "../native/.bindings/server_goal_activity.js";

export interface GoalActivity {
    /** Distinct sessions with an epoch bound to (or governed by) the goal that overlaps the window. */
    sessions: number;
    /** Of those: shared, agent not stopped, and active (usage or epoch start) in the last 90 minutes. */
    active_now: number;
    by_harness: {
        "claude-code": number;
        codex: number;
    };
    /** The latest usage, epoch start or work signal on the goal, or null. */
    last_activity_at: string | null;
    /** The checklist's §E2: all of the above comes from the align CLI on developers' machines, so agent_reported, or
     *  not_observed when there is none (lib/v2/home-core.mts activityEvidence). Never a delivery receipt. */
    evidence_class: EvidenceClass;
    /** Only for the readers named above, else null. */
    detail: {
        /** The top 4 repo-relative paths of unexpired work signals on the goal. */
        files: string[];
        /** Distinct path hashes that have no path. */
        files_hidden: number;
        /** The reader's own sessions bound to the goal. */
        mine: {
            session_key: string;
            harness: "claude-code" | "codex";
            state: string;
            last_activity_at: string | null;
        }[];
    } | null;
}

/** One goal's activity in align_get_goal_activity, with the goal it is for. */
export type GoalActivityItem = GoalActivity & {
    goal: {
        id: string;
        title: string;
        team: {
            id: string;
            name: string;
        } | null;
    };
};

interface SessionLine {
    session_key: string;
    user_id: string;
    harness: "claude-code" | "codex";
    state: string;
    agent_stopped: number;
    governing_goal_id: string | null;
    open_goal: string | null;
}

interface GoalActivityRuntime {
  ACTIVITY_WINDOW_DAYS: 14;
  seesActivityDetail: (pp: PolicyPrincipal, g: GoalRow) => boolean;
  goalActivity: (pp: PolicyPrincipal, goalId: string) => GoalActivity;
  goalsActivity: (pp: PolicyPrincipal) => { goals: GoalActivityItem[]; unbound: number; };
}
const goalActivityService = create_goal_activity({
  all: (...args: Parameters<typeof all>) => all(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  visibleGoals: (...args: Parameters<typeof visibleGoals>) => visibleGoals(...args),
  visibleGoal: (...args: Parameters<typeof visibleGoal>) => visibleGoal(...args),
  activityEvidence: (...args: Parameters<typeof activityEvidence>) => activityEvidence(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  readDate: () => Date,
}) as unknown as GoalActivityRuntime;

export const ACTIVITY_WINDOW_DAYS = goalActivityService.ACTIVITY_WINDOW_DAYS;
export const seesActivityDetail = (pp: PolicyPrincipal, g: GoalRow): boolean => (0, goalActivityService.seesActivityDetail)(pp, g);
/** One goal's activity for a reader of the goal (404 V2Error when they can't read it). */
export function goalActivity(pp: PolicyPrincipal, goalId: string): GoalActivity {
    return (0, goalActivityService.goalActivity)(pp, goalId);
}
/** Every readable active goal's activity (those with detail first, then the most recent activity), and how many of
 *  the reader's own shared sessions have no goal in their current epoch (`unbound`). */
export function goalsActivity(pp: PolicyPrincipal): {
    goals: GoalActivityItem[];
    unbound: number;
} {
    return (0, goalActivityService.goalsActivity)(pp);
}
