// Caller-owned reallocation types and explicit resource bindings.
import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { effectiveSet, launchSet } from "./approval";
import { assertTargetsFit, contentOf, goalObj, goalRow, visibleGoal, writeGoalVersion } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName, nameTo } from "./workspaces";
import { assertRevisionReached, optStr, revisionRead, type Body } from "./validate";
import { COUNTER_SAME_AS_PROPOSAL } from "./change-words.mts";
import { create_reallocations } from "../native/.bindings/server_reallocations.js";

export type ReallocationState = (typeof REALLOCATION_STATES)[number];

export type ReallocationAction = (typeof REALLOCATION_ACTIONS)[number];

type LaunchState = "pending" | "not_yet" | "launched" | "superseded";

interface Row {
    id: string;
    ws_id: string;
    requester_id: string;
    state: ReallocationState;
    revision: number;
    launch: LaunchState | null;
    launch_by: string | null;
    launch_at: string | null;
    decided_by: string | null;
    decision_note: string | null;
    created_at: string;
    updated_at: string;
    decided_at: string | null;
}

interface RevisionRow {
    revision: number;
    targets_json: string;
    note: string | null;
    author_id: string;
    created_at: string;
}

/** One goal of a revision: its version and target when the revision was written, and the proposed target. */
interface Target {
    goal_id: string;
    base_version: number;
    from_share: number | null;
    target_share: number | null;
}

export type ReallocationView = ReturnType<typeof view>;

// ---- reading ----
declare function view(pp: PolicyPrincipal, r: Row): { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; };

interface ReallocationRuntime {
  REALLOCATION_STATES: readonly ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"];
  REALLOCATION_ACTIONS: readonly ["approve", "approve_and_launch", "launch", "not_yet", "counter", "accept_counter", "reject", "withdraw"];
  REALLOCATION_GOALS_MAX: 50;
  createReallocation: (pp: PolicyPrincipal, b: Body) => Promise<{ id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null; current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[]; launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false; approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }>;
  actOnReallocation: (pp: PolicyPrincipal, id: string, action: ReallocationAction, b: Body) => Promise<{ id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null; current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[]; launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false; approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }>;
  supersedeReallocations: (ws: string, goalId: string, actorId: string, at: string) => void;
  getReallocation: (pp: PolicyPrincipal, id: string) => ReallocationView;
  listReallocations: (pp: PolicyPrincipal) => { waiting_on_me: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null; current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[]; launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false; approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; mine: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null; current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[]; launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false; approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; others: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null; current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[]; launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false; approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; };
  assertReallocationAction: (a: string) => ReallocationAction;
}
const reallocationService = create_reallocations({
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  forbidden: (...args: Parameters<typeof forbidden>) => forbidden(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  effectiveSet: (...args: Parameters<typeof effectiveSet>) => effectiveSet(...args),
  launchSet: (...args: Parameters<typeof launchSet>) => launchSet(...args),
  assertTargetsFit: (...args: Parameters<typeof assertTargetsFit>) => assertTargetsFit(...args),
  contentOf: (...args: Parameters<typeof contentOf>) => contentOf(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  visibleGoal: (...args: Parameters<typeof visibleGoal>) => visibleGoal(...args),
  writeGoalVersion: (...args: Parameters<typeof writeGoalVersion>) => writeGoalVersion(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  nameTo: (...args: Parameters<typeof nameTo>) => nameTo(...args),
  assertRevisionReached: (...args: Parameters<typeof assertRevisionReached>) => assertRevisionReached(...args),
  optStr: (...args: Parameters<typeof optStr>) => optStr(...args),
  revisionRead: (...args: Parameters<typeof revisionRead>) => revisionRead(...args),
  COUNTER_SAME_AS_PROPOSAL,
}) as unknown as ReallocationRuntime;

export const REALLOCATION_STATES = reallocationService.REALLOCATION_STATES;
export const REALLOCATION_ACTIONS = reallocationService.REALLOCATION_ACTIONS;
export const REALLOCATION_GOALS_MAX = reallocationService.REALLOCATION_GOALS_MAX;
/** POST …/reallocations { targets: [{goal_id, target_share}], note? } -> 201 (owners and members). */
export async function createReallocation(pp: PolicyPrincipal, b: Body): Promise<{ id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }> {
    return (0, reallocationService.createReallocation)(pp, b);
}
export async function actOnReallocation(pp: PolicyPrincipal, id: string, action: ReallocationAction, b: Body): Promise<{ id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }> {
    return (0, reallocationService.actOnReallocation)(pp, id, action, b);
}
/** Inside writeGoalVersion's tx: every open (pending or countered) or approved-unlaunched proposal whose current
 *  revision names this goal is superseded, audited with the person whose action wrote the version. */
export function supersedeReallocations(ws: string, goalId: string, actorId: string, at: string): void {
    return (0, reallocationService.supersedeReallocations)(ws, goalId, actorId, at);
}
export function getReallocation(pp: PolicyPrincipal, id: string): ReallocationView {
    return (0, reallocationService.getReallocation)(pp, id);
}
/** GET …/reallocations: the proposals the caller can read (one of their goals), newest change first, at most 200, as
 *  { waiting_on_me, mine, others }. */
export function listReallocations(pp: PolicyPrincipal): { waiting_on_me: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; mine: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; others: { id: string; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; requester: { id: string; name: string; }; targets: { goal: { id: string; title: string; } | null; from_share: number | null;
/** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
current_share: number | null; target_share: number | null; base_version: number | null; approvers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; approved: boolean; }[]; note: string | null; history: { revision: number; author: { id: string; name: string; }; note: string | null; created_at: string; }[];
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: LaunchState | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; rejected_by: { id: string; name: string; } | null; rejection_reason: string | null; waiting_on_me: boolean; can: { approve: false;
// My approval completes it and I may launch: both in one step.
approve_and_launch: false; launch: boolean; not_yet: boolean; counter: false; accept_counter: boolean; reject: false; withdraw: boolean; }; created_at: string; updated_at: string; decided_at: string | null; }[]; } {
    return (0, reallocationService.listReallocations)(pp);
}
export function assertReallocationAction(a: string): ReallocationAction {
    return (0, reallocationService.assertReallocationAction)(a);
}
