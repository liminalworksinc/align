import { get } from "./db";
import { V2Error } from "./errors";
import { getChangeRequest as requestView, listChangeRequests as requestViews, type ChangeRequestState as StoredState, type ChangeRequestView } from "./changes";
import type { EvidenceKind, EvidenceSource, SnapshotView } from "./evidence";
import type { Limit } from "./goal-limits";
import type { GoalStatus, Measure } from "./goals";
import type { PolicyPrincipal } from "./policy";

// Read side of change requests for the MCP tools (lib/mcp/register.ts): align_list_change_requests and
// align_get_decision_record. Change requests themselves (v2_change_requests, the routes and the decision flow) belong
// to the goals-and-proposals part (lib/v2/changes.ts); this module is the seam between the two. The two functions
// below read through lib/v2/changes.ts (same visibility: only requests on goals the caller can read) and reshape its
// views into the summaries and decision records declared here. Plain strings only: the MCP layer marks people's text
// as untrusted, and drops anything on a goal the caller can't read (a second check).

export const CHANGE_REQUEST_STATES = ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"] as const;
export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];
// The same states as lib/v2/changes.ts stores (the compiler checks both directions).
const sameStates: [ChangeRequestState, StoredState] extends [StoredState, ChangeRequestState] ? true : never = true;
void sameStates;

/** An evidence link as the MCP tools return it: who added it and whether a person or an agent did. */
export interface EvidenceLink {
  id: string;
  revision: number;
  kind: EvidenceKind;
  url: string;
  label: string;
  source: EvidenceSource;
  reported_as: "self-reported" | "agent-reported";
  added_by: { id: string; name: string };
  added_at: string;
}

export interface ChangeRequestSummary {
  id: string;
  goal: { id: string; title: string };
  state: ChangeRequestState;
  requested_by: { id: string; name: string };
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
  title?: { before: string; after: string };
  measures?: { before: Measure[]; after: Measure[] };
  depends_on?: { before: string[]; after: string[] };
  status?: { before: GoalStatus; after: GoalStatus };
  limits?: { before: Limit[]; after: Limit[] };
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  /** The approver or rejecter, once decided. */
  decided_by: { id: string; name: string } | null;
  /** The approval note or the rejection reason. */
  decision_note: string | null;
  diff: ChangeDiff;
  /** The goal version an approval created. */
  resulting_version: number | null;
  /** Approved with no evidence link on the approved revision (null unless approved). */
  approved_without_evidence: boolean | null;
  decided_at: string | null;
}

const hasChangeRequests = () => !!get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_change_requests'");

const summary = (v: ChangeRequestView): ChangeRequestSummary => ({
  id: v.id,
  goal: { id: v.goal.id, title: v.goal.title },
  state: v.state,
  requested_by: v.requester,
  base_version: v.base_version,
  revision: v.revision,
  reason: v.reason,
  evidence: v.revisions
    .flatMap((r) => r.evidence)
    .map((e) => ({ id: e.id, revision: e.revision, kind: e.kind, url: e.url, label: e.label, source: e.source, reported_as: e.reported_as, added_by: e.added_by, added_at: e.added_at })),
  snapshot: v.revisions.find((r) => r.revision === v.revision)?.snapshot ?? null,
  created_at: v.created_at,
  updated_at: v.updated_at,
});

function detail(v: ChangeRequestView): ChangeRequestDetail {
  const decided = v.state === "approved" || v.state === "rejected";
  const diff: ChangeDiff = {};
  const { before, after } = v.diff;
  if (after.title !== undefined) diff.title = { before: before.title!, after: after.title };
  if (after.measures !== undefined) diff.measures = { before: before.measures!, after: after.measures };
  if (after.depends_on !== undefined) diff.depends_on = { before: before.depends_on!, after: after.depends_on };
  if (after.status !== undefined) diff.status = { before: before.status!, after: after.status };
  if (after.limits !== undefined) diff.limits = { before: before.limits ?? [], after: after.limits };
  return {
    ...summary(v),
    decided_by: decided ? (v.approved_by ?? v.rejected_by) : null,
    decision_note: decided ? v.decision_note : null,
    diff,
    resulting_version: v.state === "approved" ? v.version : null,
    approved_without_evidence: v.approved_without_evidence,
    decided_at: decided ? v.decided_at : null,
  };
}

/** The change requests on goals this caller can read, filtered by state, newest updated_at first, at most `limit`. */
export function listChangeRequests(pp: PolicyPrincipal, state: ChangeRequestState | null, limit = 100): ChangeRequestSummary[] {
  if (!hasChangeRequests()) return [];
  return requestViews(pp, { state }).slice(0, Math.max(0, limit)).map(summary);
}

/** One change request on a goal this caller can read, or null (no such request, or the goal is unreadable). */
export function getChangeRequest(pp: PolicyPrincipal, id: string): ChangeRequestDetail | null {
  if (!hasChangeRequests()) return null;
  try {
    return detail(requestView(pp, id));
  } catch (e) {
    if (e instanceof V2Error && e.status === 404) return null;
    throw e;
  }
}
