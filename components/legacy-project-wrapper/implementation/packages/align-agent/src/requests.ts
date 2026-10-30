// Requests and goal holds (REQ-002), the sync and CLI side. A `request` directive is stored per session and told at the
// session's next prompt by the hooks; the developer's answer (or the agent's own, for a safe request) goes back as an
// `accepted` or `declined` receipt. A `hold` directive sets a per-goal latch that blocks every tool until `release`.
import type { Ctx } from "./context.ts";
import { nowIso, tx } from "./db.ts";
import { loadFeed } from "./goals.ts";
import { addNotice, getShare, renderHot, snapshot } from "./hot.ts";
import { enqueue } from "./share.ts";
import { releaseNotice, SAFE_REQUESTS } from "./shared/envelope.ts";
import { randomId } from "./shared/fsx.ts";
import type { RequestState, RequestType, WireHold, WireRequest } from "./shared/types.ts";

const TYPES = new Set<RequestType>(["replan", "checkpoint", "switch_goal"]);

export interface RequestRow {
  request_id: string;
  local_id: string;
  directive_id: string;
  type: RequestType;
  json: string;
  state: RequestState;
  answered_at: string | null;
  created_at: string;
}

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** A request as the server sends it; a cancellation needs only its id. */
export function validRequest(q: WireRequest | undefined): q is WireRequest {
  if (!q || typeof q !== "object" || !str(q.id, 80) || !q.id.startsWith("rq_")) return false;
  if (q.cancelled === true) return true;
  if (!TYPES.has(q.type) || !q.goal || !str(q.goal.id, 64) || !q.sender || typeof q.sender.name !== "string") return false;
  return q.type !== "switch_goal" || (!!q.target_goal && str(q.target_goal.id, 64));
}

/** A `request` directive for one owned session: store a new request, or withdraw a pending one. */
export function applyRequest(ctx: Ctx, directiveId: string, q: WireRequest | undefined, lid: string, at: string): "received" | "stale" {
  if (!validRequest(q)) return "stale";
  if (q.cancelled === true) {
    ctx.db.prepare("UPDATE goal_requests SET state='withdrawn', answered_at=? WHERE request_id=? AND local_id=? AND state='pending'").run(at, q.id, lid);
    return "received";
  }
  const { cancelled: _c, ...wire } = q;
  ctx.db
    .prepare("INSERT OR IGNORE INTO goal_requests(request_id, local_id, directive_id, type, json, state, created_at) VALUES(?,?,?,?,?,'pending',?)")
    .run(q.id, lid, directiveId, q.type, JSON.stringify(wire), at);
  return "received";
}

/** `hold` (held) or `release` for one owned session, ordered by directive seq per goal. */
export function applyHold(ctx: Ctx, directiveId: string, h: WireHold | undefined, held: boolean, lid: string, seq: number, at: string): "enforced" | "applied" | "stale" {
  if (!h || !h.goal || !str(h.goal.id, 64)) return "stale";
  const cur = ctx.db.prepare("SELECT seq, held FROM holds WHERE local_id=? AND goal_id=?").get(lid, h.goal.id) as { seq: number; held: number } | undefined;
  if (cur && cur.seq >= seq) return "stale";
  const json = { goal_title: String(h.goal.title || ""), by: String((held ? h.held_by?.name : h.released_by?.name) || ""), reason: held && typeof h.reason === "string" ? h.reason : null };
  ctx.db
    .prepare(
      `INSERT INTO holds(local_id, goal_id, held, json, directive_id, seq, at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(local_id, goal_id) DO UPDATE SET held=excluded.held, json=excluded.json, directive_id=excluded.directive_id, seq=excluded.seq, at=excluded.at`,
    )
    .run(lid, h.goal.id, held ? 1 : 0, JSON.stringify(json), directiveId, seq, at);
  if (!held && cur?.held) addNotice(ctx, lid, `release_${directiveId}`, releaseNotice(json.by, json.goal_title));
  return held ? "enforced" : "applied";
}

export interface AnswerResult {
  ok: boolean;
  why?: string;
  row?: RequestRow;
}

/** The developer may still answer after the agent did a safe request: decline either, or agree to a drafted replan. */
export function answerable(type: string, state: RequestState, answer: "accepted" | "declined"): boolean {
  if (state === "pending") return true;
  return state === "auto_accepted" && (answer === "declined" || type === "replan");
}

/**
 * Record an answer for one session and queue its receipt. `accepted` from pending, or for a replan the agent drafted
 * (the developer agreeing to the updated plan); `declined` from pending or after the agent auto-accepted. A switch_goal
 * is never auto-accepted; accepting it queues the binding change for the next root turn, like `align bind`.
 */
export function answerRequest(ctx: Ctx, lid: string, requestId: string, answer: "accepted" | "declined", auto: boolean, at = nowIso()): AnswerResult {
  const row = ctx.db.prepare("SELECT * FROM goal_requests WHERE request_id=? AND local_id=?").get(requestId, lid) as unknown as RequestRow | undefined;
  if (!row) return { ok: false, why: "no such request for this session" };
  const share = getShare(ctx, lid);
  if (!share || share.state === "error") return { ok: false, why: "this session is not shared", row };
  if (!answerable(row.type, row.state, answer) || (auto && row.state !== "pending")) return { ok: false, why: `the request is already ${stateWords(row.state)}`, row };
  if (auto && (answer !== "accepted" || !SAFE_REQUESTS.has(row.type))) return { ok: false, why: "only a checkpoint or a replan draft is done without the developer's answer", row };
  const q = JSON.parse(row.json) as WireRequest;
  let target = null;
  if (answer === "accepted" && row.type === "switch_goal") {
    if (share.state !== "shared" && share.state !== "suspended" && share.state !== "pending") return { ok: false, why: "this session is not shared", row };
    target = loadFeed(ctx.home, share.workspace_id)?.goals.find((g) => g.id === q.target_goal?.id) || null;
    if (target && (!target.bindable || target.status !== "active")) return { ok: false, why: `goal "${target.title}" can no longer be bound; decline the request instead`, row };
  }
  const state: RequestState = answer === "declined" ? "declined" : auto ? "auto_accepted" : "accepted";
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE goal_requests SET state=?, answered_at=? WHERE request_id=? AND local_id=?").run(state, at, requestId, lid);
    enqueue(ctx, lid, "receipt", { directive_id: row.directive_id, body: { session_key: share.session_key, state: answer, at, ...(auto ? { auto_accepted: true } : {}) } });
    if (answer === "accepted" && row.type === "switch_goal" && q.target_goal) {
      // The existing binding path: a pending binding the next UserPromptSubmit opens as a new epoch. The cause names
      // the request's directive, which the server sent to this session. A goal the feed has not cached yet gets its
      // snapshot from the next feed refresh (syncSnapshots).
      ctx.db
        .prepare(
          `INSERT INTO pending_bindings(local_id, id, goal_id, goal_json, cause, directive_id, created_at) VALUES(?,?,?,?,?,?,?)
           ON CONFLICT(local_id) DO UPDATE SET id=excluded.id, goal_id=excluded.goal_id, goal_json=excluded.goal_json, cause=excluded.cause,
             directive_id=excluded.directive_id, created_at=excluded.created_at`,
        )
        .run(lid, randomId("pb_"), q.target_goal.id, target ? JSON.stringify(snapshot(target)) : null, `directive:${row.directive_id}`, null, at);
    }
  });
  renderHot(ctx, lid);
  return { ok: true, row: { ...row, state, answered_at: at } };
}

export function stateWords(s: RequestState): string {
  return s === "auto_accepted" ? "done by the agent" : s === "pending" ? "waiting for an answer" : s;
}

/** Requests on this device, newest first (`align requests`). */
export function listRequests(ctx: Ctx, opts: { all?: boolean } = {}): (RequestRow & { harness: string; native_id: string })[] {
  return ctx.db
    .prepare(
      `SELECT r.*, s.harness AS harness, s.native_id AS native_id FROM goal_requests r JOIN sessions s ON s.local_id=r.local_id
       ${opts.all ? "" : "WHERE r.state IN ('pending','auto_accepted')"} ORDER BY r.created_at DESC LIMIT 200`,
    )
    .all() as unknown as (RequestRow & { harness: string; native_id: string })[];
}
