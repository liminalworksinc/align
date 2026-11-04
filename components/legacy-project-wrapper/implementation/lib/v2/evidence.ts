import { all, get } from "./db";
import { badRequest } from "./errors";
import { goalTargets } from "./directives";
import { authorize, type PolicyPrincipal } from "./policy";
import { goalSpend } from "./spend";
import { memberName } from "./workspaces";
import { oneOf, str, type Body } from "./validate";

// Evidence on change requests (PRESEED-006). Advisory: nothing here blocks an approval.
//   links     typed links {kind, url, label} on one revision, at most 10, each with who added it and its source:
//             "person" (a web session) or "agent" (MCP or a device token). Shown as self-reported or agent-reported,
//             never as verified: Align does not check what a link says.
//   snapshot  what Align itself knows about the goal, recorded by the server when each revision is written and never
//             taken from a client: the goal's spend over the last 30 days (total and by model, summed as the Spend
//             tab sums it), how many sessions are bound to it now, and its last activity.
// Who may add or remove a link, and when, is decided in lib/v2/changes.ts (it needs the request and its approval set).

export const EVIDENCE_KINDS = ["pr", "ci_run", "incident", "dashboard", "doc", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceSource = "person" | "agent";

export const EVIDENCE_PER_REVISION = 10;
const URL_MAX = 2048;
const LABEL_MAX = 120;
const SNAPSHOT_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

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

/** `{kind, url, label}` from a request body: kind one of EVIDENCE_KINDS, url an https URL of at most 2048 characters
 *  with no user name or password (stored as parsed), label 1 to 120 characters. 400 otherwise. */
export function evidenceInput(b: Body): { kind: EvidenceKind; url: string; label: string } {
  const kind = oneOf(b, "kind", EVIDENCE_KINDS);
  const raw = str(b, "url", URL_MAX);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest("url must be an https URL");
  }
  if (u.protocol !== "https:" || !u.hostname) throw badRequest("url must be an https URL");
  if (u.username || u.password) throw badRequest("url must not contain a user name or password");
  if (u.href.length > URL_MAX) throw badRequest(`url is too long (max ${URL_MAX} characters)`);
  const label = str(b, "label", LABEL_MAX);
  if (/[\u0000-\u001f\u007f]/.test(label)) throw badRequest("label must be one line of text");
  return { kind, url: u.href, label };
}

export const evidenceRows = (requestId: string) => all<EvidenceRow>("SELECT * FROM v2_change_request_evidence WHERE change_request_id = ? ORDER BY revision, added_at, id", requestId);

export const evidenceCount = (requestId: string, revision: number) =>
  get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ?", requestId, revision)?.n ?? 0;

/** One link as every reader sees it. `can_remove` is filled in by the caller (lib/v2/changes.ts). */
export function evidenceView(e: EvidenceRow, canRemove: boolean) {
  return {
    id: e.id,
    revision: e.revision,
    kind: e.kind,
    url: e.url,
    label: e.label,
    source: e.source,
    /** How the app and the MCP tools label it. Never "verified". */
    reported_as: e.source === "agent" ? ("agent-reported" as const) : ("self-reported" as const),
    added_by: { id: e.added_by, name: memberName(e.added_by) },
    added_at: e.added_at,
    can_remove: canRemove,
  };
}
export type EvidenceView = ReturnType<typeof evidenceView>;

// ---- the Align snapshot ----

type GoalSpend = ReturnType<typeof goalSpend>;

interface StoredSnapshot {
  recorded_at: string;
  window: { from: string; to: string; days: number };
  spend: GoalSpend;
  bound_sessions: number;
  last_activity_at: string | null;
}

/** The goal's latest activity: a request uploaded under it, a session bound to it, or a work signal on it. */
function lastActivity(ws: string, goalId: string): string | null {
  const r = get<{ at: string | null }>(
    `SELECT MAX(at) AS at FROM (
       SELECT MAX(u.ts) AS at FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE e.ws_id = ? AND e.goal_id = ?
       UNION ALL SELECT MAX(starts_at) FROM v2_epochs WHERE ws_id = ? AND goal_id = ?
       UNION ALL SELECT MAX(at) FROM v2_activity WHERE ws_id = ? AND goal_id = ?
     )`,
    ws,
    goalId,
    ws,
    goalId,
    ws,
    goalId,
  );
  return r?.at ?? null;
}

/** What Align records with a revision written at `at` (inside the writer's transaction), as stored JSON. */
export function recordSnapshot(ws: string, goalId: string, at: string): string {
  const to = at;
  const from = new Date(Date.parse(at) - SNAPSHOT_DAYS * DAY_MS).toISOString();
  const snap: StoredSnapshot = {
    recorded_at: at,
    window: { from, to, days: SNAPSHOT_DAYS },
    spend: goalSpend(ws, goalId, from, to),
    bound_sessions: goalTargets(ws, goalId).length,
    last_activity_at: lastActivity(ws, goalId),
  };
  return JSON.stringify(snap);
}

/** A stored snapshot for this reader: spend is null (spend_hidden) for someone who may not read spend. Revisions
 *  written before snapshots existed have none (null). */
export function snapshotView(pp: PolicyPrincipal, json: string | null, revision: number) {
  if (!json) return null;
  const s = JSON.parse(json) as StoredSnapshot;
  const canSpend = authorize(pp, "spend.read", { kind: "workspace" }).ok;
  return {
    revision,
    recorded_by: "align" as const,
    recorded_at: s.recorded_at,
    window: s.window,
    spend: canSpend ? s.spend : null,
    spend_hidden: !canSpend,
    bound_sessions: s.bound_sessions,
    last_activity_at: s.last_activity_at,
  };
}
export type SnapshotView = NonNullable<ReturnType<typeof snapshotView>>;
