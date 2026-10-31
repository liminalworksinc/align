import { all, get } from "./db";
import { visibleGoals, visibleGoal, type GoalRow } from "./goals";
import { activityEvidence, type EvidenceClass } from "./home-core.mts";
import { nowIso } from "./ids";
import type { PolicyPrincipal } from "./policy";

// Agent activity toward a goal (PORT-003), over the last 14 days: derived from bindings (epochs), usage times and work
// signals, never from what agents or people wrote. Counts are for every reader of the goal; the detail (repo-relative
// file paths and the reader's own sessions) only for the goal's owner, members and leads of its team, and workspace
// owners. Never prompts, replies, task labels, commit subjects, tokens or cost: the queries below read only session
// keys, harnesses, states, times and work-signal paths.

export const ACTIVITY_WINDOW_DAYS = 14;
/** A session counts as active now when its latest usage or binding on the goal is this recent. */
const ACTIVE_MS = 90 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export interface GoalActivity {
  /** Distinct sessions with an epoch bound to (or governed by) the goal that overlaps the window. */
  sessions: number;
  /** Of those: shared, agent not stopped, and active (usage or epoch start) in the last 90 minutes. */
  active_now: number;
  by_harness: { "claude-code": number; codex: number };
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
    mine: { session_key: string; harness: "claude-code" | "codex"; state: string; last_activity_at: string | null }[];
  } | null;
}

/** One goal's activity in align_get_goal_activity, with the goal it is for. */
export type GoalActivityItem = GoalActivity & { goal: { id: string; title: string; team: { id: string; name: string } | null } };

interface SessionLine {
  session_key: string;
  user_id: string;
  harness: "claude-code" | "codex";
  state: string;
  agent_stopped: number;
  governing_goal_id: string | null;
  open_goal: string | null;
}

/** The goal's owner, members and leads of its team, and workspace owners see the detail. */
export const seesActivityDetail = (pp: PolicyPrincipal, g: GoalRow) => g.owner_id === pp.userId || (!!g.pod_id && pp.pods.has(g.pod_id)) || pp.wsRole === "owner";

const latest = (...ts: (string | null | undefined)[]) => ts.reduce<string | null>((m, t) => (t && (!m || t > m) ? t : m), null);

function activityOf(pp: PolicyPrincipal, g: GoalRow, now = Date.now()): GoalActivity {
  const ws = g.ws_id;
  const since = new Date(now - ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();
  const lines = all<SessionLine>(
    `SELECT s.session_key, s.user_id, s.harness, s.state, s.agent_stopped, s.governing_goal_id,
            (SELECT o.goal_id FROM v2_epochs o WHERE o.ws_id = s.ws_id AND o.session_key = s.session_key AND o.ends_at IS NULL) AS open_goal
     FROM v2_sessions s
     WHERE s.ws_id = ? AND EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key
                                   AND (e.ends_at IS NULL OR e.ends_at >= ?) AND (e.goal_id = ? OR s.governing_goal_id = ?))
     ORDER BY s.session_key`,
    ws,
    since,
    g.id,
    g.id,
  );
  // A session's latest time on this goal: its newest usage in an epoch bound to the goal, or the newest such epoch's start.
  const lastOf = (key: string) =>
    latest(
      get<{ t: string | null }>(
        "SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND u.session_key = ? AND e.goal_id = ?",
        ws,
        key,
        g.id,
      )?.t,
      get<{ t: string | null }>("SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND goal_id = ?", ws, key, g.id)?.t,
    );
  const by_harness = { "claude-code": 0, codex: 0 };
  let active_now = 0;
  const mine: NonNullable<GoalActivity["detail"]>["mine"] = [];
  const cutoff = new Date(now - ACTIVE_MS).toISOString();
  for (const s of lines) {
    by_harness[s.harness]++;
    const last = lastOf(s.session_key);
    const onGoalNow = s.open_goal === g.id || s.governing_goal_id === g.id;
    if (s.state === "shared" && !s.agent_stopped && onGoalNow && !!last && last >= cutoff) active_now++;
    if (s.user_id === pp.userId) mine.push({ session_key: s.session_key, harness: s.harness, state: s.state, last_activity_at: last });
  }
  const last_activity_at = latest(
    get<{ t: string | null }>(
      "SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND e.goal_id = ?",
      ws,
      g.id,
    )?.t,
    get<{ t: string | null }>("SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND goal_id = ?", ws, g.id)?.t,
    get<{ t: string | null }>("SELECT MAX(at) AS t FROM v2_activity WHERE ws_id = ? AND goal_id = ?", ws, g.id)?.t,
  );
  let detail: GoalActivity["detail"] = null;
  if (seesActivityDetail(pp, g)) {
    const live = nowIso();
    const files = all<{ path: string }>(
      "SELECT path FROM v2_activity WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NOT NULL GROUP BY path ORDER BY COUNT(*) DESC, MAX(at) DESC, path LIMIT 4",
      ws,
      g.id,
      live,
    ).map((r) => r.path);
    const files_hidden =
      get<{ n: number }>(
        `SELECT COUNT(DISTINCT path_hash) AS n FROM v2_activity a WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NULL AND path_hash IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM v2_activity b WHERE b.ws_id = a.ws_id AND b.goal_id = a.goal_id AND b.path_hash = a.path_hash AND b.path IS NOT NULL AND b.expires_at > ?)`,
        ws,
        g.id,
        live,
        live,
      )?.n ?? 0;
    detail = { files, files_hidden, mine };
  }
  return { sessions: lines.length, active_now, by_harness, last_activity_at, evidence_class: activityEvidence({ sessions: lines.length, last_activity_at }), detail };
}

/** One goal's activity for a reader of the goal (404 V2Error when they can't read it). */
export function goalActivity(pp: PolicyPrincipal, goalId: string): GoalActivity {
  return activityOf(pp, visibleGoal(pp, goalId));
}

/** Every readable active goal's activity (those with detail first, then the most recent activity), and how many of
 *  the reader's own shared sessions have no goal in their current epoch (`unbound`). */
export function goalsActivity(pp: PolicyPrincipal): { goals: GoalActivityItem[]; unbound: number } {
  const teams = new Map<string, { id: string; name: string } | null>();
  const team = (id: string | null) => {
    if (!id) return null;
    if (!teams.has(id)) teams.set(id, get<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, id) ?? null);
    return teams.get(id)!;
  };
  const now = Date.now();
  const goals = visibleGoals(pp)
    .filter((g) => g.status === "active")
    .map((g): GoalActivityItem => ({ goal: { id: g.id, title: g.title, team: team(g.pod_id) }, ...activityOf(pp, g, now) }))
    .sort((a, b) => Number(!!b.detail) - Number(!!a.detail) || (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "") || a.goal.title.localeCompare(b.goal.title));
  const unbound =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM v2_sessions s WHERE s.ws_id = ? AND s.user_id = ? AND s.state = 'shared' AND s.governing_goal_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL AND e.goal_id IS NOT NULL)`,
      pp.wsId,
      pp.userId,
    )?.n ?? 0;
  return { goals, unbound };
}

