// Caller-owned activity types and explicit resource bindings.
import { all, run, tx } from "./db";
import { badRequest } from "./errors";
import { nowIso } from "./ids";
import { goalObj, goalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { openEpoch, sessionRow } from "./sessions";
import type { DevicePrincipal } from "./devices";
import { need } from "./workspaces";
import { cleanProse, isBlankText } from "./text-core.mts";
import { personName } from "./retention";
import { SESSION_KEY_RE, type Body } from "./validate";
import { create_activity } from "../native/.bindings/server_activity.js";

type Kind = "edit" | "commit" | "task" | "claim";

interface ActivityRow {
    seq: number;
    session_key: string;
    user_id: string;
    goal_id: string | null;
    repo_id: string;
    kind: Kind;
    path_hash: string | null;
    path: string | null;
    text: string | null;
    at: string;
    expires_at: string;
    harness: string;
    name: string;
}

interface ActivityRuntime {
  ingestActivity: (pp: PolicyPrincipal, dev: DevicePrincipal, b: Body) => Promise<{ accepted: number; refused: { index: number; reason: "clock_skew" | "too_old" | "not_shared"; }[]; server_time: string; }>;
  activityFor: (pp: PolicyPrincipal, after: number) => { cursor: number; items: { seq: number; session_key: string; harness: string; user: { id: string; name: string; }; mine: boolean; goal_id: string | null; repo_id: string; kind: "edit" | "commit" | "task" | "claim"; path_hash: string | null; path: string | null; text: string | null; at: string; expires_at: string; }[]; };
}
const activityService = create_activity({
  all: (...args: Parameters<typeof all>) => all(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  openEpoch: (...args: Parameters<typeof openEpoch>) => openEpoch(...args),
  sessionRow: (...args: Parameters<typeof sessionRow>) => sessionRow(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  cleanProse: (...args: Parameters<typeof cleanProse>) => cleanProse(...args),
  isBlankText: (...args: Parameters<typeof isBlankText>) => isBlankText(...args),
  personName: (...args: Parameters<typeof personName>) => personName(...args),
  SESSION_KEY_RE,
  readDate: () => Date,
}) as unknown as ActivityRuntime;

/** A batch of this device's activity for its own shared sessions. Items it doesn't take are listed in `refused` by
 *  index with why: `clock_skew` (more than 5 minutes ahead of this server's clock; `server_time` says what it reads),
 *  `too_old` (more than a day back) or `not_shared` (an unknown, foreign or no longer shared session), so a device
 *  never loses them silently (C3-4). */
export async function ingestActivity(pp: PolicyPrincipal, dev: DevicePrincipal, b: Body): Promise<{ accepted: number; refused: { index: number; reason: "clock_skew" | "too_old" | "not_shared"; }[]; server_time: string; }> {
    return (0, activityService.ingestActivity)(pp, dev, b);
}
/** Unexpired activity after `after` (a seq cursor) on goals this caller may read; unbound sessions only their own. */
export function activityFor(pp: PolicyPrincipal, after: number): { cursor: number; items: { seq: number; session_key: string; harness: string; user: { id: string; name: string; }; mine: boolean; goal_id: string | null; repo_id: string; kind: "edit" | "commit" | "task" | "claim"; path_hash: string | null; path: string | null; text: string | null; at: string; expires_at: string; }[]; } {
    return (0, activityService.activityFor)(pp, after);
}
