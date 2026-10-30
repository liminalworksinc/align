import { ESTIMATES } from "./core.mts";
import { getChangeRequest as diffOf, type ChangeDiff } from "./changes-read";
import { getChangeRequest } from "./changes";
import { all, get, run, tx } from "./db";
import { badRequest, conflict } from "./errors";
import { event } from "./events";
import { goalObj, goalRow, parentIds } from "./goals";
import { newId, nowIso } from "./ids";
import { take } from "./limits";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { oneOf, type Body } from "./validate";
import { memberName } from "./workspaces";
import { cleanValueText, ESTIMATE_WORDS, followUpUrl, loiUrlOk, spanWords, VALUE_EDIT_DAYS, VALUE_NOTE_MAX } from "./value-core.mts";

// The decision value card on an approved change request (PORT-004): what was decided, who approved it, which goals it
// touches, whether agents have the new version, how long the decision took as Align measured it, and the value reports
// of the people involved (an estimate of how long it would have taken without Align, with an optional note; one per
// person per request, editable by its author for 7 days, stored in v2_value_reports). The content-free product events
// (value_card_viewed, value_reported with the estimate only, follow_up_clicked) are recorded once per person per
// workspace. The follow-up link (ALIGN_FOLLOW_UP_URL) is validated and hidden when it is unsafe. The plain rules (the
// answers, note cleaning, spans, the link check) are in lib/v2/value-core.mts, which the web app's card loads too.
// Who reads: every reader of the request (its goal's readers, viewers included) sees the card and records the events,
// and may save their own report; every report is shown to the request's participants (the requester, revision
// authors, the approver and the goal's approval set for it) and to workspace owners, anyone else sees only their own.
// Reports are retained and pseudonymised by the retention job (PERSON_COLUMNS) and deleted with the request.

export { ESTIMATES, followUpUrl, loiUrlOk, spanWords, VALUE_EDIT_DAYS, VALUE_NOTE_MAX };
export type Estimate = (typeof ESTIMATES)[number];
// The card's words and the event's allowed values are the same five ids, in the same order.
const sameEstimates: (typeof ESTIMATE_WORDS)[number]["id"] extends Estimate ? (Estimate extends (typeof ESTIMATE_WORDS)[number]["id"] ? true : never) : never = true;
void sameEstimates;

const EDIT_MS = VALUE_EDIT_DAYS * 24 * 3600 * 1000;

/** One person's value report on an approved change request. */
export interface ValueReport {
  id: string;
  person: { id: string; name: string };
  estimate: Estimate;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** The reader wrote it and it is less than 7 days old. */
  can_edit: boolean;
}

/** GET .../goals/{goal}/change-requests/{id}/value. */
export interface ValueView {
  change_request_id: string;
  goal: { id: string; title: string; version: number; team: { id: string; name: string } | null };
  diff: ChangeDiff;
  approved_by: { id: string; name: string };
  decided_at: string;
  created_at: string;
  approved_without_evidence: boolean | null;
  /** Readable goals only. */
  affected: { parents: { id: string; title: string }[]; dependents: { id: string; title: string }[] };
  /** The goal_version directive of the approved version: its target sessions, and those with a received or applied
   *  receipt; null when there was none. */
  delivery: { sessions: number; received: number; applied: number } | null;
  measured: { proposal_to_decision: string; decision_to_first_applied: string | null };
  /** The reader's own report, if any. */
  my_report: ValueReport | null;
  /** Every report, for the request's participants and approvers and workspace owners; else only the reader's own. */
  reports: ValueReport[];
  /** True when `reports` holds everyone's (the reader is a participant, an approver or a workspace owner). */
  sees_all_reports: boolean;
  follow_up_url: string | null;
}

interface ReportRow {
  id: string;
  person_id: string;
  estimate: Estimate;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** The request (404 when the caller can't read it or it is on another goal), and 409 not_approved unless approved. */
function approvedRequest(pp: PolicyPrincipal, goalId: string, requestId: string) {
  const cr = getChangeRequest(pp, requestId, goalId);
  if (cr.state !== "approved" || !cr.approved_by || !cr.decided_at || cr.version === null) throw conflict("not_approved", "This change request isn't approved, so it has no value card");
  return cr;
}

const reportOf = (pp: PolicyPrincipal, r: ReportRow, now: number): ValueReport => ({
  id: r.id,
  person: { id: r.person_id, name: memberName(r.person_id) },
  estimate: r.estimate,
  note: r.note,
  created_at: r.created_at,
  updated_at: r.updated_at,
  can_edit: r.person_id === pp.userId && now - Date.parse(r.created_at) < EDIT_MS,
});

const reportRows = (ws: string, requestId: string) =>
  all<ReportRow>("SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? ORDER BY created_at, id", ws, requestId);

/** The value card of an approved change request, for a reader of it (404 when unreadable, 409 not_approved). */
export function valueView(pp: PolicyPrincipal, goalId: string, requestId: string): ValueView {
  const cr = approvedRequest(pp, goalId, requestId);
  const g = goalRow(pp.wsId, cr.goal.id)!;
  const readable = (id: string) => {
    const r = goalRow(pp.wsId, id);
    return r && canReadGoal(pp, goalObj(r)) ? { id: r.id, title: r.title } : null;
  };
  const parents = parentIds(pp.wsId, g.id)
    .map(readable)
    .filter((x) => !!x);
  // Goals that depend on this one or contribute to it: they may need to follow the decision.
  const dependentIds = new Set([
    ...all<{ id: string }>("SELECT g.id FROM v2_goals g, json_each(g.depends_on_json) d WHERE g.ws_id = ? AND d.value = ?", pp.wsId, g.id).map((r) => r.id),
    ...all<{ id: string }>("SELECT DISTINCT source_goal_id AS id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved' AND source_goal_id IS NOT NULL", pp.wsId, g.id).map((r) => r.id),
  ]);
  dependentIds.delete(g.id);
  const dependents = [...dependentIds]
    .sort()
    .map(readable)
    .filter((x) => !!x);
  const team = g.pod_id ? get<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, g.pod_id) ?? null : null;

  // Delivery: the goal_version directive the approval wrote for this version (none when no session was bound).
  const dir = get<{ id: string }>(
    "SELECT id FROM v2_directives WHERE ws_id = ? AND goal_id = ? AND kind = 'goal_version' AND json_extract(goal_json, '$.version') = ? ORDER BY seq LIMIT 1",
    pp.wsId,
    g.id,
    cr.version,
  );
  let delivery: ValueView["delivery"] = null;
  let firstApplied: string | null = null;
  if (dir) {
    const n = (sql: string) => get<{ n: number }>(sql, dir.id)?.n ?? 0;
    delivery = {
      sessions: n("SELECT COUNT(*) AS n FROM v2_directive_targets WHERE directive_id = ?"),
      received: n("SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ?"),
      applied: n("SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')"),
    };
    // Server time (recorded_at), never the device's clock.
    firstApplied = get<{ at: string | null }>("SELECT MIN(recorded_at) AS at FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')", dir.id)?.at ?? null;
  }
  const decided = Date.parse(cr.decided_at!);
  const toApplied = firstApplied ? spanWords(Math.max(0, Date.parse(firstApplied) - decided)) : null;

  const now = Date.now();
  const participants = new Set<string>([cr.requester.id, cr.approved_by!.id, ...cr.approvers.map((a) => a.id), ...cr.revisions.map((r) => r.author.id)]);
  const seesAll = pp.wsRole === "owner" || participants.has(pp.userId);
  const rows = reportRows(pp.wsId, cr.id);
  const mine = rows.find((r) => r.person_id === pp.userId);
  return {
    change_request_id: cr.id,
    goal: { id: g.id, title: g.title, version: cr.version!, team },
    diff: diffOf(pp, cr.id)?.diff ?? {},
    approved_by: cr.approved_by!,
    decided_at: cr.decided_at!,
    created_at: cr.created_at,
    approved_without_evidence: cr.approved_without_evidence,
    affected: { parents, dependents },
    delivery,
    measured: { proposal_to_decision: spanWords(Math.max(0, decided - Date.parse(cr.created_at))), decision_to_first_applied: toApplied },
    my_report: mine ? reportOf(pp, mine, now) : null,
    reports: (seesAll ? rows : rows.filter((r) => r.person_id === pp.userId)).map((r) => reportOf(pp, r, now)),
    sees_all_reports: seesAll,
    follow_up_url: followUpUrl(),
  };
}

export const VALUE_ACTIONS = ["viewed", "reported", "follow_up"] as const;

/** POST .../value {action: "viewed" | "reported" | "follow_up", estimate?, note?}: records the event (and, for
 *  "reported", saves or edits the reader's value report). `recorded` is false when the event was already there. */
export async function recordValue(pp: PolicyPrincipal, goalId: string, requestId: string, b: Body): Promise<{ recorded: boolean; report: ValueReport | null }> {
  const cr = approvedRequest(pp, goalId, requestId);
  const action = oneOf(b, "action", VALUE_ACTIONS);
  let estimate: Estimate | null = null;
  let note: string | null = null;
  if (action === "reported") {
    estimate = oneOf(b, "estimate", ESTIMATES);
    if (b.note !== undefined && b.note !== null && typeof b.note !== "string") throw badRequest("note must be text");
    note = typeof b.note === "string" ? cleanValueText(b.note) : "";
    if (note.length > VALUE_NOTE_MAX) throw badRequest(`note: at most ${VALUE_NOTE_MAX} characters`);
    if (!note) note = null;
  }
  take(`value:${pp.userId}`, 30, 60 * 1000);
  const ws = pp.wsId;
  const user = pp.userId;
  if (action === "viewed") return { recorded: await tx(() => event("value_card_viewed", { ws, user })), report: null };
  if (action === "follow_up") return { recorded: await tx(() => event("follow_up_clicked", { ws, user })), report: null };
  const at = nowIso();
  const recorded = await tx(() => {
    const prev = get<ReportRow>("SELECT * FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?", ws, cr.id, user);
    if (prev) {
      if (Date.parse(at) - Date.parse(prev.created_at) >= EDIT_MS) throw conflict("edit_closed", `A value report can be changed for ${VALUE_EDIT_DAYS} days after it was saved`);
      run("UPDATE v2_value_reports SET estimate = ?, note = ?, updated_at = ? WHERE id = ?", estimate, note, at, prev.id);
    } else {
      run("INSERT INTO v2_value_reports (id, ws_id, change_request_id, person_id, estimate, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", newId("vr"), ws, cr.id, user, estimate, note, at, at);
    }
    // The event carries the estimate only: never the note, the request or the goal.
    return event("value_reported", { ws, user, props: { estimate: estimate! } });
  });
  const row = get<ReportRow>("SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?", ws, cr.id, user)!;
  return { recorded, report: reportOf(pp, row, Date.now()) };
}
