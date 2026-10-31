import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { effectiveSet, launchSet } from "./approval";
import { assertTargetsFit, contentOf, goalObj, goalRow, visibleGoal, writeGoalVersion } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName } from "./workspaces";
import { optStr, type Body } from "./validate";

// Reallocations (PORT29, main #29): a proposal to change the target share of agent time of one or more goals at once,
// so time can move from one goal to another without passing 100% in between. It follows the change request model
// (lib/v2/changes.ts) rather than #29's "every owner approves, then it applies":
//   - each goal whose target changes needs one approval from its effective approval set (owner, team leads and, for a
//     company goal, workspace owners, after the requester rule, lib/v2/approval.ts). The requester's own goals are
//     approved by asking; a counter's author approves the goals they may approve for by writing it.
//   - once every goal is approved the proposal is approved and its launch is pending: no goal version, no directive.
//   - launch (someone in every goal's launch set who can read every goal) writes each goal's next version with its
//     new target through writeGoalVersion, authored by the person who approved that goal, so bound sessions get the
//     usual goal_version directive. not_yet records that it waits; approve_and_launch does both.
//   - any newer version of one of its goals (an owner's edit, a launch, the goal achieved or dropped) supersedes an
//     open or approved-unlaunched proposal: the goal outran it, nothing reaches agents, and the requester proposes
//     again (supersedeReallocations, called by writeGoalVersion).
// Everyone who can read one of its goals can read a proposal (as with change requests); a goal they can't read is
// unnamed and shows no numbers or approvers. Viewers can't act.
//   pending -> approved | countered | rejected | withdrawn | superseded;  countered -> pending (accept_counter)

export const REALLOCATION_STATES = ["pending", "countered", "approved", "rejected", "withdrawn", "superseded"] as const;
export type ReallocationState = (typeof REALLOCATION_STATES)[number];
export const REALLOCATION_ACTIONS = ["approve", "approve_and_launch", "launch", "not_yet", "counter", "accept_counter", "reject", "withdraw"] as const;
export type ReallocationAction = (typeof REALLOCATION_ACTIONS)[number];
type LaunchState = "pending" | "not_yet" | "launched" | "superseded";

/** Goals one proposal may name. */
export const REALLOCATION_GOALS_MAX = 50;
const NOTE_MAX = 1000;

interface Row {
  id: string;
  ws_id: string;
  requester_id: string;
  state: ReallocationState;
  revision: number;
  launch: LaunchState | null;
  launch_by: string | null;
  launch_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}
interface RevisionRow {
  revision: number;
  targets_json: string;
  note: string | null;
  author_id: string;
  created_at: string;
}
/** One goal of a revision: its version and target when the revision was written, and the proposed target. */
interface Target {
  goal_id: string;
  base_version: number;
  from_share: number | null;
  target_share: number | null;
}

const rowOf = (ws: string, id: string) => get<Row>("SELECT * FROM v2_reallocations WHERE ws_id = ? AND id = ?", ws, id);
const revisionOf = (id: string, revision: number) => get<RevisionRow>("SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? AND revision = ?", id, revision)!;
const targetsOf = (id: string, revision: number) => JSON.parse(revisionOf(id, revision).targets_json) as Target[];
/** goal id -> who approved it, at this revision. */
const approvalsOf = (id: string, revision: number) =>
  new Map(all<{ goal_id: string; user_id: string }>("SELECT goal_id, user_id FROM v2_reallocation_approvals WHERE reallocation_id = ? AND revision = ?", id, revision).map((a) => [a.goal_id, a.user_id]));

/** The targets of a body, [{goal_id, target_share}]: each a goal the caller can read (404) that is active (409), with a
 *  whole percent from 0 to 100 or null (400), at most once. Keeps the goals whose target changes; none is 409. */
function targetsIn(pp: PolicyPrincipal, v: unknown): Target[] {
  if (!Array.isArray(v) || !v.length) throw badRequest("targets must list at least one { goal_id, target_share }");
  if (v.length > REALLOCATION_GOALS_MAX) throw badRequest(`targets: at most ${REALLOCATION_GOALS_MAX}`);
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("each target must be { goal_id, target_share }");
    const t = raw as Body;
    const share = t.target_share;
    if (share !== null && (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > 100)) throw badRequest("target_share must be a whole percent from 0 to 100, or null");
    const g = visibleGoal(pp, typeof t.goal_id === "string" ? t.goal_id : "");
    if (seen.has(g.id)) throw badRequest("Each goal can appear once");
    seen.add(g.id);
    if (g.status !== "active") throw conflict("goal_not_active", "A goal in this proposal is achieved or dropped");
    if ((g.target_share ?? null) !== share) out.push({ goal_id: g.id, base_version: g.version, from_share: g.target_share ?? null, target_share: share as number | null });
  }
  if (!out.length) throw conflict("no_change", "These targets are already set");
  return out;
}

const fits = (ws: string, targets: Target[]) => assertTargetsFit(ws, new Map(targets.map((t) => [t.goal_id, t.target_share])));

/** Record `user`'s approval for every goal of this revision they may approve for and nobody approved yet. Returns how
 *  many goals that approved. */
function approveAs(r: { id: string; ws_id: string; requester_id: string }, revision: number, user: string, at: string): number {
  const done = approvalsOf(r.id, revision);
  let n = 0;
  for (const t of targetsOf(r.id, revision)) {
    const g = goalRow(r.ws_id, t.goal_id);
    if (!g || done.has(t.goal_id) || !effectiveSet(g, r.requester_id).includes(user)) continue;
    n += run("INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, goal_id, user_id, at) VALUES (?, ?, ?, ?, ?, ?)", r.ws_id, r.id, revision, t.goal_id, user, at);
  }
  return n;
}

/** When every goal of the current revision is approved: approved, launch pending. Inside the caller's tx. */
function settle(r: Row, at: string): boolean {
  const done = approvalsOf(r.id, r.revision);
  if (!targetsOf(r.id, r.revision).every((t) => done.has(t.goal_id))) return false;
  run("UPDATE v2_reallocations SET state = 'approved', launch = 'pending', decided_at = ?, updated_at = ? WHERE id = ?", at, at, r.id);
  audit(r.ws_id, null, "reallocation.approved", r.id, at);
  return true;
}

function writeRevision(r: { id: string; ws_id: string }, revision: number, targets: Target[], note: string | null, author: string, at: string) {
  run(
    "INSERT INTO v2_reallocation_revisions (ws_id, reallocation_id, revision, targets_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    r.ws_id,
    r.id,
    revision,
    JSON.stringify(targets),
    note,
    author,
    at,
  );
}

/** Ids of every goal any revision names. */
const goalsOf = (id: string) => [...new Set(all<{ targets_json: string }>("SELECT targets_json FROM v2_reallocation_revisions WHERE reallocation_id = ?", id).flatMap((v) => (JSON.parse(v.targets_json) as Target[]).map((t) => t.goal_id)))];

const readable = (pp: PolicyPrincipal, ws: string, goalId: string) => {
  const g = goalRow(ws, goalId);
  return !!g && canReadGoal(pp, goalObj(g));
};

/** The proposal if the caller can read one of its goals, else 404. */
function visible(pp: PolicyPrincipal, id: string): Row {
  const r = rowOf(pp.wsId, id);
  if (!r || !goalsOf(r.id).some((g) => readable(pp, r.ws_id, g))) throw notFound();
  return r;
}

/** POST …/reallocations { targets: [{goal_id, target_share}], note? } -> 201 (owners and members). */
export async function createReallocation(pp: PolicyPrincipal, b: Body) {
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const targets = targetsIn(pp, b.targets);
  const note = optStr(b, "note", NOTE_MAX);
  fits(pp.wsId, targets);
  const id = newId("rl");
  const at = nowIso();
  await tx(() => {
    for (const t of targets) if (goalRow(pp.wsId, t.goal_id)!.version !== t.base_version) throw conflict("stale_version", "A goal changed meanwhile; reload and try again");
    run("INSERT INTO v2_reallocations (id, ws_id, requester_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, 'pending', 1, ?, ?)", id, pp.wsId, pp.userId, at, at);
    writeRevision({ id, ws_id: pp.wsId }, 1, targets, note, pp.userId, at);
    audit(pp.wsId, pp.userId, "reallocation.requested", id, at);
    approveAs({ id, ws_id: pp.wsId, requester_id: pp.userId }, 1, pp.userId, at); // the requester's own goals
    settle(rowOf(pp.wsId, id)!, at);
  });
  return view(pp, rowOf(pp.wsId, id)!);
}

/** May `user` launch it: in every goal's launch set, and able to read every goal. */
function mayLaunch(pp: PolicyPrincipal, r: Row): boolean {
  return targetsOf(r.id, r.revision).every((t) => {
    const g = goalRow(r.ws_id, t.goal_id);
    return !!g && launchSet(g, r.requester_id).includes(pp.userId) && canReadGoal(pp, goalObj(g));
  });
}

/** Write each goal's next version with its new target (decreases first, so the workspace's targets never pass 100 on
 *  the way), authored by whoever approved that goal. Inside the caller's tx, after the proposal is marked launched. */
function launchTargets(r: Row, actor: string, at: string) {
  const approvedBy = approvalsOf(r.id, r.revision);
  const targets = targetsOf(r.id, r.revision)
    .map((t) => ({ t, g: goalRow(r.ws_id, t.goal_id) }))
    .sort((a, b) => (a.t.target_share ?? 0) - (a.g?.target_share ?? 0) - ((b.t.target_share ?? 0) - (b.g?.target_share ?? 0)));
  for (const { t, g } of targets) {
    // writeGoalVersion supersedes a proposal whose goal moved, so this is a guard, not a path.
    if (!g || g.status !== "active" || g.version !== t.base_version) throw conflict("stale_version", "A goal in this proposal changed; it can't be launched");
    writeGoalVersion(g, { ...contentOf(g), target_share: t.target_share }, actor, at, approvedBy.get(t.goal_id) ?? actor);
  }
}

export async function actOnReallocation(pp: PolicyPrincipal, id: string, action: ReallocationAction, b: Body) {
  visible(pp, id);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const me = pp.userId;
  const at = nowIso();
  // A counter's targets are read before the transaction: reading checks each goal's visibility and can throw 404.
  const countered = action === "counter" ? targetsIn(pp, b.targets) : null;
  const note = action === "counter" || action === "reject" ? optStr(b, action === "reject" ? "reason" : "note", NOTE_MAX) : null;
  await tx(() => {
    const r = rowOf(pp.wsId, id)!; // read inside the transaction
    const targets = targetsOf(r.id, r.revision);
    const isRequester = r.requester_id === me;
    const isApprover = targets.some((t) => {
      const g = goalRow(r.ws_id, t.goal_id);
      return !!g && effectiveSet(g, r.requester_id).includes(me);
    });
    const inState = (...s: ReallocationState[]) => {
      if (!s.includes(r.state)) throw conflict("wrong_state", `This proposal is ${r.state}`);
    };
    const expectRevision = (required: boolean) => {
      if ((required || b.revision !== undefined) && b.revision !== r.revision) throw conflict("stale_revision", `This proposal is at revision ${r.revision}; reload and try again`);
    };
    const approverOnly = () => {
      if (!isApprover) throw forbidden("not_an_approver", "Only someone who can approve for one of these goals can do this");
    };
    const requesterOnly = () => {
      if (!isRequester) throw forbidden("not_requester", "Only the person who asked can do this");
    };
    const launcherOnly = () => {
      if (!mayLaunch(pp, r)) throw forbidden("not_a_launcher", "Only someone who can launch for every goal in it (an approver of each, or a workspace owner who can read them all) can launch it");
    };
    const launchable = () => {
      if (r.state !== "approved" || (r.launch !== "pending" && r.launch !== "not_yet")) throw conflict("wrong_state", r.launch === "launched" ? "These targets are already launched" : `This proposal is ${r.state}`);
    };
    const approve = () => {
      approverOnly();
      inState("pending");
      expectRevision(true);
      if (!approveAs(r, r.revision, me, at)) throw conflict("already_approved", "The goals you can approve for are already approved");
      run("UPDATE v2_reallocations SET updated_at = ? WHERE id = ?", at, r.id);
      audit(r.ws_id, me, "reallocation.approval", r.id, at);
      return settle(r, at);
    };
    const launch = () => {
      launcherOnly();
      fits(r.ws_id, targetsOf(r.id, r.revision));
      // Launched first, so the new versions' supersede step leaves this proposal alone.
      run("UPDATE v2_reallocations SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?", me, at, at, r.id);
      launchTargets(r, me, at);
      audit(r.ws_id, me, "reallocation.launched", r.id, at);
    };
    switch (action) {
      case "approve":
        approve();
        break;
      case "approve_and_launch":
        launcherOnly(); // before approving: nothing is written unless both can happen
        if (!approve()) throw conflict("not_ready", "Other goals in this proposal still need an approval; approve it instead");
        launch();
        break;
      case "launch":
        launchable();
        expectRevision(false);
        launch();
        break;
      case "not_yet":
        launcherOnly();
        launchable();
        expectRevision(false);
        run("UPDATE v2_reallocations SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?", me, at, at, r.id);
        audit(r.ws_id, me, "reallocation.not_yet", r.id, at);
        break;
      case "counter": {
        approverOnly();
        if (isRequester) throw forbidden("not_an_approver", "Withdraw and propose again to change your own proposal");
        inState("pending");
        expectRevision(false);
        fits(r.ws_id, countered!);
        const next = r.revision + 1;
        writeRevision(r, next, countered!, note, me, at);
        run("UPDATE v2_reallocations SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?", next, at, r.id);
        approveAs(r, next, me, at); // the counter's author agrees with it
        audit(r.ws_id, me, "reallocation.countered", r.id, at);
        break;
      }
      case "accept_counter":
        requesterOnly();
        inState("countered");
        expectRevision(false);
        for (const t of targets) if (goalRow(r.ws_id, t.goal_id)?.version !== t.base_version) throw conflict("stale_version", "A goal changed meanwhile; reload and try again");
        fits(r.ws_id, targets);
        run("UPDATE v2_reallocations SET state = 'pending', updated_at = ? WHERE id = ?", at, r.id);
        approveAs(r, r.revision, me, at);
        audit(r.ws_id, me, "reallocation.counter_accepted", r.id, at);
        settle({ ...r, state: "pending" }, at);
        break;
      case "reject":
        approverOnly();
        if (isRequester) throw forbidden("not_an_approver", "Withdraw your own proposal instead");
        inState("pending", "countered");
        expectRevision(false);
        run("UPDATE v2_reallocations SET state = 'rejected', decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?", me, note, at, at, r.id);
        audit(r.ws_id, me, "reallocation.rejected", r.id, at);
        break;
      case "withdraw":
        requesterOnly();
        inState("pending", "countered");
        expectRevision(false);
        run("UPDATE v2_reallocations SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?", at, at, r.id);
        audit(r.ws_id, me, "reallocation.withdrawn", r.id, at);
        break;
    }
  });
  return view(pp, rowOf(pp.wsId, id)!);
}

/** Inside writeGoalVersion's tx: every open (pending or countered) or approved-unlaunched proposal whose current
 *  revision names this goal is superseded, audited with the person whose action wrote the version. */
export function supersedeReallocations(ws: string, goalId: string, actorId: string, at: string) {
  const rows = all<{ id: string }>(
    `SELECT r.id FROM v2_reallocations r JOIN v2_reallocation_revisions v ON v.reallocation_id = r.id AND v.revision = r.revision
     WHERE r.ws_id = ? AND (r.state IN ('pending','countered') OR (r.state = 'approved' AND r.launch IN ('pending','not_yet')))
     AND EXISTS (SELECT 1 FROM json_each(v.targets_json) j WHERE json_extract(j.value, '$.goal_id') = ?)`,
    ws,
    goalId,
  );
  for (const r of rows) {
    run("UPDATE v2_reallocations SET launch = CASE WHEN state = 'approved' THEN 'superseded' ELSE launch END, state = 'superseded', decided_at = COALESCE(decided_at, ?), updated_at = ? WHERE id = ?", at, at, r.id);
    audit(ws, actorId, "reallocation.superseded", r.id, at);
  }
}

// ---- reading ----

function view(pp: PolicyPrincipal, r: Row) {
  const person = (id: string | null) => (id ? { id, name: memberName(id) } : null);
  const approved = approvalsOf(r.id, r.revision);
  const me = pp.userId;
  let isApprover = false;
  let canApproveNow = false;
  const targets = targetsOf(r.id, r.revision).map((t) => {
    const g = goalRow(r.ws_id, t.goal_id);
    const seen = !!g && canReadGoal(pp, goalObj(g));
    const set = g ? effectiveSet(g, r.requester_id) : [];
    if (set.includes(me)) {
      isApprover = true;
      if (!approved.has(t.goal_id)) canApproveNow = true;
    }
    return {
      goal: seen ? { id: g!.id, title: g!.title } : null,
      from_share: seen ? t.from_share : null,
      /** The goal's target now (differs from from_share when the proposal launched, or the goal moved). */
      current_share: seen ? (g!.target_share ?? null) : null,
      target_share: seen ? t.target_share : null,
      base_version: seen ? t.base_version : null,
      approvers: seen ? set.map((u) => person(u)!) : [],
      approved_by: seen ? person(approved.get(t.goal_id) ?? null) : null,
      approved: approved.has(t.goal_id),
    };
  });
  const isRequester = r.requester_id === me;
  const open = r.state === "pending" || r.state === "countered";
  const unlaunched = r.state === "approved" && (r.launch === "pending" || r.launch === "not_yet");
  const launcher = (r.state === "pending" || unlaunched) && mayLaunch(pp, r);
  const can = {
    approve: r.state === "pending" && canApproveNow,
    // My approval completes it and I may launch: both in one step.
    approve_and_launch: r.state === "pending" && canApproveNow && launcher && targets.every((t) => t.approved || t.approvers.some((a) => a.id === me)),
    launch: unlaunched && launcher,
    not_yet: unlaunched && launcher,
    counter: r.state === "pending" && isApprover && !isRequester,
    accept_counter: r.state === "countered" && isRequester,
    reject: open && isApprover && !isRequester,
    withdraw: open && isRequester,
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
  const history = all<RevisionRow>("SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? ORDER BY revision", r.id).map((x) => ({
    revision: x.revision,
    author: person(x.author_id)!,
    note: x.note,
    created_at: x.created_at,
  }));
  return {
    id: r.id,
    state: r.state,
    revision: r.revision,
    requester: person(r.requester_id)!,
    targets,
    note: revisionOf(r.id, r.revision).note,
    history,
    /** pending (approved, no launch decision yet) | not_yet | launched | superseded (before launch) | null. */
    launch: r.launch,
    launch_decided_by: person(r.launch_by),
    launch_decided_at: r.launch_at,
    rejected_by: r.state === "rejected" ? person(r.decided_by) : null,
    rejection_reason: r.state === "rejected" ? r.decision_note : null,
    waiting_on_me: can.approve || can.accept_counter || (can.launch && r.launch === "pending"),
    can,
    created_at: r.created_at,
    updated_at: r.updated_at,
    decided_at: r.decided_at,
  };
}

export type ReallocationView = ReturnType<typeof view>;

export function getReallocation(pp: PolicyPrincipal, id: string): ReallocationView {
  return view(pp, visible(pp, id));
}

/** GET …/reallocations: the proposals the caller can read (one of their goals), newest change first, at most 200, as
 *  { waiting_on_me, mine, others }. */
export function listReallocations(pp: PolicyPrincipal) {
  const rows = all<Row>("SELECT * FROM v2_reallocations WHERE ws_id = ? ORDER BY updated_at DESC, id LIMIT 200", pp.wsId).filter((r) => goalsOf(r.id).some((g) => readable(pp, r.ws_id, g)));
  const views = rows.map((r) => view(pp, r));
  return {
    waiting_on_me: views.filter((v) => v.waiting_on_me),
    mine: views.filter((v) => !v.waiting_on_me && v.requester.id === pp.userId),
    others: views.filter((v) => !v.waiting_on_me && v.requester.id !== pp.userId),
  };
}

export function assertReallocationAction(a: string): ReallocationAction {
  if (!(REALLOCATION_ACTIONS as readonly string[]).includes(a)) throw notFound();
  return a as ReallocationAction;
}
