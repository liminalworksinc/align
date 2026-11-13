// Caller-owned request and hold types and explicit resource bindings.
import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso } from "./ids";
import { effectiveSet, launchSet } from "./approval";
import { contentOf, dependencyCycle, goalObj, goalRow, goalsDependingOn, nextContent, sameContent, unreadableGoals, versionContentOf, visibleGoal, writeGoalVersion, type GoalContent, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName, memberPrincipal, nameTo } from "./workspaces";
import { assertRevisionReached, nonNegInt, optStr, revisionRead, str, type Body } from "./validate";
import { EVIDENCE_PER_REVISION, evidenceCount, evidenceInput, evidenceRows, evidenceView, recordSnapshot, snapshotView, type EvidenceSource } from "./evidence";
import { counterNoChange, counterSameAsRequest } from "./change-words.mts";
import { create_changes } from "../native/.bindings/server_changes.js";
import type { Sums } from "./spend";

declare const CHANGE_KEYS: readonly ["title", "measures", "depends_on", "status", "limits"];

export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];

export type ChangeRequestAction = (typeof CHANGE_REQUEST_ACTIONS)[number];

export type LaunchState = (typeof LAUNCH_STATES)[number];

type ChangeKey = (typeof CHANGE_KEYS)[number];

export type Changes = Partial<Pick<GoalContent, ChangeKey>>;

interface ChangeRequestRow {
    id: string;
    ws_id: string;
    goal_id: string;
    requester_id: string;
    state: ChangeRequestState;
    revision: number;
    base_version: number;
    changes_json: string;
    reason: string;
    approved_by: string | null;
    rejected_by: string | null;
    decision_note: string | null;
    version: number | null;
    created_at: string;
    updated_at: string;
    decided_at: string | null;
    approved_without_evidence: number | null;
    launch: LaunchState | null;
    /** The approved-unlaunched version's content (GoalContent JSON), stored at approval. */
    approved_json: string | null;
    /** The latest launch decision (not yet or launch): who and when. */
    launch_by: string | null;
    launch_at: string | null;
}

interface RevisionRow {
    revision: number;
    base_version: number;
    changes_json: string;
    note: string | null;
    author_id: string;
    created_at: string;
    snapshot_json: string | null;
    /** A counter's "Accept if…" condition, and the requester's acknowledgement of it. */
    condition: string | null;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
}

export type ChangeRequestView = ReturnType<typeof requestView>;

// ---- reading (the same object for a list item, one request and a decision record) ----
declare function requestView(pp: PolicyPrincipal, r: ChangeRequestRow): { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; };

interface ChangesRuntime {
  CHANGE_REQUEST_STATES: readonly ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"];
  CHANGE_REQUEST_ACTIONS: readonly ["approve", "approve_and_launch", "launch", "not_yet", "reject", "counter", "accept_counter", "acknowledge", "withdraw", "rebase"];
  LAUNCH_STATES: readonly ["pending", "not_yet", "launched", "superseded"];
  dependencyChoices: (pp: PolicyPrincipal, goalId: string, counterOf?: string) => string[] | null;
  dependencyLoops: (pp: PolicyPrincipal, goalId: string, counterOf?: string) => string[] | null;
  counterBase: (pp: PolicyPrincipal, goalId: string, counterOf?: string) => Changes | null;
  versionLoops: (pp: PolicyPrincipal, goalId: string, canEdit: boolean) => string[] | null;
  insertChangeRequest: (pp: PolicyPrincipal, g: GoalRow, changes: Changes, reason: string, at: string) => string;
  createChangeRequest: (pp: PolicyPrincipal, goalId: string, b: Body) => Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }>;
  actOnChangeRequest: (pp: PolicyPrincipal, goalId: string, id: string, action: ChangeRequestAction, b: Body) => Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }>;
  addEvidence: (pp: PolicyPrincipal, goalId: string | undefined, id: string, b: Body, source: EvidenceSource) => Promise<{ evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }; change_request: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }; }>;
  removeEvidence: (pp: PolicyPrincipal, goalId: string | undefined, id: string, evidenceId: string) => Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }>;
  listChangeRequests: (pp: PolicyPrincipal, opts?: { state?: string | null; goalId?: string; }) => ChangeRequestView[];
  changeRequestGroups: (pp: PolicyPrincipal, state?: string | null) => { waiting_on_me: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; mine: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; others: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number; behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null; condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string; evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[]; snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[]; diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[]; launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null; decision_note: string | null; note: string | null; rejection_reason: string | null; version: number | null; launch: "pending" | "superseded" | "not_yet" | "launched" | null; launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null; evidence_count: number; approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; }; state_note: string; dependency_not_visible: string | null; dependency_loop: string | null; waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; };
  getChangeRequest: (pp: PolicyPrincipal, id: string, goalId?: string) => ChangeRequestView;
  assertChangeRequestAction: (a: string) => ChangeRequestAction;
  requestCondition: (id: string) => { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
}
const changesService = create_changes({
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  V2Error,
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  forbidden: (...args: Parameters<typeof forbidden>) => forbidden(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  effectiveSet: (...args: Parameters<typeof effectiveSet>) => effectiveSet(...args),
  launchSet: (...args: Parameters<typeof launchSet>) => launchSet(...args),
  contentOf: (...args: Parameters<typeof contentOf>) => contentOf(...args),
  dependencyCycle: (...args: Parameters<typeof dependencyCycle>) => dependencyCycle(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  goalsDependingOn: (...args: Parameters<typeof goalsDependingOn>) => goalsDependingOn(...args),
  nextContent: (...args: Parameters<typeof nextContent>) => nextContent(...args),
  sameContent: (...args: Parameters<typeof sameContent>) => sameContent(...args),
  unreadableGoals: (...args: Parameters<typeof unreadableGoals>) => unreadableGoals(...args),
  versionContentOf: (...args: Parameters<typeof versionContentOf>) => versionContentOf(...args),
  visibleGoal: (...args: Parameters<typeof visibleGoal>) => visibleGoal(...args),
  writeGoalVersion: (...args: Parameters<typeof writeGoalVersion>) => writeGoalVersion(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  memberPrincipal: (...args: Parameters<typeof memberPrincipal>) => memberPrincipal(...args),
  nameTo: (...args: Parameters<typeof nameTo>) => nameTo(...args),
  assertRevisionReached: (...args: Parameters<typeof assertRevisionReached>) => assertRevisionReached(...args),
  nonNegInt: (...args: Parameters<typeof nonNegInt>) => nonNegInt(...args),
  optStr: (...args: Parameters<typeof optStr>) => optStr(...args),
  revisionRead: (...args: Parameters<typeof revisionRead>) => revisionRead(...args),
  str: (...args: Parameters<typeof str>) => str(...args),
  EVIDENCE_PER_REVISION,
  evidenceCount: (...args: Parameters<typeof evidenceCount>) => evidenceCount(...args),
  evidenceInput: (...args: Parameters<typeof evidenceInput>) => evidenceInput(...args),
  evidenceRows: (...args: Parameters<typeof evidenceRows>) => evidenceRows(...args),
  evidenceView: (...args: Parameters<typeof evidenceView>) => evidenceView(...args),
  recordSnapshot: (...args: Parameters<typeof recordSnapshot>) => recordSnapshot(...args),
  snapshotView: (...args: Parameters<typeof snapshotView>) => snapshotView(...args),
  counterNoChange: (...args: Parameters<typeof counterNoChange>) => counterNoChange(...args),
  counterSameAsRequest: (...args: Parameters<typeof counterSameAsRequest>) => counterSameAsRequest(...args),
}) as unknown as ChangesRuntime;

export const CHANGE_REQUEST_STATES = changesService.CHANGE_REQUEST_STATES;
export const CHANGE_REQUEST_ACTIONS = changesService.CHANGE_REQUEST_ACTIONS;
export const LAUNCH_STATES = changesService.LAUNCH_STATES;
/** The goals a change request from this reader on `goalId` may add as a dependency: the goals they can read that every
 *  member of the goal's effective approval set (for them as the requester) can read too, so the propose form offers
 *  only what the server accepts (C2 F5), leaving out goals that already depend on this goal, which would close a loop
 *  (C3-3). null when they may not propose (a viewer, the owner, a closed goal). With
 *  `counterOf` (a request on that goal), the goals a counter from this reader may add: readable by them, the requester
 *  and the request's approval set (404 for a request not on the goal; null when they may not counter it). */
export function dependencyChoices(pp: PolicyPrincipal, goalId: string, counterOf?: string): string[] | null {
    return (0, changesService.dependencyChoices)(pp, goalId, counterOf);
}
/** The goals this reader can read that already depend on `goalId` (so dependencyChoices leaves them out: adding one
 *  would close a loop), for the propose or counter form to say why they aren't offered (C3-3). The same audience as
 *  dependencyChoices, `counterOf` included: null exactly when it is (C4-2). */
export function dependencyLoops(pp: PolicyPrincipal, goalId: string, counterOf?: string): string[] | null {
    return (0, changesService.dependencyLoops)(pp, goalId, counterOf);
}
/** What a counter from this reader on request `counterOf` is compared with: the request's base version (its dependencies
 *  limited to those the reader can read; a counter keeps the others), so the Suggest a change form offers Review exactly
 *  when the server would record the counter, also on a request behind its goal (C8-2). null without `counterOf`, and
 *  for a reader who may not counter it (the same audience as dependencyChoices). */
export function counterBase(pp: PolicyPrincipal, goalId: string, counterOf?: string): Changes | null {
    return (0, changesService.counterBase)(pp, goalId, counterOf);
}
/** The goals the New version form leaves out of Depends on because they already depend on `goalId` (saving one would
 *  be refused 409 cycle), for a reader who may save a version (`canEdit`); null otherwise (X5). */
export function versionLoops(pp: PolicyPrincipal, goalId: string, canEdit: boolean): string[] | null {
    return (0, changesService.versionLoops)(pp, goalId, canEdit);
}
/** Write a new pending request at revision 1 (inside the caller's tx). The create route checks who may ask; the
 *  sample workspace seeds its request through here directly. */
export function insertChangeRequest(pp: PolicyPrincipal, g: GoalRow, changes: Changes, reason: string, at: string): string {
    return (0, changesService.insertChangeRequest)(pp, g, changes, reason, at);
}
export async function createChangeRequest(pp: PolicyPrincipal, goalId: string, b: Body): Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }> {
    return (0, changesService.createChangeRequest)(pp, goalId, b);
}
export async function actOnChangeRequest(pp: PolicyPrincipal, goalId: string, id: string, action: ChangeRequestAction, b: Body): Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }> {
    return (0, changesService.actOnChangeRequest)(pp, goalId, id, action, b);
}
/** Add `{kind, url, label, revision?}` to the request's current revision as the caller, from `source` ("person" for a
 *  web session, "agent" for MCP or a device token). `goalId` is the goal named in the path (MCP names none). */
export async function addEvidence(pp: PolicyPrincipal, goalId: string | undefined, id: string, b: Body, source: EvidenceSource): Promise<{ evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }; change_request: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }; }> {
    return (0, changesService.addEvidence)(pp, goalId, id, b, source);
}
/** Remove one of the caller's own links from the current revision of an open request (404 if it isn't there). */
export async function removeEvidence(pp: PolicyPrincipal, goalId: string | undefined, id: string, evidenceId: string): Promise<{ id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }> {
    return (0, changesService.removeEvidence)(pp, goalId, id, evidenceId);
}
/** Change requests on goals the caller can read (viewers included), newest change first, optionally of one state
 *  (400 for an unknown one) and on one goal (404 if the caller can't read it). */
export function listChangeRequests(pp: PolicyPrincipal, opts: {
    state?: string | null;
    goalId?: string;
} = {}): ChangeRequestView[] {
    return (0, changesService.listChangeRequests)(pp, opts);
}
/** The workspace Requests tab: waiting on me (my approve, accept_counter or launch flag), mine, others. */
export function changeRequestGroups(pp: PolicyPrincipal, state?: string | null): { waiting_on_me: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; mine: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; others: { id: string; goal: { id: string; title: string; version: number; }; state: "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "superseded"; revision: number; base_version: number;
/** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
behind: boolean; requester: { id: string; name: string; }; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; reason: string; revisions: { revision: number; base_version: number; changes: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; note: string | null;
/** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
condition: string | null; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; author: { id: string; name: string; }; created_at: string;
/** The links added while this revision was current (frozen once it is superseded or the request decided). */
evidence: { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; }[];
/** What Align recorded about the goal when this revision was written. */
snapshot: { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null; }[];
/** depends_on lists only the goals the reader can read; hidden_depends_on counts the others on each side (never
 *  which), so a diff never reads "Nothing → Nothing" while a dependency the reader can't see changes. */
diff: { before: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; after: Partial<Pick<GoalContent, "title" | "measures" | "depends_on" | "status" | "limits">>; hidden_depends_on: { before: number; after: number; } | null; }; approvers: { id: string; name: string; }[];
/** Who may launch it once approved: the approval set plus workspace owners. */
launchers: { id: string; name: string; }[]; approved_by: { id: string; name: string; } | null; rejected_by: { id: string; name: string; } | null;
/** The approver's note (approved) or the rejection reason (rejected). */
decision_note: string | null; note: string | null; rejection_reason: string | null;
/** The goal version the launch created (null until launched). */
version: number | null;
/** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
launch: "pending" | "superseded" | "not_yet" | "launched" | null;
/** The latest not yet or launch: who and when. */
launch_decided_by: { id: string; name: string; } | null; launch_decided_at: string | null; condition: { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null;
/** Links on the current revision (the one an approval decides). */
evidence_count: number;
/** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
approved_without_evidence: boolean | null; can: { approve: boolean; approve_and_launch: boolean; reject: boolean; counter: boolean; accept_counter: boolean; acknowledge: boolean; withdraw: boolean; rebase: boolean; add_evidence: boolean; launch: boolean; not_yet: boolean; };
/** What happened to the request, in the words a `wrong_state` refusal of an action it no longer allows gives
 *  ("This request was declined by <name>, so nothing changes.", never "rejected"), so a card that finds it changed
 *  before sending says what the server would (W2). */
state_note: string;
/** Why `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) are false although the reader
 *  decides on it: the refusal they would get (409 dependency_not_visible), naming no goal. null otherwise. */
dependency_not_visible: string | null;
/** Why nobody can approve (pending) or launch (approved) it as it stands: a dependency it adds would now close a loop
 *  (409 cycle), naming no goal; the same for every reader. null otherwise (C5-1). */
dependency_loop: string | null;
/** The reader's turn: they may approve it, accept its counter, or launch it (approved and not launched, whether
 *  nobody decided the launch yet or someone said not yet): the same rule as the workspace Home's queue. A pending
 *  request that would close a loop waits on its deciders to suggest a change or decline it (C5-1), once its requester
 *  has updated it to the goal's version (C6-2). */
waiting_on_me: boolean; created_at: string; updated_at: string; decided_at: string | null; }[]; } {
    return (0, changesService.changeRequestGroups)(pp, state);
}
/** One request with its revisions and diff (a decision record once approved or rejected); 404 when the caller
 *  can't read its goal, or when `goalId` is named and the request is on another goal. */
export function getChangeRequest(pp: PolicyPrincipal, id: string, goalId?: string): ChangeRequestView {
    return (0, changesService.getChangeRequest)(pp, id, goalId);
}
export function assertChangeRequestAction(a: string): ChangeRequestAction {
    return (0, changesService.assertChangeRequestAction)(a);
}
/** A request's "Accept if…" condition and its acknowledgement, for reads that don't build the whole view (the MCP
 *  brief). The caller has checked that the person can read the request's goal. */
export function requestCondition(id: string): { revision: number; text: string; acknowledged_by: { id: string; name: string; } | null; acknowledged_at: string | null; } | null {
    return (0, changesService.requestCondition)(id);
}
