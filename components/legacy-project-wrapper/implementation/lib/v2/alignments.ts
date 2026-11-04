import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { effectiveSet } from "./approval";
import { goalCore, goalObj, goalRow, parentIds, reviewParents, visibleGoal, type GoalRow } from "./goals";
import { canBind, canReadGoal, type PolicyPrincipal } from "./policy";
import { writeDirective } from "./directives";
import { holdNewlyBound } from "./requests";
import { openEpoch, sessionRow, type SessionRow } from "./sessions";
import { memberName, nameTo, need } from "./workspaces";
import { assertRevisionReached, oneOf, optStr, revisionRead, strList, type Body } from "./validate";

// Alignment = effect-scoped approval (plan rev 2, option D). Two choices in the UI:
//   contribution -> contributes_to only (a relationship; nothing about usage or directives changes)
//   work_toward  -> contributes_to + governing_goal + allocation_transfer for the listed sessions
// Each revision snapshots its approval requirements {for, set} (lib/v2/approval.ts gives each goal's set):
//   the target goal's approval set, always;
//   the source goal's approval set, when there is a source;
//   when allocation moves: each listed session's owner (a singleton set, for "sessions:<user>") and the approval set
//   of each listed session's currently bound goal.
// One approval from a set satisfies its requirement; an approval satisfies every requirement whose set holds the
// approver. The alignment is approved when every requirement is satisfied, so creating one is instant only when the
// requester alone satisfies all of them (they own every goal involved). Approving a link that would make the
// contribution tree loop is refused (409 cycle), at creation and at the approval that would complete it.
// Rows written before requirements stored a plain user-id array; each id reads as its own singleton requirement.
// A counter is a new revision by an approver; it voids every earlier approval. Every decision names the revision the
// person read (c10 C10-2): one sent from an older view is refused, never recorded against a revision they never saw.
// Revocation is prospective: a session whose current binding exists only because of the revoked alignment is
// suspended (binding_suspended), never moved back. A goal that is achieved or dropped takes no alignment: a request
// toward it (or from it) can no longer be approved, countered or accepted (409 goal_not_active, nothing recorded), and
// an approved work_toward toward it ends its sessions' binding the way a revocation does (E2E acycle3 A3-cross-2).

export type Choice = "contribution" | "work_toward";
export type AlignmentState = "pending" | "countered" | "approved" | "rejected" | "withdrawn" | "revoked";
export const ACTIONS = ["approve", "counter", "accept_counter", "reject", "withdraw", "revoke"] as const;
export type AlignmentAction = (typeof ACTIONS)[number];
type EffectKind = "contributes_to" | "governing_goal" | "allocation_transfer";

interface AlignmentRow {
  id: string;
  ws_id: string;
  requester_id: string;
  target_goal_id: string;
  source_goal_id: string | null;
  state: AlignmentState;
  revision: number;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}
interface RevisionRow {
  revision: number;
  choice: Choice;
  effects_json: string;
  approvers_json: string;
  note: string | null;
  author_id: string;
  created_at: string;
}

const effectsOf = (choice: Choice): EffectKind[] => (choice === "contribution" ? ["contributes_to"] : ["contributes_to", "governing_goal", "allocation_transfer"]);

/** One approval requirement. `for` is a goal id, "sessions:<user id>", or null for a legacy row. */
export interface Requirement {
  for: string | null;
  set: string[];
  approved_by: string | null;
}

function requirementsFor(requester: string, target: GoalRow, source: GoalRow | undefined, choice: Choice, sessions: SessionRow[]): Requirement[] {
  const out: Requirement[] = [];
  const add = (forId: string, set: string[]) => {
    if (!out.some((r) => r.for === forId)) out.push({ for: forId, set: [...new Set(set)].sort(), approved_by: null });
  };
  add(target.id, effectiveSet(target, requester));
  // Linking a goal under another one changes the source goal's tree, so its approval set must agree too.
  if (source) add(source.id, effectiveSet(source, requester));
  if (effectsOf(choice).includes("allocation_transfer")) {
    for (const s of sessions) add(`sessions:${s.user_id}`, [s.user_id]);
    for (const s of sessions) {
      const e = openEpoch(s.ws_id, s.session_key);
      const cur = e?.goal_id ? goalRow(s.ws_id, e.goal_id) : undefined;
      if (cur) add(cur.id, effectiveSet(cur, requester));
    }
  }
  return out;
}

/** A revision's requirements, with who satisfied each (legacy arrays read as one singleton set per user). */
function requirementsOf(rev: { approvers_json: string }, approvals: { user_id: string }[]): Requirement[] {
  const raw = JSON.parse(rev.approvers_json) as unknown[];
  const reqs: Requirement[] = raw.map((x) => (typeof x === "string" ? { for: null, set: [x], approved_by: null } : { ...(x as Requirement), approved_by: (x as Requirement).approved_by ?? null }));
  for (const r of reqs) if (!r.approved_by) r.approved_by = approvals.find((a) => r.set.includes(a.user_id))?.user_id ?? null;
  return reqs;
}

const approversIn = (reqs: Requirement[]) => [...new Set(reqs.flatMap((r) => r.set))].sort();

const CONTRIBUTION_CYCLE = "Approving this would make these goals contribute to each other in a loop.";
/** Would `source` contributing to `target` loop? True when the source is already reachable from the target by
 *  following approved parents. */
function contributionCycle(ws: string, sourceId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const stack = [targetId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === sourceId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...parentIds(ws, id));
  }
  return false;
}

function sessionsIn(pp: PolicyPrincipal, keys: string[], ownerId: string): SessionRow[] {
  return keys.map((k) => {
    const s = sessionRow(pp.wsId, k);
    if (!s || s.user_id !== ownerId) throw notFound();
    if (s.state === "stopped") throw conflict("sharing_stopped", "One of these sessions is no longer shared, so it can't be part of an alignment.");
    return s;
  });
}

/** 409 `already_governed` when a listed session already follows a goal through another alignment, worded for what is
 *  true: this very goal (nothing to change; E2E acycle2 A2-cross-7) or another one (revoke that first). */
function refuseGoverned(ws: string, keys: string[], alignmentId: string | null, targetGoalId: string): void {
  const governed = keys.map((k) => sessionRow(ws, k)).filter((s) => !!s?.governing_alignment_id && s.governing_alignment_id !== alignmentId);
  if (!governed.length) return;
  if (governed.every((s) => s!.governing_goal_id === targetGoalId)) {
    throw conflict(
      "already_governed",
      governed.length === keys.length && keys.length === 1
        ? "This session already follows this goal through an alignment, so there is nothing to change."
        : "One of these sessions already follows this goal through an alignment; leave it out.",
    );
  }
  throw conflict("already_governed", "One of these sessions already follows another goal through an alignment; revoke that one first.");
}

function writeRevision(a: { id: string; ws: string }, revision: number, choice: Choice, keys: string[], reqs: Requirement[], note: string | null, author: string, at: string) {
  run(
    "INSERT INTO v2_alignment_revisions (ws_id, alignment_id, revision, choice, effects_json, approvers_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    a.ws,
    a.id,
    revision,
    choice,
    JSON.stringify(effectsOf(choice)),
    JSON.stringify(reqs),
    note,
    author,
    at,
  );
  for (const k of keys) run("INSERT INTO v2_alignment_sessions (ws_id, alignment_id, revision, session_key) VALUES (?, ?, ?, ?)", a.ws, a.id, revision, k);
  // The revision's author agrees with it by writing it.
  if (approversIn(reqs).includes(author)) recordApproval(a.ws, a.id, revision, author, at);
}

const revisionOf = (id: string, revision: number) => get<RevisionRow>("SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? AND revision = ?", id, revision)!;
const approvalRows = (id: string, revision: number) =>
  all<{ user_id: string }>("SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ? ORDER BY at, rowid", id, revision);
const currentRequirements = (id: string, revision: number) => requirementsOf(revisionOf(id, revision), approvalRows(id, revision));

/** `user` approves this revision: every requirement whose set holds them records them as approved_by (if no one
 *  satisfied it first). */
function recordApproval(ws: string, id: string, revision: number, user: string, at: string) {
  run("INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", ws, id, revision, user, at);
  const reqs = currentRequirements(id, revision);
  run("UPDATE v2_alignment_revisions SET approvers_json = ? WHERE alignment_id = ? AND revision = ?", JSON.stringify(reqs), id, revision);
}
const keysOf = (id: string, revision: number) =>
  all<{ session_key: string }>("SELECT session_key FROM v2_alignment_sessions WHERE alignment_id = ? AND revision = ? ORDER BY session_key", id, revision).map((r) => r.session_key);
const approvalsOf = (id: string, revision: number) => new Set(all<{ user_id: string }>("SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ?", id, revision).map((r) => r.user_id));

/** Everyone who appears on any revision: the requester and everyone in any requirement's set. */
function involved(a: AlignmentRow): string[] {
  const set = new Set([a.requester_id]);
  for (const r of all<{ approvers_json: string }>("SELECT approvers_json FROM v2_alignment_revisions WHERE alignment_id = ?", a.id)) for (const u of approversIn(requirementsOf(r, []))) set.add(u);
  return [...set];
}

/** 409 goal_not_active, before anything is recorded, when the alignment's target or source goal is no longer active
 *  (achieved or dropped after the request was made): approving, countering or accepting it would bind sessions to, or
 *  record a contribution of, a goal that is done (E2E acycle3 A3-cross-2). Declining, withdrawing and revoking stay open. */
function refuseClosedGoals(pp: PolicyPrincipal, a: AlignmentRow): void {
  for (const [id, role] of [[a.target_goal_id, "target"], [a.source_goal_id, "source"]] as const) {
    const g = id ? goalRow(a.ws_id, id) : undefined;
    if (!g || g.status === "active") continue;
    const what = canReadGoal(pp, goalObj(g)) ? `"${g.title}"` : "A goal in this request";
    const why = role === "target" ? "so nothing can align with it" : "so it can't contribute to another goal";
    throw conflict("goal_not_active", `${what} was ${g.status} after the request was made, ${why}. Decline or withdraw this request instead.`);
  }
}

/** Approve, if every requirement of the current revision is satisfied (409 cycle if the link would loop). Applies the
 *  effects in this transaction.
 *  `actor` is whoever's action completed the approvals; the audit row names them. */
function maybeApprove(a: AlignmentRow, at: string, actor: string): boolean {
  const rev = revisionOf(a.id, a.revision);
  if (!currentRequirements(a.id, a.revision).every((r) => r.approved_by)) return false;
  if (a.source_goal_id && contributionCycle(a.ws_id, a.source_goal_id, a.target_goal_id)) throw conflict("cycle", CONTRIBUTION_CYCLE);
  const keys = keysOf(a.id, a.revision);
  if (rev.choice === "work_toward") {
    refuseGoverned(a.ws_id, keys, a.id, a.target_goal_id);
    const target = goalRow(a.ws_id, a.target_goal_id)!;
    const core = goalCore(target);
    for (const k of keys) {
      const s = sessionRow(a.ws_id, k);
      if (!s || s.state === "stopped") continue;
      run("UPDATE v2_sessions SET governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", target.id, a.id, at, a.ws_id, k);
      // One binding_changed per session: the agent opens a new epoch with this goal at its next root turn.
      writeDirective(a.ws_id, "binding_changed", [k], core, { goal_id: target.id, effective: "next_root_turn", cause: `alignment:${a.id}` });
      holdNewlyBound(a.ws_id, target.id, k); // a held goal holds the sessions that now follow it
    }
  }
  run("UPDATE v2_alignments SET state = 'approved', decided_at = ?, updated_at = ? WHERE id = ?", at, at, a.id);
  if (a.source_goal_id) reviewParents(a.ws_id, a.source_goal_id, at, a.target_goal_id); // the child starts reviewed against the parent as approved
  audit(a.ws_id, actor, "alignment.approved", a.id, at);
  return true;
}

export async function createAlignment(pp: PolicyPrincipal, b: Body) {
  need(pp, "alignment.create");
  const target = visibleGoal(pp, typeof b.target_goal_id === "string" ? b.target_goal_id : "");
  if (target.status !== "active") throw conflict("goal_not_active", "That goal is achieved or dropped, so nothing can align with it.");
  const sourceId = optStr(b, "source_goal_id", 64);
  const source = sourceId ? visibleGoal(pp, sourceId) : undefined;
  if (source && source.id === target.id) throw badRequest("A goal can't align with itself");
  if (source && !canBind(pp, goalObj(source), false)) throw forbidden("source_not_yours", "The source goal must be yours or your team's.");
  if (source && source.status !== "active") throw conflict("goal_not_active", "Your goal is achieved or dropped, so it can't contribute to another goal.");
  if (source && contributionCycle(pp.wsId, source.id, target.id)) throw conflict("cycle", CONTRIBUTION_CYCLE);
  const choice = oneOf(b, "choice", ["contribution", "work_toward"] as const);
  const keys = strList(b, "session_keys", { max: 50, itemMax: 43 });
  const sessions = sessionsIn(pp, keys, pp.userId);
  if (choice === "work_toward" && !sessions.length) throw badRequest("Pick at least one of your shared sessions to work toward this goal");
  if (choice === "contribution" && !sessions.length && !source) throw badRequest("Pick a goal of yours or at least one session that contributes");
  if (choice === "work_toward") refuseGoverned(pp.wsId, keys, null, target.id);
  const note = optStr(b, "note", 1000);
  const at = nowIso();
  const id = await tx(() => insertAlignment(pp, target, source, choice, sessions, note, at));
  return alignmentView(pp, alignmentRow(pp.wsId, id)!);
}

/** Write a validated request (inside the caller's tx) and approve it at once if the requester alone satisfies every
 *  requirement. Used by createAlignment and the sample workspace. */
export function insertAlignment(pp: PolicyPrincipal, target: GoalRow, source: GoalRow | undefined, choice: Choice, sessions: SessionRow[], note: string | null, at: string): string {
  const id = newId("al");
  run(
    "INSERT INTO v2_alignments (id, ws_id, requester_id, target_goal_id, source_goal_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)",
    id,
    pp.wsId,
    pp.userId,
    target.id,
    source?.id ?? null,
    at,
    at,
  );
  writeRevision({ id, ws: pp.wsId }, 1, choice, sessions.map((s) => s.session_key), requirementsFor(pp.userId, target, source, choice, sessions), note, pp.userId, at);
  audit(pp.wsId, pp.userId, "alignment.requested", id, at);
  maybeApprove(alignmentRow(pp.wsId, id)!, at, pp.userId);
  return id;
}

const alignmentRow = (ws: string, id: string) => get<AlignmentRow>("SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?", ws, id);

function visibleAlignment(pp: PolicyPrincipal, id: string): AlignmentRow {
  const a = alignmentRow(pp.wsId, id);
  if (!a) throw notFound();
  need(pp, "alignment.read", { kind: "alignment", involved: involved(a) });
  return a;
}

/** Who closed an alignment, from its audit row (the alignment keeps only revoked_by), or null. */
const closedBy = (a: AlignmentRow, action: string) => get<{ actor_id: string | null }>("SELECT actor_id FROM v2_audit WHERE ws_id = ? AND object_id = ? AND action = ? ORDER BY at DESC LIMIT 1", a.ws_id, a.id, action)?.actor_id ?? null;

/** Why a decision on an alignment in another state is refused (409 wrong_state), in the app's words ("declined", never
 *  "rejected") and naming who closed it: everyone who may act on it is involved in it and sees its approvers (Y5). The
 *  reader is "you", never their own name (c9 W3). */
function stateRefusal(a: AlignmentRow, reader: string): string {
  const by = (id: string | null) => (id ? ` by ${memberName(id)}` : "");
  switch (a.state) {
    case "pending":
      return "This request is waiting for approval.";
    case "countered":
      // The counter's author hears "You countered…", as on change requests and target changes (c10 W1).
      if (counterAuthor(a) === reader) return `You countered this request; it waits on ${nameTo(a.requester_id, reader)} to accept it.`;
      return `An approver suggested a change to this request; it waits on ${nameTo(a.requester_id, reader)} to accept it.`;
    case "approved":
      return "This request is already approved.";
    case "rejected": {
      const who = closedBy(a, "alignment.rejected");
      return who === reader ? "You declined this request, so nothing changes." : `This request was declined${by(who)}, so nothing changes.`;
    }
    case "withdrawn":
      return a.requester_id === reader ? "You withdrew this request, so nothing changes." : `This request was withdrawn by ${memberName(a.requester_id)}, so nothing changes.`;
    case "revoked": {
      const who = get<{ revoked_by: string | null }>("SELECT revoked_by FROM v2_alignments WHERE id = ?", a.id)?.revoked_by ?? null;
      return who === reader ? "You revoked this alignment." : `This alignment was revoked${by(who)}.`;
    }
  }
}

/** Who wrote the alignment's current revision, when that is a counter (else null). */
const counterAuthor = (a: AlignmentRow): string | null => (a.state === "countered" ? revisionOf(a.id, a.revision).author_id : null);

/** Why a decision sent for an earlier revision is refused (409 stale_revision), in the words change requests use: what
 *  changed, naming a counter's author ("you" to the reader), and what to do, never "reload". */
function revisionRefusal(a: AlignmentRow, reader: string): string {
  const author = counterAuthor(a);
  const what = author ? `${nameTo(author, reader)} countered it, and it is now at revision ${a.revision}` : `it is now at revision ${a.revision}`;
  return `This request changed after you read it: ${what}. Read it again and decide again.`;
}

export async function actOnAlignment(pp: PolicyPrincipal, id: string, action: AlignmentAction, b: Body) {
  const a0 = visibleAlignment(pp, id);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything.");
  // Every decision names the revision the person read (400 without one, in words: c11 W1), so it is never recorded
  // against a counter or a revision they never saw (c10 C10-2).
  const seen = revisionRead(b);
  const me = pp.userId;
  const at = nowIso();
  await tx(() => {
    const a = alignmentRow(pp.wsId, id)!; // re-read inside the transaction
    // A revision it never reached was never read: 400, not a stale refusal, as nothing changed (c11 W3).
    assertRevisionReached("request", seen, a.revision);
    if (a.revision !== a0.revision || a.state !== a0.state) throw conflict("stale_revision", "This request changed while your decision was being sent. Read it again and decide again.");
    const rev = revisionOf(a.id, a.revision);
    const approvers = approversIn(currentRequirements(a.id, a.revision));
    const isRequester = a.requester_id === me;
    const isApprover = approvers.includes(me);
    // Checked after the state, so a request closed meanwhile says who closed it rather than only its revision.
    const expectRevision = () => {
      if (seen !== a.revision) throw conflict("stale_revision", revisionRefusal(a, me));
    };
    const inState = (...s: AlignmentState[]) => {
      if (!s.includes(a.state)) throw conflict("wrong_state", stateRefusal(a, me));
    };
    switch (action) {
      case "approve": {
        inState("pending");
        expectRevision();
        if (!isApprover) throw forbidden("not_an_approver", "Your approval is not needed on this request.");
        refuseClosedGoals(pp, a);
        recordApproval(a.ws_id, a.id, a.revision, me, at);
        run("UPDATE v2_alignments SET updated_at = ? WHERE id = ?", at, a.id);
        maybeApprove(a, at, me);
        break;
      }
      case "counter": {
        inState("pending");
        expectRevision();
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can suggest a change.");
        refuseClosedGoals(pp, a);
        const prevKeys = keysOf(a.id, a.revision);
        const choice = b.choice === undefined ? rev.choice : oneOf(b, "choice", ["contribution", "work_toward"] as const);
        let keys = prevKeys;
        if (Array.isArray(b.keep)) {
          if (!b.keep.every((r) => Number.isInteger(r) && r >= 0 && r < prevKeys.length)) throw badRequest("keep must list session refs from this revision");
          keys = prevKeys.filter((_, i) => (b.keep as number[]).includes(i));
        } else if (b.session_keys !== undefined) keys = strList(b, "session_keys", { max: 50, itemMax: 43 });
        if (keys.some((k) => !prevKeys.includes(k))) throw badRequest("A counter can only keep or remove sessions from the request");
        if (choice === "work_toward" && !keys.length) throw badRequest("Working toward a goal needs at least one session");
        const target = goalRow(a.ws_id, a.target_goal_id)!;
        const source = a.source_goal_id ? goalRow(a.ws_id, a.source_goal_id) : undefined;
        if (choice === "contribution" && !keys.length && !source) throw badRequest("Keep at least one session or the source goal");
        const sessions = keys.map((k) => sessionRow(a.ws_id, k)).filter((s): s is SessionRow => !!s);
        const next = a.revision + 1;
        writeRevision({ id: a.id, ws: a.ws_id }, next, choice, keys, requirementsFor(a.requester_id, target, source, choice, sessions), optStr(b, "note", 1000), me, at);
        run("UPDATE v2_alignments SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?", next, at, a.id);
        audit(a.ws_id, me, "alignment.countered", a.id, at);
        break;
      }
      case "accept_counter": {
        inState("countered");
        expectRevision();
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can accept a suggested change.");
        refuseClosedGoals(pp, a);
        if (isApprover) recordApproval(a.ws_id, a.id, a.revision, me, at);
        run("UPDATE v2_alignments SET state = 'pending', updated_at = ? WHERE id = ?", at, a.id);
        maybeApprove({ ...a, state: "pending" }, at, me);
        break;
      }
      case "reject": {
        inState("pending", "countered");
        expectRevision();
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can decline.");
        run("UPDATE v2_alignments SET state = 'rejected', decided_at = ?, updated_at = ? WHERE id = ?", at, at, a.id);
        audit(a.ws_id, me, "alignment.rejected", a.id, at);
        break;
      }
      case "withdraw": {
        inState("pending", "countered");
        expectRevision();
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can withdraw.");
        run("UPDATE v2_alignments SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?", at, at, a.id);
        audit(a.ws_id, me, "alignment.withdrawn", a.id, at);
        break;
      }
      case "revoke": {
        inState("approved");
        expectRevision();
        if (!isRequester && !isApprover) throw forbidden("not_an_approver", "Only the person who asked or an approver can revoke.");
        run("UPDATE v2_alignments SET state = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE id = ?", at, me, at, a.id);
        if (rev.choice === "work_toward") endGovernance(a, at, `alignment:${a.id}`);
        audit(a.ws_id, me, "alignment.revoked", a.id, at);
        break;
      }
    }
  });
  return alignmentView(pp, alignmentRow(pp.wsId, id)!);
}

/** The sessions an approved work_toward alignment governs stop following its target (inside the caller's tx): their
 *  governing goal is cleared, and a session whose current binding exists only because of this alignment loses it:
 *  its open epoch ends now, it waits for its owner to pick a goal (`suspended`), and it gets one binding_suspended
 *  directive with `cause`. History never moves. */
function endGovernance(a: AlignmentRow, at: string, cause: string): void {
  run("UPDATE v2_sessions SET governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND governing_alignment_id = ?", at, a.ws_id, a.id);
  const suspended = all<{ session_key: string }>(
    "SELECT session_key FROM v2_epochs WHERE ws_id = ? AND ends_at IS NULL AND authority = 'alignment' AND alignment_id = ?",
    a.ws_id,
    a.id,
  ).map((r) => r.session_key);
  for (const k of suspended) {
    run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL", at, a.ws_id, k);
    run("UPDATE v2_sessions SET state = 'suspended', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state = 'shared'", at, a.ws_id, k);
  }
  writeDirective(a.ws_id, "binding_suspended", suspended, null, { goal_id: a.target_goal_id, effective: "next_root_turn", cause });
}

/** In the transaction that makes a goal achieved or dropped (lib/v2/goals.ts writeGoalVersion): every approved
 *  work_toward alignment toward it ends its sessions' binding as a revocation does, with `cause`
 *  `goal_closed:<alignment id>`, so no agent keeps being told it counts toward a goal that is done and its usage stops
 *  counting there (E2E acycle3 A3-cross-2). The alignment stays `approved` on the record; its effects say the goal
 *  closed. Requests still pending or countered stay as they are, and can only be declined or withdrawn. */
export function endAlignmentsToClosedGoal(ws: string, goalId: string, actorId: string, at: string): void {
  const rows = all<AlignmentRow>("SELECT * FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'", ws, goalId);
  for (const a of rows) {
    if (revisionOf(a.id, a.revision).choice !== "work_toward") continue;
    endGovernance(a, at, `goal_closed:${a.id}`);
    audit(ws, actorId, "alignment.goal_closed", a.id, at);
  }
}

// ---- what a person sees (plain words; goals they can't see stay unnamed) ----

function goalLabel(pp: PolicyPrincipal, id: string | null) {
  if (!id) return null;
  const g = goalRow(pp.wsId, id);
  if (!g || !canReadGoal(pp, goalObj(g))) return { id: null, title: null, visible: false };
  return { id: g.id, title: g.title, visible: true };
}
const named = (l: ReturnType<typeof goalLabel>) => (l?.visible ? `"${l.title}"` : "a goal you can't see");

function alignmentView(pp: PolicyPrincipal, a: AlignmentRow) {
  const rev = revisionOf(a.id, a.revision);
  const reqs = currentRequirements(a.id, a.revision);
  const approvers = approversIn(reqs);
  const approved = approvalsOf(a.id, a.revision);
  const keys = keysOf(a.id, a.revision);
  const target = goalLabel(pp, a.target_goal_id);
  const source = goalLabel(pp, a.source_goal_id);
  const sessions = keys.map((k, ref) => {
    const s = sessionRow(a.ws_id, k);
    if (!s) return null;
    const mine = s.user_id === pp.userId;
    const e = openEpoch(a.ws_id, k);
    return {
      ref, // position in this revision: a counter names sessions to keep by ref, since approvers don't see keys
      session_key: mine ? s.session_key : null,
      owner: { id: s.user_id, name: memberName(s.user_id) },
      label: mine ? s.title || s.repo_alias || `${s.harness} session` : s.repo_alias ? `${s.repo_alias} (${s.harness})` : `a ${s.harness} session`,
      // When it started and the key's last 6 characters, so two sessions of one person in one repository differ (X4), as
      // on the owner's list of everyone's sessions; never the whole key for someone else's.
      started_at: s.started_at,
      key_end: s.session_key.slice(-6),
      current_goal: goalLabel(pp, e?.goal_id ?? null),
    };
  }).filter(Boolean);
  const who = sessions.length === 1 ? "this session" : `these ${sessions.length} sessions`;
  const kinds = JSON.parse(rev.effects_json) as EffectKind[];
  // An approved "work toward" says which of its sessions still follow the goal: one moved off it since (a switch_goal it
  // accepted, a goal its owner picked, sharing stopped) no longer does, and its effect lines must not claim it does.
  const following = a.state === "approved" && kinds.includes("governing_goal") ? keys.filter((k) => sessionRow(a.ws_id, k)?.governing_alignment_id === a.id).length : sessions.length;
  const gone = sessions.length - following;
  // An approved work_toward whose target was achieved or dropped since governs nothing: its effects say so.
  const targetRow = goalRow(a.ws_id, a.target_goal_id);
  const closed = a.state === "approved" && !!targetRow && targetRow.status !== "active" ? targetRow.status : null;
  // "No usage moves" only when nothing else in this alignment moves it (contribution only); work toward also transfers
  // the sessions' future usage, said in its own line.
  const movesUsage = kinds.includes("allocation_transfer");
  const effects = kinds.map((kind) => ({
    kind,
    text:
      kind === "contributes_to"
        ? `Records that ${a.source_goal_id ? `${named(source)} contributes` : `${who} ${sessions.length === 1 ? "contributes" : "contribute"}`} to ${named(target)}.${movesUsage ? "" : " No usage moves."}`
        : closed
          ? kind === "governing_goal"
            ? `${sessions.length === 1 ? "This session no longer follows" : `${who[0].toUpperCase()}${who.slice(1)} no longer follow`} ${named(target)}: that goal was ${closed}.`
            : `Future usage from ${who} no longer counts under ${named(target)}: that goal was ${closed}. Past usage stays where it is.`
          : kind === "governing_goal"
            ? gone === 0
              ? sessions.length === 1
                ? `This session follows ${named(target)}: its agent gets that goal and its changes.`
                : `${who[0].toUpperCase()}${who.slice(1)} follow ${named(target)}: their agents get that goal and its changes.`
              : following === 0
                ? `${sessions.length === 1 ? "This session no longer follows" : `${who[0].toUpperCase()}${who.slice(1)} no longer follow`} ${named(target)}: ${sessions.length === 1 ? "it" : "they"} moved to another goal or stopped sharing.`
                : `${following} of ${who} still ${following === 1 ? "follows" : "follow"} ${named(target)}: ${following === 1 ? "its agent gets" : "their agents get"} that goal and its changes. The other ${gone} moved to another goal or stopped sharing.`
            : gone === 0
              ? `Future usage from ${who} counts under ${named(target)}. Past usage stays where it is.`
              : following === 0
                ? `Future usage from ${who} no longer counts under ${named(target)}. Past usage stays where it is.`
                : `Future usage from the ${following} still following counts under ${named(target)}. Past usage stays where it is.`,
  }));
  const me = pp.userId;
  const isRequester = a.requester_id === me;
  const isApprover = approvers.includes(me);
  // A request whose target or source goal was achieved or dropped since can only be declined or withdrawn (409
  // goal_not_active otherwise), so it offers nothing else and waits on no one.
  const goalsOpen = [a.target_goal_id, a.source_goal_id].every((id) => !id || goalRow(a.ws_id, id)?.status === "active");
  const can = {
    approve: a.state === "pending" && isApprover && !approved.has(me) && goalsOpen,
    counter: a.state === "pending" && isApprover && !isRequester && goalsOpen,
    reject: (a.state === "pending" || a.state === "countered") && isApprover && !isRequester,
    accept_counter: a.state === "countered" && isRequester && goalsOpen,
    withdraw: (a.state === "pending" || a.state === "countered") && isRequester,
    revoke: a.state === "approved" && (isRequester || isApprover),
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
  // A closed request is its decision: who declined, withdrew or revoked it, and when (A1-cross-8). Its approvals are
  // no longer waited for.
  const closer = a.state === "rejected" ? closedBy(a, "alignment.rejected") : a.state === "withdrawn" ? a.requester_id : a.state === "revoked" ? a.revoked_by : null;
  const history = all<RevisionRow>("SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? ORDER BY revision", a.id).map((r) => ({
    revision: r.revision,
    choice: r.choice,
    author: { id: r.author_id, name: memberName(r.author_id) },
    note: r.note,
    created_at: r.created_at,
  }));
  return {
    id: a.id,
    state: a.state,
    revision: a.revision,
    choice: rev.choice,
    requester: { id: a.requester_id, name: memberName(a.requester_id) },
    target_goal: target,
    source_goal: source,
    sessions,
    effects,
    requirements: reqs.map((r) => ({
      // A goal the caller can't read stays unnamed; "sessions:<user>" names the person whose sessions move.
      for: r.for && !r.for.startsWith("sessions:") && !goalLabel(pp, r.for)?.visible ? null : r.for,
      approvers: r.set.map((u) => ({ id: u, name: memberName(u) })),
      approved_by: r.approved_by ? { id: r.approved_by, name: memberName(r.approved_by) } : null,
    })),
    approvers: approvers.map((u) => ({ id: u, name: memberName(u), approved: approved.has(u) })),
    note: rev.note,
    history,
    waiting_on_me: can.approve || can.accept_counter,
    can,
    closed_by: closer ? { id: closer, name: memberName(closer) } : null,
    closed_at: a.state === "revoked" ? a.revoked_at : a.state === "rejected" || a.state === "withdrawn" ? a.decided_at : null,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

export function getAlignment(pp: PolicyPrincipal, id: string) {
  return alignmentView(pp, visibleAlignment(pp, id));
}

/** Requests the caller is part of, split for the alignments page. */
export function listAlignments(pp: PolicyPrincipal) {
  const rows = all<AlignmentRow>("SELECT * FROM v2_alignments WHERE ws_id = ? ORDER BY updated_at DESC", pp.wsId).filter((a) => involved(a).includes(pp.userId));
  const views = rows.map((a) => alignmentView(pp, a));
  return {
    waiting_on_me: views.filter((v) => v.waiting_on_me),
    mine: views.filter((v) => v.requester.id === pp.userId && !v.waiting_on_me),
    others: views.filter((v) => v.requester.id !== pp.userId && !v.waiting_on_me),
  };
}

export function assertAction(a: string): AlignmentAction {
  if (!(ACTIONS as readonly string[]).includes(a)) throw notFound();
  return a as AlignmentAction;
}


