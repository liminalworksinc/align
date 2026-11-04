import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { assertTargetsFit, goalObj, goalRow, versionFieldsOf, visibleGoal, writeVersion } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName, need } from "./workspaces";
import { optStr, type Body } from "./validate";

// Reallocation: a proposal to change the target share of agent time for one or more goals. Every owner of a goal
// whose target changes must approve the current revision, as with alignments (lib/v2/alignments.ts): an approver
// can counter with new targets (a new revision that voids earlier approvals), the requester accepts or withdraws,
// and an approver can decline. On approval each changed goal gets a new version with its new target in the same
// transaction, which sends the usual goal_version directive to sessions bound to it. Only the people involved can
// see a proposal; a goal one of them can't read is never named to them.

export type ReallocationState = "pending" | "countered" | "approved" | "rejected" | "withdrawn";
export const ACTIONS = ["approve", "counter", "accept_counter", "reject", "withdraw"] as const;
export type ReallocationAction = (typeof ACTIONS)[number];

interface Row {
  id: string;
  ws_id: string;
  requester_id: string;
  state: ReallocationState;
  revision: number;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}
interface RevisionRow {
  revision: number;
  targets_json: string;
  approvers_json: string;
  note: string | null;
  author_id: string;
  created_at: string;
}
interface Target {
  goal_id: string;
  target_share: number | null;
  /** The goal's target when this revision was written, so a decided proposal still shows what it changed. */
  from_share?: number | null;
}

const rowOf = (ws: string, id: string) => get<Row>("SELECT * FROM v2_reallocations WHERE ws_id = ? AND id = ?", ws, id);
const revisionOf = (id: string, revision: number) => get<RevisionRow>("SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? AND revision = ?", id, revision)!;
const approvalsOf = (id: string, revision: number) => new Set(all<{ user_id: string }>("SELECT user_id FROM v2_reallocation_approvals WHERE reallocation_id = ? AND revision = ?", id, revision).map((r) => r.user_id));

/** The targets from a request body: [{ goal_id, target_share }], each a goal the caller can read and that is active. */
function targetsIn(pp: PolicyPrincipal, v: unknown): Target[] {
  if (!Array.isArray(v) || !v.length) throw badRequest("targets must list at least one { goal_id, target_share }");
  if (v.length > 50) throw badRequest("targets: at most 50");
  const out: Target[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("each target must be { goal_id, target_share }");
    const t = raw as Body;
    const g = visibleGoal(pp, typeof t.goal_id === "string" ? t.goal_id : "");
    if (g.status !== "active") throw conflict("goal_not_active", `"${g.title}" is no longer active`);
    const share = t.target_share;
    if (share !== null && (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > 100)) throw badRequest("target_share must be a whole percent from 0 to 100, or null");
    if (out.some((o) => o.goal_id === g.id)) throw badRequest("Each goal can appear once");
    out.push({ goal_id: g.id, target_share: share as number | null });
  }
  return out;
}

/** The targets that actually change, and the owners who must approve them. */
function changesOf(ws: string, targets: Target[]) {
  const changed = targets
    .map((t) => ({ goal_id: t.goal_id, target_share: t.target_share, from_share: goalRow(ws, t.goal_id)?.target_share ?? null }))
    .filter((t) => t.from_share !== t.target_share);
  const approvers = [...new Set(changed.map((t) => goalRow(ws, t.goal_id)!.owner_id))].sort();
  return { changed, approvers };
}

function fits(ws: string, targets: Target[]) {
  assertTargetsFit(ws, new Map(targets.map((t) => [t.goal_id, { target: t.target_share, active: true }])));
}

function writeRevision(r: { id: string; ws: string }, revision: number, targets: Target[], approvers: string[], note: string | null, author: string, at: string) {
  run(
    "INSERT INTO v2_reallocation_revisions (ws_id, reallocation_id, revision, targets_json, approvers_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    r.ws,
    r.id,
    revision,
    JSON.stringify(targets),
    JSON.stringify(approvers),
    note,
    author,
    at,
  );
  // The revision's author agrees with it by writing it.
  if (approvers.includes(author)) run("INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", r.ws, r.id, revision, author, at);
}

function involved(r: Row): string[] {
  const set = new Set([r.requester_id]);
  for (const x of all<{ approvers_json: string }>("SELECT approvers_json FROM v2_reallocation_revisions WHERE reallocation_id = ?", r.id)) for (const u of JSON.parse(x.approvers_json) as string[]) set.add(u);
  return [...set];
}

/** Apply the current revision if every required approver has approved it. Inside the caller's transaction. */
function maybeApply(r: Row, at: string): boolean {
  const rev = revisionOf(r.id, r.revision);
  const need = JSON.parse(rev.approvers_json) as string[];
  const got = approvalsOf(r.id, r.revision);
  if (!need.every((u) => got.has(u))) return false;
  const targets = JSON.parse(rev.targets_json) as Target[];
  for (const t of targets) {
    const g = goalRow(r.ws_id, t.goal_id);
    if (!g || g.status !== "active") throw conflict("goal_not_active", "A goal in this proposal is no longer active");
  }
  fits(r.ws_id, targets);
  for (const t of targets) {
    const g = goalRow(r.ws_id, t.goal_id)!;
    if ((g.target_share ?? null) === t.target_share) continue;
    // The new version is written as its owner's: they approved this revision.
    writeVersion(r.ws_id, g, { ...versionFieldsOf(g), target_share: t.target_share }, g.owner_id, at);
  }
  run("UPDATE v2_reallocations SET state = 'approved', decided_at = ?, updated_at = ? WHERE id = ?", at, at, r.id);
  audit(r.ws_id, null, "reallocation.approved", r.id, at);
  return true;
}

export async function createReallocation(pp: PolicyPrincipal, b: Body) {
  need(pp, "alignment.create");
  const targets = targetsIn(pp, b.targets);
  const { changed, approvers } = changesOf(pp.wsId, targets);
  if (!changed.length) throw conflict("no_change", "These targets are already set");
  fits(pp.wsId, targets);
  const note = optStr(b, "note", 1000);
  const id = newId("rl");
  const at = nowIso();
  await tx(() => {
    run("INSERT INTO v2_reallocations (id, ws_id, requester_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, 'pending', 1, ?, ?)", id, pp.wsId, pp.userId, at, at);
    writeRevision({ id, ws: pp.wsId }, 1, changed, approvers, note, pp.userId, at);
    audit(pp.wsId, pp.userId, "reallocation.requested", id, at);
    maybeApply(rowOf(pp.wsId, id)!, at);
  });
  return view(pp, rowOf(pp.wsId, id)!);
}

function visible(pp: PolicyPrincipal, id: string): Row {
  const r = rowOf(pp.wsId, id);
  if (!r) throw notFound();
  need(pp, "alignment.read", { kind: "alignment", involved: involved(r) });
  return r;
}

export async function actOnReallocation(pp: PolicyPrincipal, id: string, action: ReallocationAction, b: Body) {
  const r0 = visible(pp, id);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const me = pp.userId;
  const at = nowIso();
  // A counter's targets are read before the transaction: reading checks goal visibility and can throw 404.
  const counterTargets = action === "counter" ? targetsIn(pp, b.targets) : null;
  await tx(() => {
    const r = rowOf(pp.wsId, id)!;
    if (r.revision !== r0.revision || r.state !== r0.state) throw conflict("stale_revision", "This proposal changed meanwhile; reload and try again");
    const rev = revisionOf(r.id, r.revision);
    const approvers = JSON.parse(rev.approvers_json) as string[];
    const isRequester = r.requester_id === me;
    const isApprover = approvers.includes(me);
    const expectRevision = () => {
      if (b.revision !== r.revision) throw conflict("stale_revision", `This proposal is at revision ${r.revision}; reload and try again`);
    };
    const inState = (...s: ReallocationState[]) => {
      if (!s.includes(r.state)) throw conflict("wrong_state", `This proposal is ${r.state}`);
    };
    switch (action) {
      case "approve": {
        expectRevision();
        inState("pending");
        if (!isApprover) throw forbidden("not_an_approver", "Your approval is not needed on this proposal");
        run("INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", r.ws_id, r.id, r.revision, me, at);
        run("UPDATE v2_reallocations SET updated_at = ? WHERE id = ?", at, r.id);
        maybeApply(r, at);
        break;
      }
      case "counter": {
        if (b.revision !== undefined) expectRevision();
        inState("pending");
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can counter");
        const { changed, approvers: next } = changesOf(r.ws_id, counterTargets!);
        if (!changed.length) throw conflict("no_change", "These targets are already set; decline instead");
        fits(r.ws_id, changed);
        const n = r.revision + 1;
        writeRevision({ id: r.id, ws: r.ws_id }, n, changed, next, optStr(b, "note", 1000), me, at);
        run("UPDATE v2_reallocations SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?", n, at, r.id);
        audit(r.ws_id, me, "reallocation.countered", r.id, at);
        break;
      }
      case "accept_counter": {
        if (b.revision !== undefined) expectRevision();
        inState("countered");
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can accept a counter");
        if (isApprover) run("INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)", r.ws_id, r.id, r.revision, me, at);
        run("UPDATE v2_reallocations SET state = 'pending', updated_at = ? WHERE id = ?", at, r.id);
        maybeApply({ ...r, state: "pending" }, at);
        break;
      }
      case "reject": {
        inState("pending", "countered");
        if (!isApprover || isRequester) throw forbidden("not_an_approver", "Only an approver can decline");
        run("UPDATE v2_reallocations SET state = 'rejected', decided_at = ?, updated_at = ? WHERE id = ?", at, at, r.id);
        audit(r.ws_id, me, "reallocation.rejected", r.id, at);
        break;
      }
      case "withdraw": {
        inState("pending", "countered");
        if (!isRequester) throw forbidden("not_requester", "Only the person who asked can withdraw");
        run("UPDATE v2_reallocations SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?", at, at, r.id);
        audit(r.ws_id, me, "reallocation.withdrawn", r.id, at);
        break;
      }
    }
  });
  return view(pp, rowOf(pp.wsId, id)!);
}

function view(pp: PolicyPrincipal, r: Row) {
  const rev = revisionOf(r.id, r.revision);
  const approvers = JSON.parse(rev.approvers_json) as string[];
  const approved = approvalsOf(r.id, r.revision);
  const targets = (JSON.parse(rev.targets_json) as Target[]).map((t) => {
    const g = goalRow(r.ws_id, t.goal_id);
    const seen = !!g && canReadGoal(pp, goalObj(g));
    return {
      goal: seen ? { id: g!.id, title: g!.title } : null,
      from_share: seen ? (t.from_share ?? null) : null,
      current_share: seen ? (g!.target_share ?? null) : null,
      target_share: seen ? t.target_share : null,
      owner: g ? { id: g.owner_id, name: memberName(g.owner_id) } : null,
    };
  });
  const me = pp.userId;
  const isRequester = r.requester_id === me;
  const isApprover = approvers.includes(me);
  const can = {
    approve: r.state === "pending" && isApprover && !approved.has(me),
    counter: r.state === "pending" && isApprover && !isRequester,
    reject: (r.state === "pending" || r.state === "countered") && isApprover && !isRequester,
    accept_counter: r.state === "countered" && isRequester,
    withdraw: (r.state === "pending" || r.state === "countered") && isRequester,
  };
  if (pp.wsRole === "viewer") for (const k of Object.keys(can) as (keyof typeof can)[]) can[k] = false;
  const history = all<RevisionRow>("SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? ORDER BY revision", r.id).map((x) => ({
    revision: x.revision,
    author: { id: x.author_id, name: memberName(x.author_id) },
    note: x.note,
    created_at: x.created_at,
  }));
  return {
    id: r.id,
    state: r.state,
    revision: r.revision,
    requester: { id: r.requester_id, name: memberName(r.requester_id) },
    targets,
    approvers: approvers.map((u) => ({ id: u, name: memberName(u), approved: approved.has(u) })),
    note: rev.note,
    history,
    waiting_on_me: can.approve || can.accept_counter,
    can,
    created_at: r.created_at,
    updated_at: r.updated_at,
    decided_at: r.decided_at,
  };
}

export function getReallocation(pp: PolicyPrincipal, id: string) {
  return view(pp, visible(pp, id));
}

/** Proposals the caller is part of, newest first. */
export function listReallocations(pp: PolicyPrincipal) {
  need(pp, "workspace.read");
  const rows = all<Row>("SELECT * FROM v2_reallocations WHERE ws_id = ? ORDER BY updated_at DESC LIMIT 200", pp.wsId).filter((r) => involved(r).includes(pp.userId));
  const views = rows.map((r) => view(pp, r));
  return { waiting_on_me: views.filter((v) => v.waiting_on_me), others: views.filter((v) => !v.waiting_on_me) };
}

export function assertAction(a: string): ReallocationAction {
  if (!(ACTIONS as readonly string[]).includes(a)) throw notFound();
  return a as ReallocationAction;
}
