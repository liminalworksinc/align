// Caller-owned value types and explicit resource bindings.
import { get } from "./db";
import { V2Error } from "./errors";
import { getChangeRequest as requestView, listChangeRequests as requestViews, type ChangeRequestState as StoredState, type ChangeRequestView, type LaunchState } from "./changes";
import type { EvidenceKind, EvidenceSource, SnapshotView } from "./evidence";
import type { Limit } from "./goal-limits";
import type { GoalStatus, Measure } from "./goals";
import type { PolicyPrincipal } from "./policy";
import { create_records } from "../native/.bindings/server_change_read.js";

export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];

/** An evidence link as the MCP tools return it: who added it and whether a person or an agent did. */
export interface EvidenceLink {
    id: string;
    revision: number;
    kind: EvidenceKind;
    url: string;
    label: string;
    source: EvidenceSource;
    reported_as: "self-reported" | "agent-reported";
    added_by: {
        id: string;
        name: string;
    };
    added_at: string;
}

/** A counter's "Accept if…" condition and the requester's acknowledgement (never "verified"). */
export interface Condition {
    revision: number;
    text: string;
    acknowledged_by: {
        id: string;
        name: string;
    } | null;
    acknowledged_at: string | null;
}

export interface ChangeRequestSummary {
    id: string;
    goal: {
        id: string;
        title: string;
    };
    state: ChangeRequestState;
    /** Toward agents, once approved: pending | not_yet | launched | superseded (before launch); null before approval. */
    launch: LaunchState | null;
    condition: Condition | null;
    requested_by: {
        id: string;
        name: string;
    };
    base_version: number;
    revision: number;
    reason: string;
    /** Every evidence link, each with the revision it was added to (oldest revision first). */
    evidence: EvidenceLink[];
    /** What Align recorded about the goal when the current revision was written (spend null when the reader may not
     *  read spend), or null for a revision written before snapshots existed. */
    snapshot: SnapshotView | null;
    created_at: string;
    updated_at: string;
}

/** Before and after of each changed field, as GET .../goals/{goal}/change-requests/{id} returns it. */
export interface ChangeDiff {
    title?: {
        before: string;
        after: string;
    };
    measures?: {
        before: Measure[];
        after: Measure[];
    };
    /** `hidden` counts the dependencies on each side the reader can't read (left out of before and after). */
    depends_on?: {
        before: string[];
        after: string[];
        hidden: {
            before: number;
            after: number;
        } | null;
    };
    status?: {
        before: GoalStatus;
        after: GoalStatus;
    };
    limits?: {
        before: Limit[];
        after: Limit[];
    };
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
    /** The approver or rejecter, once decided. */
    decided_by: {
        id: string;
        name: string;
    } | null;
    /** The approval note or the rejection reason. */
    decision_note: string | null;
    diff: ChangeDiff;
    /** The goal version the launch created (null before the launch). */
    resulting_version: number | null;
    /** The latest launch decision (not yet or launch). */
    launch_decided_by: {
        id: string;
        name: string;
    } | null;
    launch_decided_at: string | null;
    /** Approved with no evidence link on the approved revision (null unless approved). */
    approved_without_evidence: boolean | null;
    decided_at: string | null;
}

// The same states as lib/v2/changes.ts stores (the compiler checks both directions).
const sameStates: [
    ChangeRequestState,
    StoredState
] extends [
    StoredState,
    ChangeRequestState
] ? true : never = true;
void sameStates;
interface ChangeReadRuntime {
  CHANGE_REQUEST_STATES: readonly ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"];
  listChangeRequests: (pp: PolicyPrincipal, state: ChangeRequestState | null, limit?: number) => ChangeRequestSummary[];
  getChangeRequest: (pp: PolicyPrincipal, id: string) => ChangeRequestDetail | null;
}
const recordService = create_records({
  get: (...args: Parameters<typeof get>) => get(...args),
  V2Error,
  requestView: (...args: Parameters<typeof requestView>) => requestView(...args),
  requestViews: (...args: Parameters<typeof requestViews>) => requestViews(...args),
}) as unknown as ChangeReadRuntime;

export const CHANGE_REQUEST_STATES = recordService.CHANGE_REQUEST_STATES;
/** The change requests on goals this caller can read, filtered by state, newest updated_at first, at most `limit`. */
export function listChangeRequests(pp: PolicyPrincipal, state: ChangeRequestState | null, limit = 100): ChangeRequestSummary[] {
    return (0, recordService.listChangeRequests)(pp, state, limit);
}
/** One change request on a goal this caller can read, or null (no such request, or the goal is unreadable). */
export function getChangeRequest(pp: PolicyPrincipal, id: string): ChangeRequestDetail | null {
    return (0, recordService.getChangeRequest)(pp, id);
}
