import { get } from "./db";
import type { GoalStatus, Measure } from "./goals";
import type { PolicyPrincipal } from "./policy";

// Read side of change requests for the MCP tools (lib/mcp/register.ts): align_list_change_requests and
// align_get_decision_record. Change requests themselves (v2_change_requests, the routes and the decision flow) belong
// to the goals-and-proposals part; this module is the seam between the two. Until that table exists every workspace
// has no change requests, so the list is empty and every id is not found. The change-requests code fills in the two
// functions below against its own tables, returning the shapes declared here. Plain strings only: the MCP layer
// marks people's text as untrusted, and drops anything on a goal the caller can't read (a second check).

export const CHANGE_REQUEST_STATES = ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"] as const;
export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];

export interface ChangeRequestSummary {
  id: string;
  goal: { id: string; title: string };
  state: ChangeRequestState;
  requested_by: { id: string; name: string };
  base_version: number;
  revision: number;
  reason: string;
  created_at: string;
  updated_at: string;
}

/** Before and after of each changed field, as GET .../goals/{goal}/change-requests/{id} returns it. */
export interface ChangeDiff {
  title?: { before: string; after: string };
  measures?: { before: Measure[]; after: Measure[] };
  depends_on?: { before: string[]; after: string[] };
  status?: { before: GoalStatus; after: GoalStatus };
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  /** The approver or rejecter, once decided. */
  decided_by: { id: string; name: string } | null;
  /** The approval note or the rejection reason. */
  decision_note: string | null;
  diff: ChangeDiff;
  /** The goal version an approval created. */
  resulting_version: number | null;
  decided_at: string | null;
}

const hasChangeRequests = () => !!get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_change_requests'");

/** The change requests on goals this caller can read, filtered by state, newest updated_at first, at most `limit`. */
export function listChangeRequests(pp: PolicyPrincipal, state: ChangeRequestState | null, limit = 100): ChangeRequestSummary[] {
  if (!hasChangeRequests()) return [];
  void [pp, state, limit]; // the change-requests code reads its table here
  return [];
}

/** One change request on a goal this caller can read, or null (no such request, or the goal is unreadable). */
export function getChangeRequest(pp: PolicyPrincipal, id: string): ChangeRequestDetail | null {
  if (!hasChangeRequests()) return null;
  void [pp, id]; // the change-requests code reads its table here
  return null;
}
