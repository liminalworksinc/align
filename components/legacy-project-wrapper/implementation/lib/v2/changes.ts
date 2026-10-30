import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { effectiveSet } from "./approval";
import { contentOf, goalObj, goalRow, nextContent, sameContent, versionContentOf, visibleGoal, writeGoalVersion, type GoalContent, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName } from "./workspaces";
import { nonNegInt, optStr, str, type Body } from "./validate";

// Change requests: a member proposes a new version of a goal they can read but don't own (owners just publish a
// version). The goal's approval set decides, under the requester rule (lib/v2/approval.ts): one approval is enough.
//   pending -> approved | rejected | withdrawn | superseded;  pending -> countered -> pending (accept_counter)
//   approve        an approver, at the current revision, while the goal is still at base_version (else 409
//                  stale_version and the requester rebases). It writes the goal's next version, authored by the
//                  approver, through writeGoalVersion: the same path as an owner's edit, so goal_version directives
//                  reach bound sessions. Nothing else here writes a directive.
//   reject         an approver, with a reason;  counter: an approver replaces the changes (new revision)
//   accept_counter / withdraw / rebase: the requester only
// A goal that becomes achieved or dropped supersedes every open request on it (writeGoalVersion does that).
// Everyone who can read the goal can read its requests (viewers too); viewers can't act. A request is its own
// decision record once approved or rejected.

export const CHANGE_REQUEST_STATES = ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"] as const;
export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];
export const CHANGE_REQUEST_ACTIONS = ["approve", "reject", "counter", "accept_counter", "withdraw", "rebase"] as const;
export type ChangeRequestAction = (typeof CHANGE_REQUEST_ACTIONS)[number];

/** The fields a change request may change (anchors are the owner's: they describe where the owner's work happens). */
const CHANGE_KEYS = ["title", "measures", "depends_on", "status"] as const;
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
}
interface RevisionRow {
  revision: number;
  base_version: number;
  changes_json: string;
  note: string | null;
  author_id: string;
  created_at: string;
}

const sortedIds = (ids: string[]) => [...ids].sort().join(",");

/** Validate `changes` against the content it would change (the base version): only title, measures, depends_on
 *  and status, each checked like a new goal version (400, 404 for a dependency the caller can't read, 409 cycle,
 *  409 no_change). Keeps only the fields that differ from the base. */
function changesIn(pp: PolicyPrincipal, goalId: string, base: GoalContent, v: unknown): Changes {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest("changes must be an object with title, measures, depends_on or status");
  const b = v as Body;
  const keys = Object.keys(b);
  if (!keys.length) throw badRequest("changes must name at least one of title, measures, depends_on or status");
  const other = keys.find((k) => !(CHANGE_KEYS as readonly string[]).includes(k));
  if (other) throw badRequest(`changes: ${other} can't be proposed (only title, measures, depends_on and status)`);
  const next = nextContent(pp, goalId, base, b);
  const out: Changes = {};
  if (next.title !== base.title) out.title = next.title;
  if (JSON.stringify(next.measures) !== JSON.stringify(base.measures)) out.measures = next.measures;
  if (sortedIds(next.depends_on) !== sortedIds(base.depends_on)) out.depends_on = next.depends_on;
  if (next.status !== base.status) out.status = next.status;
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
  writeRevision(pp.wsId, id, 1, g.version, changes, null, pp.userId, at);
  audit(pp.wsId, pp.userId, "change_request.created", id, at);
  return id;
}

function writeRevision(ws: string, id: string, revision: number, baseVersion: number, changes: Changes, note: string | null, author: string, at: string) {
  run(
    "INSERT INTO v2_change_request_revisions (ws_id, change_request_id, revision, base_version, changes_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ws,
    id,
    revision,
    baseVersion,
    JSON.stringify(changes),
    note,
    author,
    at,
  );
}

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
    return insertChangeRequest(pp, now, changes, reason, at);
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
    const requesterOnly = () => {
      if (!isRequester) throw forbidden("not_requester", "Only the person who asked can do this");
    };
    const inState = (...s: ChangeRequestState[]) => {
      if (!s.includes(r.state)) throw conflict("wrong_state", `This request is ${r.state}`);
    };
    const expectRevision = (required: boolean) => {
      if ((required || b.revision !== undefined) && b.revision !== r.revision) throw conflict("stale_revision", `This request is at revision ${r.revision}; reload and try again`);
    };
    switch (action) {
      case "approve": {
        approverOnly();
        inState("pending");
        expectRevision(true);
        const note = optStr(b, "note", TEXT_MAX);
        if (g.version !== r.base_version) {
          throw conflict("stale_version", `The goal changed after this request was made. ${memberName(r.requester_id)} needs to update it before it can be approved.`);
        }
        const next = applied(contentOf(g), changes);
        if (sameContent(next, contentOf(g))) throw conflict("no_change", "This request no longer changes anything");
        // Decided first, so the new version's supersede step (achieved or dropped) leaves this request alone.
        run("UPDATE v2_change_requests SET state = 'approved', approved_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?", me, note, at, at, r.id);
        const written = writeGoalVersion(g, next, me, at);
        run("UPDATE v2_change_requests SET version = ? WHERE id = ?", written.version, r.id);
        audit(pp.wsId, me, "change_request.approved", r.id, at);
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
        const base = versionContentOf(pp.wsId, g.id, r.base_version)!;
        const countered = changesIn(pp, g.id, base, b.changes);
        const next = r.revision + 1;
        writeRevision(pp.wsId, r.id, next, r.base_version, countered, note, me, at);
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
        writeRevision(pp.wsId, r.id, next, g.version, rebased, null, me, at);
        run("UPDATE v2_change_requests SET revision = ?, base_version = ?, changes_json = ?, updated_at = ? WHERE id = ?", next, g.version, JSON.stringify(rebased), at, r.id);
        audit(pp.wsId, me, "change_request.rebased", r.id, at);
        break;
      }
    }
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
  const me = pp.userId;
  const isRequester = r.requester_id === me;
  const isApprover = approvers.includes(me);
  const open = r.state === "pending" || r.state === "countered";
  const can = {
    approve: r.state === "pending" && isApprover && r.base_version === g.version,
    reject: open && isApprover,
    counter: r.state === "pending" && isApprover,
    accept_counter: r.state === "countered" && isRequester,
    withdraw: open && isRequester,
    rebase: r.state === "pending" && isRequester,
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
  const person = (id: string | null) => (id ? { id, name: memberName(id) } : null);
  const revisions = all<RevisionRow>("SELECT * FROM v2_change_request_revisions WHERE change_request_id = ? ORDER BY revision", r.id).map((v) => ({
    revision: v.revision,
    base_version: v.base_version,
    changes: shown(JSON.parse(v.changes_json) as Changes),
    note: v.note,
    author: person(v.author_id)!,
    created_at: v.created_at,
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
    approved_by: person(r.approved_by),
    rejected_by: person(r.rejected_by),
    /** The approver's note (approved) or the rejection reason (rejected). */
    decision_note: r.decision_note,
    note: r.state === "approved" ? r.decision_note : null,
    rejection_reason: r.state === "rejected" ? r.decision_note : null,
    version: r.version,
    can,
    waiting_on_me: can.approve || can.accept_counter,
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

/** The workspace Requests tab: waiting on me (my approve or accept_counter flag is set), mine, others. */
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
