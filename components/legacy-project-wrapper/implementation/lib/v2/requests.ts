import { approvalSet } from "./approval";
import { all, audit, get, run, tx } from "./db";
import { goalTargets, writeDirective, type ReceiptState } from "./directives";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso } from "./ids";
import { goalObj, goalRow, transferFor, visibleGoal, type GoalRow } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { optStr, oneOf, SESSION_KEY_RE, str, type Body } from "./validate";
import { memberName, memberPrincipal } from "./workspaces";

// Requests and goal holds (REQ-001): the middle level between informing agents (goal versions, limits) and enforcing
// (stop). Someone who can approve for a goal (its approval set, lib/v2/approval.ts) or a workspace owner sends one of
// a fixed set of typed requests to the sessions on the goal; Align writes the wording, the sender is named, and the
// developer can decline any of them. checkpoint and drafting a replan are safe: the agent does them on its own and
// says so (an `accepted` receipt with auto_accepted); switch_goal changes direction and takes effect only when the
// developer accepts. A goal hold is enforced: every session on the goal gets a `hold` directive and its agent blocks
// tools until a `release`. Every write here runs in one transaction with its directive and audit row.

export const REQUEST_TYPES = ["replan", "checkpoint", "switch_goal"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
/** Requests one person may send per hour, across workspaces. */
export const REQUESTS_PER_HOUR = 20;
/** Sessions a switch_goal may name. */
export const SWITCH_SESSIONS_MAX = 20;
export const NOTE_MAX = 280;

type TargetState = "sent" | "received" | "accepted" | "declined" | "expired";
/** How the sender could send it: in the goal's approval set, or as a workspace owner outside it. Fixed at sending. */
export type SenderRole = "approver" | "owner";

interface RequestRow {
  id: string;
  ws_id: string;
  goal_id: string;
  type: RequestType;
  target_goal_id: string | null;
  goal_version: number;
  note: string | null;
  sender_id: string;
  sender_role: SenderRole;
  directive_id: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

interface HoldRow {
  ws_id: string;
  goal_id: string;
  held_by: string;
  reason: string | null;
  held_at: string;
  directive_id: string | null;
}

/** Why a request stopped waiting for answers: its sender (or a workspace owner) withdrew it, or its goal (or a
 *  switch_goal's target goal) was achieved or dropped. */
export type CancelReason = "withdrawn" | "goal_closed";
/** v2_directives.request_json: which request, whether this directive withdraws it, and why (absent: withdrawn). */
export interface RequestJson {
  request_id: string;
  cancelled: boolean;
  reason?: CancelReason;
}
/** v2_directives.hold_json: who held (or released) the goal, why, and when. */
export interface HoldJson {
  by: string;
  reason?: string | null;
  at: string;
}

const person = (id: string) => ({ id, name: memberName(id) });
const sender = (r: RequestRow) => ({ ...person(r.sender_id), role: r.sender_role });
const requestRow = (ws: string, id: string) => get<RequestRow>("SELECT * FROM v2_requests WHERE ws_id = ? AND id = ?", ws, id);
export const holdRow = (ws: string, goalId: string) => get<HoldRow>("SELECT * FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?", ws, goalId);

/** Who sends requests and holds for a goal: its approval set, plus every workspace owner. Viewers never. */
function canSend(pp: PolicyPrincipal, g: GoalRow): boolean {
  if (pp.wsRole === "owner") return true;
  return pp.wsRole === "member" && approvalSet(g).includes(pp.userId);
}

function requireSender(pp: PolicyPrincipal, g: GoalRow, what: string) {
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  if (!canSend(pp, g)) throw forbidden("not_approver", `Only someone who can approve for this goal, or a workspace owner, can ${what}`);
}

/** A goal as a reader sees it in a request: its title only if they can read it. */
function goalRef(pp: PolicyPrincipal, ws: string, goalId: string) {
  const g = goalRow(ws, goalId);
  if (!g || !canReadGoal(pp, goalObj(g))) return { id: null, title: null, version: null, private: true as const };
  return { id: g.id, title: g.title, version: g.version };
}

function sessionKeysIn(b: Body): string[] | null {
  const v = b.session_keys;
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) throw badRequest("session_keys must be a list");
  if (v.length < 1 || v.length > SWITCH_SESSIONS_MAX) throw badRequest(`session_keys: 1 to ${SWITCH_SESSIONS_MAX}`);
  const out: string[] = [];
  for (const k of v) {
    if (typeof k !== "string" || !SESSION_KEY_RE.test(k)) throw badRequest("session_keys must be session keys");
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** May this session's owner bind it to `target` now (own goal, their team's goal, or an approved transfer for this
 *  session), and is the goal active? */
function bindableForSession(ws: string, sessionKey: string, target: GoalRow): boolean {
  if (target.status !== "active") return false;
  const s = get<{ user_id: string }>("SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?", ws, sessionKey);
  if (!s) return false;
  const owner = memberPrincipal(ws, s.user_id);
  return authorize(owner, "goal.bind", { kind: "bind", goal: goalObj(target), hasTransfer: !!transferFor(ws, sessionKey, target.id) }).ok;
}

const OPEN_TARGET = "t.state IN ('sent','received')";

// ---- requests ----

/** POST …/goals/{goal}/requests { type, note?, session_keys?, target_goal_id? } -> 201 { request }. */
export async function sendRequest(pp: PolicyPrincipal, goalId: string, b: Body) {
  const g = visibleGoal(pp, goalId);
  requireSender(pp, g, "send a request to its agents");
  const type = oneOf(b, "type", REQUEST_TYPES);
  const note = optStr(b, "note", NOTE_MAX);
  const keys = sessionKeysIn(b);
  let target: GoalRow | null = null;
  if (type === "switch_goal") {
    if (!keys) throw badRequest("session_keys is required for switch_goal");
    const tid = str(b, "target_goal_id", 64);
    if (tid === g.id) throw badRequest("target_goal_id must be another goal");
    target = visibleGoal(pp, tid);
  } else if (b.target_goal_id !== undefined && b.target_goal_id !== null) throw badRequest("target_goal_id goes only with switch_goal");
  const at = nowIso();
  const id = await tx(() => {
    const live = goalRow(pp.wsId, g.id)!;
    if (live.status !== "active") throw conflict("wrong_state", "This goal is no longer active");
    const onGoal = goalTargets(pp.wsId, g.id);
    if (keys && keys.some((k) => !onGoal.includes(k))) throw badRequest("session_keys must be sessions on this goal");
    const targets = keys ?? onGoal;
    if (!targets.length) throw conflict("no_sessions", "No shared session is working on this goal");
    const to = target;
    if (to && !targets.every((k) => bindableForSession(pp.wsId, k, to))) {
      throw conflict("not_bindable", "That goal can't be taken up by every chosen session: it is not active, or a session's owner can't bind it");
    }
    const open = get(
      `SELECT 1 AS x FROM v2_requests r WHERE r.ws_id = ? AND r.goal_id = ? AND r.type = ? AND r.cancelled_at IS NULL
       AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND ${OPEN_TARGET})`,
      pp.wsId,
      g.id,
      type,
    );
    if (open) throw conflict("already_open", "A request of this type is still waiting for an answer on this goal; cancel it first");
    const sent = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_requests WHERE sender_id = ? AND created_at > ?", pp.userId, new Date(Date.now() - 3600_000).toISOString())?.n ?? 0;
    if (sent >= REQUESTS_PER_HOUR) throw new V2Error(429, "rate_limited", "Too many requests sent in the last hour, try again later");
    const rid = newId("rq");
    const role: SenderRole = approvalSet(live).includes(pp.userId) ? "approver" : "owner";
    const dir = writeDirective(pp.wsId, "request", targets, null, null, { goalId: g.id, request: { request_id: rid, cancelled: false } })!;
    run(
      `INSERT INTO v2_requests (id, ws_id, goal_id, type, target_goal_id, goal_version, note, sender_id, sender_role, directive_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      rid,
      pp.wsId,
      g.id,
      type,
      target?.id ?? null,
      live.version,
      note,
      pp.userId,
      role,
      dir,
      at,
    );
    for (const k of targets) run("INSERT INTO v2_request_targets (ws_id, request_id, session_key, state, updated_at) VALUES (?, ?, ?, 'sent', ?)", pp.wsId, rid, k, at);
    audit(pp.wsId, pp.userId, "request.sent", rid, at);
    event("first_request", { ws: pp.wsId, user: pp.userId, props: { type }, at });
    return rid;
  });
  return { request: requestView(pp, g, requestRow(pp.wsId, id)!) };
}

/** DELETE …/requests/{id}: the sender or a workspace owner withdraws it. Sessions that have not answered get a
 *  `request` directive with cancelled true and their state becomes expired. Cancelling again changes nothing. */
export async function cancelRequest(pp: PolicyPrincipal, goalId: string, id: string) {
  const g = visibleGoal(pp, goalId);
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything");
  const r = requestRow(pp.wsId, id);
  if (!r || r.goal_id !== g.id) throw notFound();
  if (r.sender_id !== pp.userId && pp.wsRole !== "owner") throw forbidden("not_sender", "Only the person who sent this request, or a workspace owner, can cancel it");
  const at = nowIso();
  await tx(() => {
    const cur = requestRow(pp.wsId, id)!;
    if (cur.cancelled_at) return;
    const open = all<{ session_key: string }>(`SELECT t.session_key FROM v2_request_targets t WHERE t.request_id = ? AND ${OPEN_TARGET}`, id).map((t) => t.session_key);
    writeDirective(pp.wsId, "request", open, null, null, { goalId: g.id, request: { request_id: id, cancelled: true, reason: "withdrawn" } });
    run(`UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE request_id = ? AND state IN ('sent','received')`, at, id);
    run("UPDATE v2_requests SET cancelled_at = ?, cancelled_by = ? WHERE id = ?", at, pp.userId, id);
    audit(pp.wsId, pp.userId, "request.cancelled", id, at);
  });
  return { request: requestView(pp, g, requestRow(pp.wsId, id)!) };
}

/** When a goal is achieved or dropped (inside writeGoalVersion's tx): its requests, and switch_goal requests toward
 *  it, stop waiting. The sessions still `sent` or `received` get a `request` directive with cancelled true (reason
 *  goal_closed) and become expired, as on a cancel; sessions that answered keep their answer, and the request is not
 *  marked cancelled. Each such request is audited request.expired with the person whose action closed the goal. */
export function expireOpenRequests(ws: string, goalId: string, actorId: string, at: string) {
  const open = all<{ id: string; goal_id: string }>(
    `SELECT r.id, r.goal_id FROM v2_requests r WHERE r.ws_id = ? AND (r.goal_id = ? OR r.target_goal_id = ?) AND r.cancelled_at IS NULL
     AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND ${OPEN_TARGET}) ORDER BY r.created_at, r.id`,
    ws,
    goalId,
    goalId,
  );
  for (const r of open) {
    const keys = all<{ session_key: string }>(`SELECT t.session_key FROM v2_request_targets t WHERE t.request_id = ? AND ${OPEN_TARGET}`, r.id).map((t) => t.session_key);
    writeDirective(ws, "request", keys, null, null, { goalId: r.goal_id, request: { request_id: r.id, cancelled: true, reason: "goal_closed" } });
    run(`UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE request_id = ? AND state IN ('sent','received')`, at, r.id);
    audit(ws, actorId, "request.expired", r.id, at);
  }
}

interface TargetRow {
  session_key: string;
  state: TargetState;
  auto_accepted: number;
  updated_at: string;
  user_id: string;
  repo_alias: string | null;
  harness: string;
  title: string | null;
}

/** A request as the goal page shows it. The sender, the goal's approvers and workspace owners see every session's
 *  row (owner, repository alias, state); anyone else who reads the goal sees their own sessions' rows and the counts. */
function requestView(pp: PolicyPrincipal, g: GoalRow, r: RequestRow, approvers = approvalSet(g)) {
  const rows = all<TargetRow>(
    `SELECT t.session_key, t.state, t.auto_accepted, t.updated_at, s.user_id, s.repo_alias, s.harness, s.title
     FROM v2_request_targets t JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.request_id = ? ORDER BY t.session_key`,
    r.id,
  );
  const everyone = r.sender_id === pp.userId || pp.wsRole === "owner" || approvers.includes(pp.userId);
  const count = (...s: TargetState[]) => rows.filter((t) => s.includes(t.state)).length;
  const pending = count("sent", "received");
  return {
    id: r.id,
    type: r.type,
    goal: { id: g.id, title: g.title, version: r.goal_version },
    target_goal: r.target_goal_id ? goalRef(pp, r.ws_id, r.target_goal_id) : null,
    note: r.note,
    sender: sender(r),
    created_at: r.created_at,
    cancelled_at: r.cancelled_at,
    cancelled_by: r.cancelled_by ? person(r.cancelled_by) : null,
    // expired: its goal closed before any session answered (lib/v2/goals.ts writeGoalVersion).
    state: r.cancelled_at ? ("cancelled" as const) : pending ? ("open" as const) : rows.length && count("expired") === rows.length ? ("expired" as const) : ("answered" as const),
    counts: { pending, accepted: count("accepted"), declined: count("declined"), expired: count("expired"), done_by_agent: rows.filter((t) => t.state === "accepted" && t.auto_accepted).length },
    sessions: rows
      .filter((t) => everyone || t.user_id === pp.userId)
      .map((t) => ({
        session_key: t.session_key,
        owner: person(t.user_id),
        mine: t.user_id === pp.userId,
        repo_alias: t.repo_alias,
        harness: t.harness,
        title: t.user_id === pp.userId ? t.title : null,
        state: t.state,
        auto_accepted: !!t.auto_accepted,
        updated_at: t.updated_at,
      })),
    can_cancel: !r.cancelled_at && pending > 0 && pp.wsRole !== "viewer" && (r.sender_id === pp.userId || pp.wsRole === "owner"),
  };
}
export type RequestView = ReturnType<typeof requestView>;

/** GET …/goals/{goal}/requests: the goal's requests, newest first (at most 50), whether the caller may send one, and
 *  for a sender the sessions on the goal to pick from. */
export function listRequests(pp: PolicyPrincipal, goalId: string) {
  const g = visibleGoal(pp, goalId);
  const approvers = approvalSet(g);
  const rows = all<RequestRow>("SELECT * FROM v2_requests WHERE ws_id = ? AND goal_id = ? ORDER BY created_at DESC, id LIMIT 50", pp.wsId, g.id);
  const sender = canSend(pp, g);
  const sessions = sender
    ? goalTargets(pp.wsId, g.id).map((k) => {
        const s = get<{ user_id: string; repo_alias: string | null; harness: string }>("SELECT user_id, repo_alias, harness FROM v2_sessions WHERE ws_id = ? AND session_key = ?", pp.wsId, k)!;
        return { session_key: k, owner: person(s.user_id), mine: s.user_id === pp.userId, repo_alias: s.repo_alias, harness: s.harness };
      })
    : null;
  return { requests: rows.map((r) => requestView(pp, g, r, approvers)), can_send: sender && g.status === "active", sessions, hold: holdView(pp, g) };
}

/** A request on the device wire (GET /api/v2/directives, kind request). Goal titles are withheld (null) from a person
 *  who can no longer read that goal; null when the request no longer exists. A cancelled one says why (cancel_reason
 *  withdrawn or goal_closed); cancel_reason is null otherwise. */
export function requestWire(pp: PolicyPrincipal, j: RequestJson) {
  const r = requestRow(pp.wsId, j.request_id);
  if (!r) return null;
  const title = (id: string) => {
    const g = goalRow(r.ws_id, id);
    return g && canReadGoal(pp, goalObj(g)) ? { title: g.title, version: g.version } : { title: null, version: g?.version ?? null };
  };
  const target = r.target_goal_id ? title(r.target_goal_id) : null;
  return {
    id: r.id,
    type: r.type,
    cancelled: j.cancelled,
    cancel_reason: j.cancelled ? (j.reason ?? "withdrawn") : null,
    goal: { id: r.goal_id, title: title(r.goal_id).title, version: r.goal_version },
    target_goal: r.target_goal_id ? { id: r.target_goal_id, title: target!.title, version: target!.version } : null,
    sender: sender(r),
    note: r.note,
    created_at: r.created_at,
  };
}

/** Move one session's request state on an answer or a delivery receipt (inside the receipt's tx). received after
 *  sent; accepted or declined while pending; a decline also overrides an accept the agent made on its own, and the
 *  developer's own accept confirms one (auto_accepted back to 0). A cancelled (expired) or answered request keeps its
 *  state. auto_accepted on a switch_goal is refused (400): it changes direction, so only the developer accepts it.
 *  Each answer that changes the state is audited, with the session's person (`actor`) as actor: request.accepted (the
 *  developer's), request.done_by_agent (the agent's own) or request.declined. Returns the state. */
export function requestReceipt(ws: string, requestId: string, sessionKey: string, state: ReceiptState, auto: boolean, actor: string): TargetState | null {
  const r = requestRow(ws, requestId);
  const t = get<{ state: TargetState; auto_accepted: number }>("SELECT state, auto_accepted FROM v2_request_targets WHERE request_id = ? AND session_key = ?", requestId, sessionKey);
  if (!r || !t) return null;
  if (auto && r.type === "switch_goal") throw badRequest("A switch_goal request takes effect only when the developer accepts it");
  const pending = t.state === "sent" || t.state === "received";
  let next: TargetState = t.state;
  let flag = t.auto_accepted;
  if (state === "received" && t.state === "sent") next = "received";
  else if (state === "accepted" && pending) [next, flag] = ["accepted", auto ? 1 : 0];
  else if (state === "accepted" && t.state === "accepted" && !auto) flag = 0;
  else if (state === "declined" && (pending || (t.state === "accepted" && t.auto_accepted))) [next, flag] = ["declined", 0];
  if (next !== t.state || flag !== t.auto_accepted) {
    const at = nowIso();
    run("UPDATE v2_request_targets SET state = ?, auto_accepted = ?, updated_at = ? WHERE request_id = ? AND session_key = ?", next, flag, at, requestId, sessionKey);
    if (next === "accepted") audit(ws, actor, flag ? "request.done_by_agent" : "request.accepted", requestId, at);
    else if (next === "declined") audit(ws, actor, "request.declined", requestId, at);
  }
  return next;
}

// ---- goal holds ----

function holdView(pp: PolicyPrincipal, g: GoalRow) {
  const h = holdRow(g.ws_id, g.id);
  return {
    held: h ? { held_by: person(h.held_by), reason: h.reason, held_at: h.held_at } : null,
    can_hold: pp.wsRole !== "viewer" && canSend(pp, g),
  };
}

/** 404 for a goal the caller can't read, 403 for one they may not hold or release (checked before the recent sign-in
 *  the hold routes ask for). */
export function requireHolder(pp: PolicyPrincipal, goalId: string) {
  requireSender(pp, visibleGoal(pp, goalId), "hold or release its agents");
}

/** GET …/goals/{goal}/hold: whether the goal is held, by whom and why, and whether the caller may hold or release it. */
export function getHold(pp: PolicyPrincipal, goalId: string) {
  return holdView(pp, visibleGoal(pp, goalId));
}

/** PUT …/goals/{goal}/hold { reason? }: hold every session on the goal (a `hold` directive to each). 201 when it
 *  becomes held; 200 with nothing new when it already is. */
export async function holdGoal(pp: PolicyPrincipal, goalId: string, b: Body) {
  const g = visibleGoal(pp, goalId);
  requireSender(pp, g, "hold its agents");
  const reason = optStr(b, "reason", NOTE_MAX);
  const at = nowIso();
  const created = await tx(() => {
    if (holdRow(pp.wsId, g.id)) return false;
    if (goalRow(pp.wsId, g.id)!.status !== "active") throw conflict("wrong_state", "This goal is no longer active");
    const dir = writeDirective(pp.wsId, "hold", goalTargets(pp.wsId, g.id), null, null, { goalId: g.id, hold: { by: pp.userId, reason, at } });
    run("INSERT INTO v2_goal_holds (ws_id, goal_id, held_by, reason, held_at, directive_id) VALUES (?, ?, ?, ?, ?, ?)", pp.wsId, g.id, pp.userId, reason, at, dir);
    audit(pp.wsId, pp.userId, "goal.held", g.id, at);
    event("first_hold", { ws: pp.wsId, user: pp.userId, at });
    return true;
  });
  return { status: created ? 201 : 200, body: getHold(pp, goalId) };
}

/** Every session a hold directive of this hold reached (the one written when it was held and those written for
 *  sessions that bound to the goal later: each carries the hold's time), whether or not it is still on the goal. */
const SQL_HOLD_REACHED = `SELECT DISTINCT t.session_key FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
  WHERE d.ws_id = ? AND d.goal_id = ? AND d.kind = 'hold' AND json_extract(d.hold_json, '$.at') = ?`;

/** Sessions a release reaches: every session the hold reached (a session that left the goal still carries the hold
 *  until a release reaches it), and any session on the goal now. */
function releaseTargets(ws: string, goalId: string, heldAt: string): string[] {
  const held = all<{ session_key: string }>(SQL_HOLD_REACHED, ws, goalId, heldAt).map((r) => r.session_key);
  return [...new Set([...held, ...goalTargets(ws, goalId)])].sort();
}

/** Release a held goal (inside the caller's tx): a `release` directive, the hold row deleted, audit goal.released.
 *  False when the goal is not held. Also called when the goal is achieved or dropped (lib/v2/goals.ts). */
export function releaseHold(ws: string, goalId: string, actorId: string, at: string): boolean {
  const h = holdRow(ws, goalId);
  if (!h) return false;
  writeDirective(ws, "release", releaseTargets(ws, goalId, h.held_at), null, null, { goalId, hold: { by: actorId, at } });
  run("DELETE FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?", ws, goalId);
  audit(ws, actorId, "goal.released", goalId, at);
  return true;
}

/** DELETE …/goals/{goal}/hold: release it (the same people who may hold it). Releasing a goal that is not held
 *  changes nothing. */
export async function releaseGoal(pp: PolicyPrincipal, goalId: string) {
  const g = visibleGoal(pp, goalId);
  requireSender(pp, g, "release its agents");
  await tx(() => releaseHold(pp.wsId, g.id, pp.userId, nowIso()));
  return getHold(pp, goalId);
}

/** A session that binds to (or comes to be governed by) a held goal gets the hold too (inside the binding's tx): a
 *  fresh `hold` directive for it, unless a hold directive of this hold already reached it. */
export function holdNewlyBound(ws: string, goalId: string, sessionKey: string) {
  const h = holdRow(ws, goalId);
  if (!h) return;
  const reached = get(`SELECT 1 AS x FROM (${SQL_HOLD_REACHED}) WHERE session_key = ?`, ws, goalId, h.held_at, sessionKey);
  if (!reached) writeDirective(ws, "hold", [sessionKey], null, null, { goalId, hold: { by: h.held_by, reason: h.reason, at: h.held_at } });
}

/** A hold or release on the device wire. The goal's title is withheld (null) from a person who can no longer read it. */
export type HoldWire =
  | { goal: { id: string; title: string | null }; held_by: { id: string; name: string }; reason: string | null; at: string }
  | { goal: { id: string; title: string | null }; released_by: { id: string; name: string }; at: string };
export function holdWire(pp: PolicyPrincipal, kind: "hold" | "release", goalId: string, j: HoldJson): HoldWire {
  const g = goalRow(pp.wsId, goalId);
  const goal = { id: goalId, title: g && canReadGoal(pp, goalObj(g)) ? g.title : null };
  if (kind === "release") return { goal, released_by: person(j.by), at: j.at };
  return { goal, held_by: person(j.by), reason: j.reason ?? null, at: j.at };
}

/** GET /api/v2/workspaces/{ws}/holds: the held goals this caller can read (the Goals and Sessions tabs' banners). */
export function listHolds(pp: PolicyPrincipal) {
  return all<HoldRow>("SELECT * FROM v2_goal_holds WHERE ws_id = ? ORDER BY held_at", pp.wsId)
    .map((h) => ({ h, g: goalRow(pp.wsId, h.goal_id) }))
    .filter(({ g }) => g && canReadGoal(pp, goalObj(g)))
    .map(({ h, g }) => ({ goal: { id: g!.id, title: g!.title }, held_by: person(h.held_by), reason: h.reason, held_at: h.held_at }));
}
