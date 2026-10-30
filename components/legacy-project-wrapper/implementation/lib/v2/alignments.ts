import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { goalCore, goalObj, goalRow, reviewParents, visibleGoal, type GoalRow } from "./goals";
import { canBind, canReadGoal, type PolicyPrincipal } from "./policy";
import { writeDirective } from "./directives";
import { openEpoch, sessionRow, type SessionRow } from "./sessions";
import { memberName, need } from "./workspaces";
import { oneOf, optStr, strList, type Body } from "./validate";

// Alignment = effect-scoped approval (plan rev 2, option D). Two choices in the UI:
//   contribution -> contributes_to only (a relationship; nothing about usage or directives changes)
//   work_toward  -> contributes_to + governing_goal + allocation_transfer for the listed sessions
// Required approvers are computed from the effects and snapshotted on each revision:
//   the target goal's owner, always;
//   when allocation moves: each listed session's owner, and the owner of the goal the allocation leaves (each
//   session's current goal, and the source goal) when the requester doesn't own it.
// A counter is a new revision by an approver; it voids every earlier approval. Approve names the revision.
// Revocation is prospective: a session whose current binding exists only because of the revoked alignment is
// suspended (binding_suspended), never moved back.

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

function requiredApprovers(requester: string, target: GoalRow, source: GoalRow | undefined, choice: Choice, sessions: SessionRow[]): string[] {
  const set = new Set<string>([target.owner_id]);
  // Linking a goal under another one changes the source goal's tree, so its owner must agree, whatever the effects.
  if (source && source.owner_id !== requester) set.add(source.owner_id);
  if (effectsOf(choice).includes("allocation_transfer")) {
    for (const s of sessions) set.add(s.user_id);
    for (const s of sessions) {
      const e = openEpoch(s.ws_id, s.session_key);
      const cur = e?.goal_id ? goalRow(s.ws_id, e.goal_id) : undefined;
      if (cur && cur.owner_id !== requester) set.add(cur.owner_id);
    }
  }
  return [...set].sort();
}

function sessionsIn(pp: PolicyPrincipal, keys: string[], ownerId: string): SessionRow[] {
  return keys.map((k) => {
    const s = sessionRow(pp.wsId, k);
    if (!s || s.user_id !== ownerId) throw notFound();
    if (s.state === "stopped") throw conflict("sharing_stopped", "One of these sessions is no longer shared");
    return s;
  });
}

function governedElsewhere(ws: string, keys: string[], alignmentId: string | null): boolean {
  return keys.some((k) => {
    const s = sessionRow(ws, k);
    return !!s?.governing_alignment_id && s.governing_alignment_id !== alignmentId;
  });
}

function writeRevision(a: { id: string; ws: string }, revision: number, choice: Choice, keys: string[], approvers: string[], note: string | null, author: string, at: string) {
  run(
    "INSERT INTO v2_alignment_revisions (ws_id, alignment_id, revision, choice, effects_json, approvers_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    a.ws,
    a.id,
    revision,
    choice,
    JSON.stringify(effectsOf(choice)),
    JSON.stringify(approvers),
    note,
    author,
    at,
  );
  for (const k of keys) run("INSERT INTO v2_alignment_sessions (ws_id, alignment_id, revision, session_key) VALUES (?, ?, ?, ?)", a.ws, a.id, revision, k);
  // The revision's author agrees with it by writing it.
  if (approvers.includes(author)) run("INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", a.ws, a.id, revision, author, at);
}

const revisionOf = (id: string, revision: number) => get<RevisionRow>("SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? AND revision = ?", id, revision)!;
const keysOf = (id: string, revision: number) =>
  all<{ session_key: string }>("SELECT session_key FROM v2_alignment_sessions WHERE alignment_id = ? AND revision = ? ORDER BY session_key", id, revision).map((r) => r.session_key);
const approvalsOf = (id: string, revision: number) => new Set(all<{ user_id: string }>("SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ?", id, revision).map((r) => r.user_id));

/** Everyone who appears on any revision: the requester and every approver ever required. */
function involved(a: AlignmentRow): string[] {
  const set = new Set([a.requester_id]);
  for (const r of all<{ approvers_json: string }>("SELECT approvers_json FROM v2_alignment_revisions WHERE alignment_id = ?", a.id)) for (const u of JSON.parse(r.approvers_json) as string[]) set.add(u);
  return [...set];
}

/** Approve, if every required approver of the current revision has. Applies the effects in this transaction.
 *  `actor` is whoever's action completed the approvals; the audit row names them. */
function maybeApprove(a: AlignmentRow, at: string, actor: string): boolean {
  const rev = revisionOf(a.id, a.revision);
  const need = JSON.parse(rev.approvers_json) as string[];
  const got = approvalsOf(a.id, a.revision);
  if (!need.every((u) => got.has(u))) return false;
  const keys = keysOf(a.id, a.revision);
  if (rev.choice === "work_toward") {
    if (governedElsewhere(a.ws_id, keys, a.id)) throw conflict("already_governed", "One of these sessions already follows another goal through an alignment; revoke that first");
    const target = goalRow(a.ws_id, a.target_goal_id)!;
    const core = goalCore(target);
    for (const k of keys) {
      const s = sessionRow(a.ws_id, k);
      if (!s || s.state === "stopped") continue;
      run("UPDATE v2_sessions SET governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", target.id, a.id, at, a.ws_id, k);
      // One binding_changed per session: the agent opens a new epoch with this goal at its next root turn.
      writeDirective(a.ws_id, "binding_changed", [k], core, { goal_id: target.id, effective: "next_root_turn", cause: `alignment:${a.id}` });
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
  if (target.status !== "active") throw conflict("goal_not_active", "That goal is no longer active");
  const sourceId = optStr(b, "source_goal_id", 64);
  const source = sourceId ? visibleGoal(pp, sourceId) : undefined;
  if (source && source.id === target.id) throw badRequest("A goal can't align with itself");
  if (source && !canBind(pp, goalObj(source), false)) throw forbidden("source_not_yours", "The source goal must be yours or your pod's");
  const choice = oneOf(b, "choice", ["contribution", "work_toward"] as const);
  const keys = strList(b, "session_keys", { max: 50, itemMax: 43 });
  const sessions = sessionsIn(pp, keys, pp.userId);
  if (choice === "work_toward" && !sessions.length) throw badRequest("Pick at least one of your shared sessions to work toward this goal");
  if (choice === "contribution" && !sessions.length && !source) throw badRequest("Pick a goal of yours or at least one session that contributes");
  if (choice === "work_toward" && governedElsewhere(pp.wsId, keys, null)) throw conflict("already_governed", "One of these sessions already follows another goal through an alignment; revoke that first");
  const note = optStr(b, "note", 1000);
  const approvers = requiredApprovers(pp.userId, target, source, choice, sessions);
  const id = newId("al");
  const at = nowIso();
  await tx(() => {
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
    writeRevision({ id, ws: pp.wsId }, 1, choice, keys, approvers, note, pp.userId, at);
    audit(pp.wsId, pp.userId, "alignment.requested", id, at);
    maybeApprove(alignmentRow(pp.wsId, id)!, at, pp.userId);
  });
  return alignmentView(pp, alignmentRow(pp.wsId, id)!);
}

const alignmentRow = (ws: string, id: string) => get<AlignmentRow>("SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?", ws, id);

function visibleAlignment(pp: PolicyPrincipal, id: string): AlignmentRow {
  const a = alignmentRow(pp.wsId, id);
  if (!a) throw notFound();
  need(pp, "alignment.read", { kind: "alignment", involved: involved(a) });
  return a;
}

export async function actOnAlignment(pp: PolicyPrincipal, id: string, action: AlignmentAction, b: Body) {
  const a0 = visibleAlignment(pp, id);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const me = pp.userId;
  const at = nowIso();
  await tx(() => {
    const a = alignmentRow(pp.wsId, id)!; // re-read inside the transaction
    if (a.revision !== a0.revision || a.state !== a0.state) throw conflict("stale_revision", "This request changed meanwhile; reload and try again");
    const rev = revisionOf(a.id, a.revision);
    const approvers = JSON.parse(rev.approvers_json) as string[];
    const isRequester = a.requester_id === me;
    const isApprover = approvers.includes(me);
    const expectRevision = () => {
      if (b.revision !== a.revision) throw conflict("stale_revision", `This request is at revision ${a.revision}; reload and try again`);
    };
    const inState = (...s: AlignmentState[]) => {
      if (!s.includes(a.state)) throw conflict("wrong_state", `This request is ${a.state}`);
    };
    switch (action) {
      case "approve": {
        expectRevision();
        inState("pending");
        if (!isApprover) throw forbidden("not_an_approver", "Your approval is not needed on this request");
        run("INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", a.ws_id, a.id, a.revision, me, at);
        run("UPDATE v2_alignments SET updated_at = ? WHERE id = ?", at, a.id);
        maybeApprove(a, at, me);
        break;
      }
      case "counter": {
        if (b.revision !== undefined) expectRevision();
        inState("pending");
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can counter");
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
        writeRevision({ id: a.id, ws: a.ws_id }, next, choice, keys, requiredApprovers(a.requester_id, target, source, choice, sessions), optStr(b, "note", 1000), me, at);
        run("UPDATE v2_alignments SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?", next, at, a.id);
        audit(a.ws_id, me, "alignment.countered", a.id, at);
        break;
      }
      case "accept_counter": {
        if (b.revision !== undefined) expectRevision();
        inState("countered");
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can accept a counter");
        if (isApprover) run("INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", a.ws_id, a.id, a.revision, me, at);
        run("UPDATE v2_alignments SET state = 'pending', updated_at = ? WHERE id = ?", at, a.id);
        maybeApprove({ ...a, state: "pending" }, at, me);
        break;
      }
      case "reject": {
        inState("pending", "countered");
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can decline");
        run("UPDATE v2_alignments SET state = 'rejected', decided_at = ?, updated_at = ? WHERE id = ?", at, at, a.id);
        audit(a.ws_id, me, "alignment.rejected", a.id, at);
        break;
      }
      case "withdraw": {
        inState("pending", "countered");
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can withdraw");
        run("UPDATE v2_alignments SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?", at, at, a.id);
        audit(a.ws_id, me, "alignment.withdrawn", a.id, at);
        break;
      }
      case "revoke": {
        inState("approved");
        if (!isRequester && !isApprover) throw forbidden("not_an_approver", "Only the requester or an approver can revoke");
        run("UPDATE v2_alignments SET state = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE id = ?", at, me, at, a.id);
        if (rev.choice === "work_toward") {
          run("UPDATE v2_sessions SET governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND governing_alignment_id = ?", at, a.ws_id, a.id);
          // Sessions whose current binding exists only because of this alignment lose it: their open epoch ends now
          // and they wait for their owner to pick a goal. History never moves.
          const suspended = all<{ session_key: string }>(
            "SELECT session_key FROM v2_epochs WHERE ws_id = ? AND ends_at IS NULL AND authority = 'alignment' AND alignment_id = ?",
            a.ws_id,
            a.id,
          ).map((r) => r.session_key);
          for (const k of suspended) {
            run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL", at, a.ws_id, k);
            run("UPDATE v2_sessions SET state = 'suspended', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state = 'shared'", at, a.ws_id, k);
          }
          writeDirective(a.ws_id, "binding_suspended", suspended, null, { goal_id: a.target_goal_id, effective: "next_root_turn", cause: `alignment:${a.id}` });
        }
        audit(a.ws_id, me, "alignment.revoked", a.id, at);
        break;
      }
    }
  });
  return alignmentView(pp, alignmentRow(pp.wsId, id)!);
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
  const approvers = JSON.parse(rev.approvers_json) as string[];
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
      current_goal: goalLabel(pp, e?.goal_id ?? null),
    };
  }).filter(Boolean);
  const who = sessions.length === 1 ? "this session" : `these ${sessions.length} sessions`;
  const effects = (JSON.parse(rev.effects_json) as EffectKind[]).map((kind) => ({
    kind,
    text:
      kind === "contributes_to"
        ? `Records that ${a.source_goal_id ? named(source) : who} contributes to ${named(target)}. No usage moves.`
        : kind === "governing_goal"
          ? sessions.length === 1
            ? `This session follows ${named(target)}: its agent gets that goal and its changes.`
            : `${who[0].toUpperCase()}${who.slice(1)} follow ${named(target)}: their agents get that goal and its changes.`
          : `Future usage from ${who} counts under ${named(target)}. Past usage stays where it is.`,
  }));
  const me = pp.userId;
  const isRequester = a.requester_id === me;
  const isApprover = approvers.includes(me);
  const can = {
    approve: a.state === "pending" && isApprover && !approved.has(me),
    counter: a.state === "pending" && isApprover && !isRequester,
    reject: (a.state === "pending" || a.state === "countered") && isApprover && !isRequester,
    accept_counter: a.state === "countered" && isRequester,
    withdraw: (a.state === "pending" || a.state === "countered") && isRequester,
    revoke: a.state === "approved" && (isRequester || isApprover),
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
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
    approvers: approvers.map((u) => ({ id: u, name: memberName(u), approved: approved.has(u) })),
    note: rev.note,
    history,
    waiting_on_me: can.approve || can.accept_counter,
    can,
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


