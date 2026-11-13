// Caller-owned value types and explicit resource bindings.
import { all, get } from "./db";
import { badRequest } from "./errors";
import { goalTargets } from "./directives";
import { authorize, type PolicyPrincipal } from "./policy";
import { goalSpend, type Sums } from "./spend";
import { memberName } from "./workspaces";
import { oneOf, str, type Body } from "./validate";
import { create_evidence } from "../native/.bindings/server_evidence.js";

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type EvidenceSource = "person" | "agent";

export interface EvidenceRow {
    id: string;
    ws_id: string;
    change_request_id: string;
    revision: number;
    kind: EvidenceKind;
    url: string;
    label: string;
    source: EvidenceSource;
    added_by: string;
    added_at: string;
}

export type EvidenceView = ReturnType<typeof evidenceView>;

// ---- the Align snapshot ----
type GoalSpend = ReturnType<typeof goalSpend>;

interface StoredSnapshot {
    recorded_at: string;
    window: {
        from: string;
        to: string;
        days: number;
    };
    spend: GoalSpend;
    bound_sessions: number;
    last_activity_at: string | null;
}

export type SnapshotView = NonNullable<ReturnType<typeof snapshotView>>;

interface EvidenceRuntime {
  EVIDENCE_KINDS: readonly ["pr", "ci_run", "incident", "dashboard", "doc", "other"];
  EVIDENCE_PER_REVISION: 10;
  evidenceInput: (b: Body) => { kind: EvidenceKind; url: string; label: string; };
  evidenceRows: (requestId: string) => EvidenceRow[];
  evidenceCount: (requestId: string, revision: number) => number;
  evidenceView: (e: EvidenceRow, canRemove: boolean) => { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource; reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; };
  recordSnapshot: (ws: string, goalId: string, at: string) => string;
  snapshotView: (pp: PolicyPrincipal, json: string | null, revision: number) => { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null;
}
const evidenceService = create_evidence({
  all: (...args: Parameters<typeof all>) => all(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  goalTargets: (...args: Parameters<typeof goalTargets>) => goalTargets(...args),
  authorize: (...args: Parameters<typeof authorize>) => authorize(...args),
  goalSpend: (...args: Parameters<typeof goalSpend>) => goalSpend(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  oneOf: (...args: Parameters<typeof oneOf>) => oneOf(...args),
  str: (...args: Parameters<typeof str>) => str(...args),
  readURL: () => URL,
  readDate: () => Date,
}) as unknown as EvidenceRuntime;

export const EVIDENCE_KINDS = evidenceService.EVIDENCE_KINDS;
export const EVIDENCE_PER_REVISION = evidenceService.EVIDENCE_PER_REVISION;
/** `{kind, url, label}` from a request body: kind one of EVIDENCE_KINDS, url an https URL of at most 2048 characters
 *  with no user name or password (stored as parsed), label 1 to 120 characters. 400 otherwise. */
export function evidenceInput(b: Body): {
    kind: EvidenceKind;
    url: string;
    label: string;
} {
    return (0, evidenceService.evidenceInput)(b);
}
export const evidenceRows = (requestId: string): EvidenceRow[] => (0, evidenceService.evidenceRows)(requestId);
export const evidenceCount = (requestId: string, revision: number): number => (0, evidenceService.evidenceCount)(requestId, revision);
/** One link as every reader sees it. `can_remove` is filled in by the caller (lib/v2/changes.ts). */
export function evidenceView(e: EvidenceRow, canRemove: boolean): { id: string; revision: number; kind: "pr" | "ci_run" | "incident" | "dashboard" | "doc" | "other"; url: string; label: string; source: EvidenceSource;
/** How the app and the MCP tools label it. Never "verified". */
reported_as: "agent-reported" | "self-reported"; added_by: { id: string; name: string; }; added_at: string; can_remove: boolean; } {
    return (0, evidenceService.evidenceView)(e, canRemove);
}
/** What Align records with a revision written at `at` (inside the writer's transaction), as stored JSON. */
export function recordSnapshot(ws: string, goalId: string, at: string): string {
    return (0, evidenceService.recordSnapshot)(ws, goalId, at);
}
/** A stored snapshot for this reader: spend is null (spend_hidden) for someone who may not read spend. Revisions
 *  written before snapshots existed have none (null). */
export function snapshotView(pp: PolicyPrincipal, json: string | null, revision: number): { revision: number; recorded_by: "align"; recorded_at: string; window: { from: string; to: string; days: number; }; spend: { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<"api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown", Record<"requests" | "input" | "output" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "cache_write_unsplit" | "est_list_usd_micros" | "unpriced_requests", number>>; model: string; }[]; } | null; spend_hidden: boolean; bound_sessions: number; last_activity_at: string | null; } | null {
    return (0, evidenceService.snapshotView)(pp, json, revision);
}
