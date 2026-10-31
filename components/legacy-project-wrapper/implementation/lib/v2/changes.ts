import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso } from "./ids";
import { effectiveSet, launchSet } from "./approval";
import { contentOf, goalObj, goalRow, nextContent, sameContent, versionContentOf, visibleGoal, writeGoalVersion, type GoalContent, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName } from "./workspaces";
import { nonNegInt, optStr, str, type Body } from "./validate";
import { EVIDENCE_PER_REVISION, evidenceCount, evidenceInput, evidenceRows, evidenceView, recordSnapshot, snapshotView, type EvidenceSource } from "./evidence";

// Change requests: a member proposes a new version of a goal they can read but don't own (owners just publish a
// version). The goal's approval set decides, under the requester rule (lib/v2/approval.ts): one approval is enough.
//   pending -> approved | rejected | withdrawn | superseded;  pending -> countered -> pending (accept_counter)
//   approve        an approver, at the current revision, while the goal is still at base_version (else 409
//                  stale_version and the requester rebases). It records the decision and keeps the resulting content
//                  on the request (approved_json, launch "pending"): no goal version, no directive (LAUNCH-001).
//   launch         the launch set (the effective approval set plus workspace owners) publishes the approved content
//                  as the goal's next version, authored by the approver, through writeGoalVersion: the same path as an
//                  owner's edit, so goal_version directives reach bound sessions in the same transaction. Nothing
//                  else here writes a directive. not_yet records that it waits (a later decision replaces it);
//                  approve_and_launch does both in one transaction, audited as two decisions.
//   reject         an approver, with a reason;  counter: an approver replaces the changes (new revision), optionally
//                  with an "Accept if…" condition, which only the requester acknowledges (acknowledge, LAUNCH-002):
//                  never a gate on approval or launch, never "verified".
//   accept_counter / acknowledge / withdraw / rebase: the requester only
// A goal that becomes achieved or dropped supersedes every open request on it, and any newer version supersedes the
// approved requests still waiting for launch (writeGoalVersion does both).
// Everyone who can read the goal can read its requests (viewers too); viewers can't act. A request is its own
// decision record once approved or rejected.
// Evidence (lib/v2/evidence.ts): each revision carries the snapshot Align recorded when it was written, and the
// evidence links the requester or an approver added to it while it was current and the request open. Approving a
// revision with no links is allowed, and recorded (approved_without_evidence, plus its own audit action).

export const CHANGE_REQUEST_STATES = ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"] as const;
export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];
export const CHANGE_REQUEST_ACTIONS = ["approve", "approve_and_launch", "launch", "not_yet", "reject", "counter", "accept_counter", "acknowledge", "withdraw", "rebase"] as const;
export type ChangeRequestAction = (typeof CHANGE_REQUEST_ACTIONS)[number];
/** Where an approved request stands toward agents: pending (no launch decision yet), not_yet, launched, or superseded
 *  (the goal got a newer version, or closed, before the launch). null before approval. */
export const LAUNCH_STATES = ["pending", "not_yet", "launched", "superseded"] as const;
export type LaunchState = (typeof LAUNCH_STATES)[number];

/** The fields a change request may change (anchors are the owner's: they describe where the owner's work happens).
 *  Limits are goal content too: a change request is how anyone but the owner proposes them, and an approval by the
 *  goal's approval set is what confirms them. */
const CHANGE_KEYS = ["title", "measures", "depends_on", "status", "limits"] as const;
type ChangeKey = (typeof CHANGE_KEYS)[number];
export type Changes = Partial<Pick<GoalContent, ChangeKey>>;

const TEXT_MAX = 2000;

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

const sortedIds = (ids: string[]) => [...ids].sort().join(",");

/** Validate `changes` against the content it would change (the base version): only title, measures, depends_on,
 *  status and limits, each checked like a new goal version (400, 404 for a dependency the caller can't read, 409 cycle,
 *  409 no_change). Keeps only the fields that differ from the base. */
function changesIn(pp: PolicyPrincipal, goalId: string, base: GoalContent, v: unknown): Changes {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest("changes must be an object with title, measures, depends_on, status or limits");
  const b = v as Body;
  const keys = Object.keys(b);
  if (!keys.length) throw badRequest("changes must name at least one of title, measures, depends_on, status or limits");
  const other = keys.find((k) => !(CHANGE_KEYS as readonly string[]).includes(k));
  if (other) throw badRequest(`changes: ${other} can't be proposed (only title, measures, depends_on, status and limits)`);
  const next = nextContent(pp, goalId, base, b);
  const out: Changes = {};
  if (next.title !== base.title) out.title = next.title;
  if (JSON.stringify(next.measures) !== JSON.stringify(base.measures)) out.measures = next.measures;
  if (sortedIds(next.depends_on) !== sortedIds(base.depends_on)) out.depends_on = next.depends_on;
  if (next.status !== base.status) out.status = next.status;
  if (JSON.stringify(next.limits) !== JSON.stringify(base.limits)) out.limits = next.limits;
  return out;
}

const applied = (base: GoalContent, c: Changes): GoalContent => ({ ...base, ...c });

const crRow = (ws: string, id: string) => get<ChangeRequestRow>("SELECT * FROM v2_change_requests WHERE ws_id = ? AND id = ?", ws, id);

const openRequestOf = (ws: string, goalId: string, userId: string) =>
  get<{ id: string }>("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND requester_id = ? AND state IN ('pending','countered')", ws, goalId, userId);

/** The request if the caller can read its goal (and, when named, it is on that goal), else 404. */
function visibleRequest(pp: PolicyPrincipal, id: string, goalId?: string): ChangeRequestRow {
  const r = crRow(pp.wsId, id);
  if (!r || (goalId && r.goal_id !== goalId)) throw notFound();
  visibleGoal(pp, r.goal_id);
  return r;
}

/** Write a new pending request at revision 1 (inside the caller's tx). The create route checks who may ask; the
 *  sample workspace seeds its request through here directly. */
export function insertChangeRequest(pp: PolicyPrincipal, g: GoalRow, changes: Changes, reason: string, at: string): string {
  const id = newId("cr");
  run(
    `INSERT INTO v2_change_requests (id, ws_id, goal_id, requester_id, state, revision, base_version, changes_json, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?, ?)`,
    id,
    pp.wsId,
    g.id,
    pp.userId,
    g.version,
    JSON.stringify(changes),
    reason,
    at,
    at,
  );
  writeRevision(pp.wsId, g.id, id, 1, g.version, changes, null, pp.userId, at);
  audit(pp.wsId, pp.userId, "change_request.created", id, at);
  return id;
}

/** A new revision, with the snapshot Align records for the goal now (in the caller's transaction). */
function writeRevision(ws: string, goalId: string, id: string, revision: number, baseVersion: number, changes: Changes, note: string | null, author: string, at: string, condition: string | null = null) {
  run(
    "INSERT INTO v2_change_request_revisions (ws_id, change_request_id, revision, base_version, changes_json, note, author_id, created_at, snapshot_json, condition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ws,
    id,
    revision,
    baseVersion,
    JSON.stringify(changes),
    note,
    author,
    at,
    recordSnapshot(ws, goalId, at),
    condition,
  );
}

const revisionRows = (id: string) => all<RevisionRow>("SELECT * FROM v2_change_request_revisions WHERE change_request_id = ? ORDER BY revision", id);

/** The revision whose condition is the request's: its latest counter (a revision with a note; rebases and the first
 *  revision have none). Its condition may be null. */
const counterRevision = (revs: RevisionRow[]) => [...revs].reverse().find((v) => v.note !== null);

export async function createChangeRequest(pp: PolicyPrincipal, goalId: string, b: Body) {
  const g = visibleGoal(pp, goalId);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  if (g.owner_id === pp.userId) throw forbidden("own_goal", "You own this goal. Save a new version instead.");
  if (g.status !== "active") throw conflict("goal_not_active", "This goal is achieved or dropped, so it takes no change requests");
  const baseVersion = nonNegInt(b, "base_version");
  if (baseVersion !== g.version) throw conflict("stale_version", `This goal changed while you were editing. Reload to start from version ${g.version}.`);
  const reason = str(b, "reason", TEXT_MAX);
  if (openRequestOf(pp.wsId, g.id, pp.userId)) throw conflict("already_open", "You already have an open change request on this goal.");
  const changes = changesIn(pp, g.id, contentOf(g), b.changes);
  const at = nowIso();
  const id = await tx(() => {
    // Again inside the transaction: the goal may have moved, or another request been opened, since we read it.
    const now = goalRow(pp.wsId, g.id)!;
    if (now.version !== g.version) throw conflict("stale_version", `This goal changed while you were editing. Reload to start from version ${now.version}.`);
    if (now.status !== "active") throw conflict("goal_not_active", "This goal is achieved or dropped, so it takes no change requests");
    if (openRequestOf(pp.wsId, g.id, pp.userId)) throw conflict("already_open", "You already have an open change request on this goal.");
    const created = insertChangeRequest(pp, now, changes, reason, at);
    // Here, not in insertChangeRequest: the sample workspace's seeded request is nobody's first.
    event("first_change_request", { ws: pp.wsId, user: pp.userId, at });
    return created;
  });
  return requestView(pp, crRow(pp.wsId, id)!);
}

export async function actOnChangeRequest(pp: PolicyPrincipal, goalId: string, id: string, action: ChangeRequestAction, b: Body) {
  visibleRequest(pp, id, goalId);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const me = pp.userId;
  const at = nowIso();
  await tx(() => {
    const r = crRow(pp.wsId, id)!; // read inside the transaction
    const g = goalRow(pp.wsId, r.goal_id)!;
    const isRequester = r.requester_id === me;
    const isApprover = effectiveSet(g, r.requester_id).includes(me);
    const changes = JSON.parse(r.changes_json) as Changes;
    const approverOnly = () => {
      if (!isApprover) throw forbidden("not_an_approver", "Only someone who can approve for this goal can do this");
    };
    const launcherOnly = () => {
      if (!launchSet(g, r.requester_id).includes(me)) throw forbidden("not_a_launcher", "Only someone who can approve for this goal, or a workspace owner, can launch it");
    };
    const requesterOnly = () => {
      if (!isRequester) throw forbidden("not_requester", "Only the person who asked can do this");
    };
    const inState = (...s: ChangeRequestState[]) => {
      if (!s.includes(r.state)) throw conflict("wrong_state", `This request is ${r.state}`);
    };
    const expectRevision = (required: boolean) => {
      if ((required || b.revision !== undefined) && b.revision !== r.revision) throw conflict("stale_revision", `This request is at revision ${r.revision}; reload and try again`);
    };
    /** Record the approval and keep the resulting content on the request, approved but unlaunched (no version, no
     *  directive). Returns that content. */
    const approve = (): GoalContent => {
      approverOnly();
      inState("pending");
      expectRevision(true);
      const note = optStr(b, "note", TEXT_MAX);
      if (g.version !== r.base_version) {
        throw conflict("stale_version", `The goal changed after this request was made. ${memberName(r.requester_id)} needs to update it before it can be approved.`);
      }
      const next = applied(contentOf(g), changes);
      if (sameContent(next, contentOf(g))) throw conflict("no_change", "This request no longer changes anything");
      // Advisory evidence: approving a revision with no links is allowed, and recorded on the decision and in the audit.
      const without = evidenceCount(r.id, r.revision) === 0 ? 1 : 0;
      run(
        "UPDATE v2_change_requests SET state = 'approved', approved_by = ?, decision_note = ?, decided_at = ?, updated_at = ?, approved_without_evidence = ?, launch = 'pending', approved_json = ? WHERE id = ?",
        me,
        note,
        at,
        at,
        without,
        JSON.stringify(next),
        r.id,
      );
      audit(pp.wsId, me, "change_request.approved", r.id, at);
      if (without) audit(pp.wsId, me, "change_request.approved_without_evidence", r.id, at);
      event("first_approval", { ws: pp.wsId, user: me, at });
      return next;
    };
    /** An approved request still waiting for launch, on a goal still at its base version (else 409). */
    const launchable = () => {
      if (r.state === "approved" && r.launch === "launched") throw conflict("wrong_state", `This change is already launched as version ${r.version}.`);
      if (r.state === "superseded" && r.launch === "superseded") throw conflict("wrong_state", `This change was superseded before launch. ${memberName(r.requester_id)} can propose it again.`);
      if (r.state !== "approved") throw conflict("wrong_state", `This request is ${r.state}`);
      // A newer version supersedes it in the same transaction, so this is a guard, not a path.
      if (g.version !== r.base_version) throw conflict("stale_version", `This goal is at version ${g.version}; reload and try again`);
    };
    /** Publish the approved content as the goal's next version (authored by the approver) with its directives. */
    const launch = (content: GoalContent, approvedBy: string) => {
      // Launched first, so the new version's supersede-before-launch step leaves this request alone.
      run("UPDATE v2_change_requests SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?", me, at, at, r.id);
      const written = writeGoalVersion(g, content, me, at, approvedBy);
      run("UPDATE v2_change_requests SET version = ? WHERE id = ?", written.version, r.id);
      audit(pp.wsId, me, "change_request.launched", r.id, at);
      event("first_launch", { ws: pp.wsId, user: me, at });
    };
    switch (action) {
      case "approve": {
        approve();
        break;
      }
      case "approve_and_launch": {
        const content = approve();
        launcherOnly(); // every approver may launch; checked all the same
        launch(content, me);
        break;
      }
      case "launch": {
        launcherOnly();
        launchable();
        expectRevision(false);
        launch(JSON.parse(r.approved_json!) as GoalContent, r.approved_by!);
        break;
      }
      case "not_yet": {
        launcherOnly();
        launchable();
        expectRevision(false);
        run("UPDATE v2_change_requests SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?", me, at, at, r.id);
        audit(pp.wsId, me, "change_request.not_yet", r.id, at);
        break;
      }
      case "acknowledge": {
        requesterOnly();
        inState("pending", "approved");
        const c = counterRevision(revisionRows(r.id));
        if (!c?.condition) throw conflict("no_condition", "This request has no condition to acknowledge");
        if (b.revision !== undefined && b.revision !== c.revision) throw conflict("stale_revision", `The condition is on revision ${c.revision}; reload and try again`);
        if (c.acknowledged_by) throw conflict("already_acknowledged", "This condition is already acknowledged");
        run("UPDATE v2_change_request_revisions SET acknowledged_by = ?, acknowledged_at = ? WHERE change_request_id = ? AND revision = ?", me, at, r.id, c.revision);
        run("UPDATE v2_change_requests SET updated_at = ? WHERE id = ?", at, r.id);
        audit(pp.wsId, me, "change_request.condition_acknowledged", r.id, at);
        break;
      }
      case "reject": {
        approverOnly();
        inState("pending", "countered");
        expectRevision(false);
        const reason = str(b, "reason", TEXT_MAX);
        run("UPDATE v2_change_requests SET state = 'rejected', rejected_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?", me, reason, at, at, r.id);
        audit(pp.wsId, me, "change_request.rejected", r.id, at);
        break;
      }
      case "counter": {
        approverOnly();
        inState("pending");
        expectRevision(false);
        const note = str(b, "note", TEXT_MAX);
        const condition = b.condition === undefined || b.condition === null ? null : str(b, "condition", TEXT_MAX);
        const base = versionContentOf(pp.wsId, g.id, r.base_version)!;
        const countered = changesIn(pp, g.id, base, b.changes);
        const next = r.revision + 1;
        writeRevision(pp.wsId, g.id, r.id, next, r.base_version, countered, note, me, at, condition);
        run("UPDATE v2_change_requests SET state = 'countered', revision = ?, changes_json = ?, updated_at = ? WHERE id = ?", next, JSON.stringify(countered), at, r.id);
        audit(pp.wsId, me, "change_request.countered", r.id, at);
        break;
      }
      case "accept_counter": {
        requesterOnly();
        inState("countered");
        expectRevision(false);
        run("UPDATE v2_change_requests SET state = 'pending', updated_at = ? WHERE id = ?", at, r.id);
        audit(pp.wsId, me, "change_request.counter_accepted", r.id, at);
        break;
      }
      case "withdraw": {
        requesterOnly();
        inState("pending", "countered");
        expectRevision(false);
        run("UPDATE v2_change_requests SET state = 'withdrawn', updated_at = ? WHERE id = ?", at, r.id);
        audit(pp.wsId, me, "change_request.withdrawn", r.id, at);
        break;
      }
      case "rebase": {
        requesterOnly();
        inState("pending");
        expectRevision(false);
        const baseVersion = nonNegInt(b, "base_version");
        if (baseVersion !== g.version) throw conflict("stale_version", `This goal is at version ${g.version}; reload and try again`);
        // The changes as sent, or the request's own, checked again against the goal as it is now.
        const rebased = changesIn(pp, g.id, contentOf(g), b.changes === undefined ? changes : b.changes);
        const next = r.revision + 1;
        writeRevision(pp.wsId, g.id, r.id, next, g.version, rebased, null, me, at);
        run("UPDATE v2_change_requests SET revision = ?, base_version = ?, changes_json = ?, updated_at = ? WHERE id = ?", next, g.version, JSON.stringify(rebased), at, r.id);
        audit(pp.wsId, me, "change_request.rebased", r.id, at);
        break;
      }
    }
  });
  return requestView(pp, crRow(pp.wsId, id)!);
}

// ---- evidence links ----

const isOpen = (r: ChangeRequestRow) => r.state === "pending" || r.state === "countered";

/** The requester or an approver may add a link to the current revision of an open request. */
const mayAddEvidence = (pp: PolicyPrincipal, r: ChangeRequestRow, approvers: string[]) =>
  pp.wsRole !== "viewer" && isOpen(r) && (r.requester_id === pp.userId || approvers.includes(pp.userId));

/** A link can still be removed, by its author, while its revision is current and the request open; then it is frozen. */
const mayRemoveEvidence = (pp: PolicyPrincipal, r: ChangeRequestRow, e: { revision: number; added_by: string }) =>
  pp.wsRole !== "viewer" && isOpen(r) && e.revision === r.revision && e.added_by === pp.userId;

/** Add `{kind, url, label, revision?}` to the request's current revision as the caller, from `source` ("person" for a
 *  web session, "agent" for MCP or a device token). `goalId` is the goal named in the path (MCP names none). */
export async function addEvidence(pp: PolicyPrincipal, goalId: string | undefined, id: string, b: Body, source: EvidenceSource) {
  visibleRequest(pp, id, goalId);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const input = evidenceInput(b);
  const at = nowIso();
  const evId = await tx(() => {
    const r = crRow(pp.wsId, id)!; // read inside the transaction
    const g = goalRow(pp.wsId, r.goal_id)!;
    const approvers = effectiveSet(g, r.requester_id);
    if (r.requester_id !== pp.userId && !approvers.includes(pp.userId)) {
      throw forbidden("not_involved", "Only the person who asked or someone who can approve can add evidence");
    }
    if (!isOpen(r)) throw conflict("wrong_state", `This request is ${r.state}`);
    if (b.revision !== undefined && b.revision !== r.revision) throw conflict("stale_revision", `This request is at revision ${r.revision}; reload and try again`);
    if (get("SELECT 1 AS x FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ? AND url = ?", r.id, r.revision, input.url)) {
      throw conflict("duplicate_evidence", "This link is already on this revision");
    }
    if (evidenceCount(r.id, r.revision) >= EVIDENCE_PER_REVISION) throw conflict("too_much_evidence", `A revision holds at most ${EVIDENCE_PER_REVISION} evidence links`);
    const newEv = newId("ev");
    run(
      "INSERT INTO v2_change_request_evidence (id, ws_id, change_request_id, revision, kind, url, label, source, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      newEv,
      pp.wsId,
      r.id,
      r.revision,
      input.kind,
      input.url,
      input.label,
      source,
      pp.userId,
      at,
    );
    run("UPDATE v2_change_requests SET updated_at = ? WHERE id = ?", at, r.id);
    audit(pp.wsId, pp.userId, "change_request.evidence_added", r.id, at);
    return newEv;
  });
  const view = requestView(pp, crRow(pp.wsId, id)!);
  return { evidence: view.revisions.flatMap((v) => v.evidence).find((e) => e.id === evId)!, change_request: view };
}

/** Remove one of the caller's own links from the current revision of an open request (404 if it isn't there). */
export async function removeEvidence(pp: PolicyPrincipal, goalId: string | undefined, id: string, evidenceId: string) {
  visibleRequest(pp, id, goalId);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const at = nowIso();
  await tx(() => {
    const r = crRow(pp.wsId, id)!;
    const e = get<{ revision: number; added_by: string }>("SELECT revision, added_by FROM v2_change_request_evidence WHERE id = ? AND change_request_id = ?", evidenceId, r.id);
    if (!e) throw notFound();
    if (e.added_by !== pp.userId) throw forbidden("not_evidence_author", "Only the person who added this link can remove it");
    if (!mayRemoveEvidence(pp, r, e)) throw conflict("evidence_frozen", "This link is kept as it was: its revision was superseded or the request was decided");
    run("DELETE FROM v2_change_request_evidence WHERE id = ?", evidenceId);
    run("UPDATE v2_change_requests SET updated_at = ? WHERE id = ?", at, r.id);
    audit(pp.wsId, pp.userId, "change_request.evidence_removed", r.id, at);
  });
  return requestView(pp, crRow(pp.wsId, id)!);
}

// ---- reading (the same object for a list item, one request and a decision record) ----

function requestView(pp: PolicyPrincipal, r: ChangeRequestRow) {
  const g = goalRow(r.ws_id, r.goal_id)!;
  const readable = (ids: string[]) =>
    ids.filter((id) => {
      const d = goalRow(r.ws_id, id);
      return !!d && canReadGoal(pp, goalObj(d));
    });
  const shown = (c: Changes): Changes => (c.depends_on ? { ...c, depends_on: readable(c.depends_on) } : c);
  const changes = JSON.parse(r.changes_json) as Changes;
  const fields = CHANGE_KEYS.filter((k) => k in changes);
  const base = versionContentOf(r.ws_id, r.goal_id, r.base_version)!;
  const result = r.state === "approved" && r.version ? versionContentOf(r.ws_id, r.goal_id, r.version) : undefined;
  const after = result ?? applied(base, changes);
  const pick = (c: GoalContent) => shown(Object.fromEntries(fields.map((k) => [k, c[k]])) as Changes);
  const approvers = effectiveSet(g, r.requester_id);
  const launchers = launchSet(g, r.requester_id);
  const me = pp.userId;
  const isRequester = r.requester_id === me;
  const isApprover = approvers.includes(me);
  const open = isOpen(r);
  const unlaunched = r.state === "approved" && (r.launch === "pending" || r.launch === "not_yet");
  const person = (id: string | null) => (id ? { id, name: memberName(id) } : null);
  const revRows = revisionRows(r.id);
  const counter = counterRevision(revRows);
  /** The request's "Accept if…" condition (its latest counter's), and the requester's acknowledgement. */
  const condition = counter?.condition
    ? { revision: counter.revision, text: counter.condition, acknowledged_by: person(counter.acknowledged_by), acknowledged_at: counter.acknowledged_at }
    : null;
  const can = {
    approve: r.state === "pending" && isApprover && r.base_version === g.version,
    approve_and_launch: r.state === "pending" && isApprover && r.base_version === g.version,
    reject: open && isApprover,
    counter: r.state === "pending" && isApprover,
    accept_counter: r.state === "countered" && isRequester,
    acknowledge: (r.state === "pending" || r.state === "approved") && isRequester && !!condition && !condition.acknowledged_by,
    withdraw: open && isRequester,
    rebase: r.state === "pending" && isRequester,
    add_evidence: mayAddEvidence(pp, r, approvers),
    launch: unlaunched && launchers.includes(me) && r.base_version === g.version,
    not_yet: unlaunched && launchers.includes(me) && r.base_version === g.version,
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
  const evidence = evidenceRows(r.id);
  const revisions = revRows.map((v) => ({
    revision: v.revision,
    base_version: v.base_version,
    changes: shown(JSON.parse(v.changes_json) as Changes),
    note: v.note,
    /** A counter's "Accept if…" condition (never sent to agents), and who acknowledged it and when. */
    condition: v.condition,
    acknowledged_by: person(v.acknowledged_by),
    acknowledged_at: v.acknowledged_at,
    author: person(v.author_id)!,
    created_at: v.created_at,
    /** The links added while this revision was current (frozen once it is superseded or the request decided). */
    evidence: evidence.filter((e) => e.revision === v.revision).map((e) => evidenceView(e, mayRemoveEvidence(pp, r, e))),
    /** What Align recorded about the goal when this revision was written. */
    snapshot: snapshotView(pp, v.snapshot_json, v.revision),
  }));
  return {
    id: r.id,
    goal: { id: g.id, title: g.title, version: g.version },
    state: r.state,
    revision: r.revision,
    base_version: r.base_version,
    /** True while the request is open and the goal has moved past its base version (approving needs a rebase). */
    behind: open && r.base_version !== g.version,
    requester: person(r.requester_id)!,
    changes: shown(changes),
    reason: r.reason,
    revisions,
    diff: { before: pick(base), after: pick(after) },
    approvers: approvers.map((id) => person(id)!),
    /** Who may launch it once approved: the approval set plus workspace owners. */
    launchers: launchers.map((id) => person(id)!),
    approved_by: person(r.approved_by),
    rejected_by: person(r.rejected_by),
    /** The approver's note (approved) or the rejection reason (rejected). */
    decision_note: r.decision_note,
    note: r.state === "approved" ? r.decision_note : null,
    rejection_reason: r.state === "rejected" ? r.decision_note : null,
    /** The goal version the launch created (null until launched). */
    version: r.version,
    /** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
    launch: r.launch ?? null,
    /** The latest not yet or launch: who and when. */
    launch_decided_by: person(r.launch_by),
    launch_decided_at: r.launch_at,
    condition,
    /** Links on the current revision (the one an approval decides). */
    evidence_count: evidence.filter((e) => e.revision === r.revision).length,
    /** Once approved: true when the approved revision had no evidence links. null until then, and for older rows. */
    approved_without_evidence: r.state === "approved" && r.approved_without_evidence !== null ? r.approved_without_evidence === 1 : null,
    can,
    waiting_on_me: can.approve || can.accept_counter || (can.launch && r.launch === "pending"),
    created_at: r.created_at,
    updated_at: r.updated_at,
    decided_at: r.decided_at,
  };
}

export type ChangeRequestView = ReturnType<typeof requestView>;

function stateFilter(state: string | null | undefined): ChangeRequestState | null {
  if (state === undefined || state === null || state === "") return null;
  if (!(CHANGE_REQUEST_STATES as readonly string[]).includes(state)) throw badRequest(`state must be one of ${CHANGE_REQUEST_STATES.join(", ")}`);
  return state as ChangeRequestState;
}

/** Change requests on goals the caller can read (viewers included), newest change first, optionally of one state
 *  (400 for an unknown one) and on one goal (404 if the caller can't read it). */
export function listChangeRequests(pp: PolicyPrincipal, opts: { state?: string | null; goalId?: string } = {}): ChangeRequestView[] {
  const state = stateFilter(opts.state);
  if (opts.goalId) visibleGoal(pp, opts.goalId);
  const rows = opts.goalId
    ? all<ChangeRequestRow>("SELECT * FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? ORDER BY updated_at DESC, id", pp.wsId, opts.goalId)
    : all<ChangeRequestRow>("SELECT * FROM v2_change_requests WHERE ws_id = ? ORDER BY updated_at DESC, id", pp.wsId);
  const readable = new Map<string, boolean>();
  const canRead = (goalId: string) => {
    if (!readable.has(goalId)) {
      const g = goalRow(pp.wsId, goalId);
      readable.set(goalId, !!g && canReadGoal(pp, goalObj(g)));
    }
    return readable.get(goalId)!;
  };
  return rows.filter((r) => (!state || r.state === state) && canRead(r.goal_id)).map((r) => requestView(pp, r));
}

/** The workspace Requests tab: waiting on me (my approve or accept_counter flag, or launch while nobody decided), mine, others. */
export function changeRequestGroups(pp: PolicyPrincipal, state?: string | null) {
  const views = listChangeRequests(pp, { state });
  return {
    waiting_on_me: views.filter((v) => v.waiting_on_me),
    mine: views.filter((v) => !v.waiting_on_me && v.requester.id === pp.userId),
    others: views.filter((v) => !v.waiting_on_me && v.requester.id !== pp.userId),
  };
}

/** One request with its revisions and diff (a decision record once approved or rejected); 404 when the caller
 *  can't read its goal, or when `goalId` is named and the request is on another goal. */
export function getChangeRequest(pp: PolicyPrincipal, id: string, goalId?: string): ChangeRequestView {
  return requestView(pp, visibleRequest(pp, id, goalId));
}

export function assertChangeRequestAction(a: string): ChangeRequestAction {
  if (!(CHANGE_REQUEST_ACTIONS as readonly string[]).includes(a)) throw notFound();
  return a as ChangeRequestAction;
}

/** A request's "Accept if…" condition and its acknowledgement, for reads that don't build the whole view (the MCP
 *  brief). The caller has checked that the person can read the request's goal. */
export function requestCondition(id: string) {
  const c = counterRevision(revisionRows(id));
  if (!c?.condition) return null;
  return { revision: c.revision, text: c.condition, acknowledged_by: c.acknowledged_by ? { id: c.acknowledged_by, name: memberName(c.acknowledged_by) } : null, acknowledged_at: c.acknowledged_at };
}
