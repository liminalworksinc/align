// Directive intake: polled by cursor from the hook-started sync. A directive is accepted only for session keys this device owns, written durably, projected into hot files, and
// acknowledged with a `received` receipt (plus `enforced` once a stop latch or a goal hold is set, `applied` once a
// resume or release lifts it). Requests (REQ-002) get `accepted` or `declined` later, when they are answered.
import type { Ctx } from "./context.ts";
import { api, HttpError } from "./api.ts";
import { bumpGap, kvGet, kvSet, nowIso, tx } from "./db.ts";
import { addNotice, getShare, renderEndedShares, renderHot, snapshot } from "./hot.ts";
import { ENDED_UNREAD, endSharesEndedOnServer, enqueue, type EndedOnServer } from "./share.ts";
import { RESUMED_NOTICE } from "./shared/notices.ts";
import type { Goal, WireHold, WireRequest } from "./shared/types.ts";
import { loadFeed } from "./goals.ts";
import { applyHold, applyRequest, validRequest } from "./requests.ts";

/** Workspaces whose feed should be refreshed because a directive referenced a goal we have not cached. */
const refreshNeeded = new Set<string>();

export interface Directive {
  id: string;
  seq: number;
  ws: string;
  kind: "goal_version" | "binding_changed" | "binding_suspended" | "stop" | "resume" | "request" | "hold" | "release";
  session_keys: string[];
  goal: Goal | null;
  binding: { goal_id: string | null; effective: string; cause: string } | null;
  /** kind "request" only. */
  request?: WireRequest;
  /** kind "hold" and "release" only. */
  hold?: WireHold;
  created_at: string;
}

export function cursor(ctx: Ctx): number {
  return Number(kvGet(ctx.db, "directive_cursor") || 0);
}

/** The cursor only moves forward. */
function advanceCursor(ctx: Ctx, seq: number): void {
  if (Number.isSafeInteger(seq) && seq > cursor(ctx)) kvSet(ctx.db, "directive_cursor", String(seq));
}

export interface HandleResult {
  /** New and stored (not a replay, out of order or malformed). */
  stored: boolean;
  accepted: boolean;
  sessions: string[];
  refreshWorkspaces: string[];
}

export function handleDirective(ctx: Ctx, d: Directive): HandleResult {
  const res: HandleResult = { stored: false, accepted: false, sessions: [], refreshWorkspaces: [] };
  if (!d || typeof d.id !== "string" || !Number.isSafeInteger(Number(d.seq)) || !Array.isArray(d.session_keys)) {
    bumpGap(ctx.db, "directive_malformed");
    return res;
  }
  const seq = Number(d.seq);
  // A replay (a restored database, a cursor that went back) is dropped, but the cursor still moves past it, so intake
  // makes progress past already-stored directives instead of fetching the same page again.
  if (ctx.db.prepare("SELECT 1 FROM directives WHERE id=?").get(d.id)) {
    bumpGap(ctx.db, "directive_replay");
    advanceCursor(ctx, seq);
    return res;
  }
  if (seq <= cursor(ctx)) {
    bumpGap(ctx.db, "directive_out_of_order");
    return res;
  }
  const owned: { local_id: string; workspace_id: string; session_key: string }[] = [];
  for (const key of d.session_keys) {
    const s = ctx.db.prepare("SELECT local_id, workspace_id, session_key FROM shares WHERE session_key=? AND state!='error'").get(key) as
      | { local_id: string; workspace_id: string; session_key: string }
      | undefined;
    if (s && (!d.ws || s.workspace_id === d.ws)) owned.push(s);
  }
  if (d.kind === "request" && !validRequest(d.request)) bumpGap(ctx.db, "request_malformed");
  const at = nowIso();
  tx(ctx.db, () => {
    ctx.db.prepare("INSERT INTO directives(id, seq, kind, json, received_at) VALUES(?,?,?,?,?)").run(d.id, seq, d.kind, JSON.stringify(d), at);
    kvSet(ctx.db, "directive_cursor", String(seq));
    for (const s of owned) {
      const state = applyOne(ctx, d, s.local_id, seq, at);
      ctx.db.prepare("INSERT OR IGNORE INTO directive_sessions(directive_id, local_id, state) VALUES(?,?,?)").run(d.id, s.local_id, state);
      enqueue(ctx, s.local_id, "receipt", { directive_id: d.id, body: { session_key: s.session_key, state: "received", at } });
      if (state === "enforced") enqueue(ctx, s.local_id, "receipt", { directive_id: d.id, body: { session_key: s.session_key, state: "enforced", at } });
      if (state === "applied") enqueue(ctx, s.local_id, "receipt", { directive_id: d.id, body: { session_key: s.session_key, state: "applied", at } });
    }
  });
  for (const s of owned) renderHot(ctx, s.local_id);
  res.stored = true;
  res.accepted = owned.length > 0;
  res.sessions = owned.map((s) => s.local_id);
  if (d.kind === "goal_version" && d.ws) res.refreshWorkspaces.push(d.ws);
  for (const ws of refreshNeeded) res.refreshWorkspaces.push(ws);
  refreshNeeded.clear();
  return res;
}

/** Returns the per-session delivery state after the durable write. */
function applyOne(ctx: Ctx, d: Directive, lid: string, seq: number, at: string): "received" | "applied" | "enforced" | "stale" {
  const share = getShare(ctx, lid);
  switch (d.kind) {
    case "goal_version": {
      if (!d.goal || !share) return "stale";
      const snap = snapshot(d.goal);
      let touched = false;
      if (share.binding_goal === d.goal.id) {
        const cur = share.goal_json ? JSON.parse(share.goal_json) : null;
        if (!cur || d.goal.version > cur.version || (d.goal.version === cur.version && d.goal.status !== cur.status)) {
          ctx.db.prepare("UPDATE shares SET goal_json=? WHERE local_id=?").run(JSON.stringify(snap), lid);
          touched = true;
        } else if (d.goal.version === cur.version) {
          // The goals feed already moved the snapshot to this version (the same sync pass polled directives before the
          // server wrote this one): still pending, so the next injection at this version reports it applied.
          touched = true;
        }
      }
      const pending = ctx.db.prepare("SELECT goal_id, goal_json FROM pending_bindings WHERE local_id=?").get(lid) as { goal_id: string | null; goal_json: string | null } | undefined;
      if (pending && pending.goal_id === d.goal.id) {
        const cur = pending.goal_json ? JSON.parse(pending.goal_json) : null;
        if (!cur || d.goal.version >= cur.version) ctx.db.prepare("UPDATE pending_bindings SET goal_json=? WHERE local_id=?").run(JSON.stringify(snap), lid);
      }
      return touched ? "received" : "stale";
    }
    case "binding_changed": {
      if (!d.binding || !share) return "stale";
      const target = d.goal && d.goal.id === d.binding.goal_id ? d.goal : d.binding.goal_id ? loadFeed(ctx.home, share.workspace_id)?.goals.find((g) => g.id === d.binding!.goal_id) || null : null;
      ctx.db
        .prepare(
          `INSERT INTO pending_bindings(local_id, id, goal_id, goal_json, cause, directive_id, created_at) VALUES(?,?,?,?,?,?,?)
           ON CONFLICT(local_id) DO UPDATE SET id=excluded.id, goal_id=excluded.goal_id, goal_json=excluded.goal_json, cause=excluded.cause,
             directive_id=excluded.directive_id, created_at=excluded.created_at`,
        )
        .run(lid, d.id, d.binding.goal_id, target ? JSON.stringify(snapshot(target)) : null, `directive:${d.id}`, d.id, at);
      if (d.binding.goal_id && !target) refreshNeeded.add(share.workspace_id);
      return "received";
    }
    case "binding_suspended": {
      if (!share) return "stale";
      ctx.db.prepare("UPDATE shares SET state='suspended', suspended_at=? WHERE local_id=? AND state IN ('shared','pending','suspended')").run(at, lid);
      ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
      addNotice(
        ctx,
        lid,
        `susp_${d.id}`,
        "Align: this session's goal binding was revoked, so its usage is paused and stays on this machine. Type `::align bind <goal>` or run `align bind` to pick a goal.",
      );
      return "received";
    }
    case "stop": {
      const cur = ctx.db.prepare("SELECT seq FROM latches WHERE local_id=?").get(lid) as { seq: number } | undefined;
      if (cur && cur.seq >= seq) return "stale";
      ctx.db
        .prepare("INSERT INTO latches(local_id, stopped, directive_id, seq, at) VALUES(?,1,?,?,?) ON CONFLICT(local_id) DO UPDATE SET stopped=1, directive_id=excluded.directive_id, seq=excluded.seq, at=excluded.at")
        .run(lid, d.id, seq, at);
      // A later stop withdraws a "resumed" notice the session has not been told yet: the next prompt must not say the
      // tools work again while they are blocked (C4-6).
      ctx.db.prepare("DELETE FROM notices WHERE local_id=? AND substr(id, 1, length(?))=?").run(lid, `${lid}/resumed_`, `${lid}/resumed_`);
      return "enforced";
    }
    case "resume": {
      const cur = ctx.db.prepare("SELECT seq, stopped FROM latches WHERE local_id=?").get(lid) as { seq: number; stopped: number } | undefined;
      if (cur && cur.seq >= seq) return "stale";
      ctx.db
        .prepare("INSERT INTO latches(local_id, stopped, directive_id, seq, at) VALUES(?,0,?,?,?) ON CONFLICT(local_id) DO UPDATE SET stopped=0, directive_id=excluded.directive_id, seq=excluded.seq, at=excluded.at")
        .run(lid, d.id, seq, at);
      // A stop lifted from the web is told at the next prompt, to the user and to the model, which otherwise goes on
      // believing its tools are blocked.
      if (cur?.stopped) {
        kvSet(ctx.db, `resumed:${lid}`, d.id);
        // Worded again when it is told, while a goal hold still blocks the tools (C10-3).
        addNotice(ctx, lid, `resumed_${d.id}`, RESUMED_NOTICE);
      }
      return "applied";
    }
    case "request":
      return share ? applyRequest(ctx, d.id, d.request, lid, at) : "stale";
    case "hold":
    case "release":
      return applyHold(ctx, d.id, d.hold, d.kind === "hold", lid, seq, at);
    default:
      return "stale";
  }
}

/** Directives per page the server sends at most (docs/v2/WIRE.md); a shorter page is the last one. */
const PAGE = 100;

/** An `ended_sessions` entry of the shape the server sends. */
function validEnded(e: unknown): e is EndedOnServer {
  const x = e as EndedOnServer | null;
  return !!x && typeof x.ws === "string" && typeof x.session_key === "string" && typeof x.stopped_at === "string" && !Number.isNaN(Date.parse(x.stopped_at)) && (x.ended_reason === null || typeof x.ended_reason === "string");
}

/**
 * Fetch directives by cursor, up to 20 pages a pass. After each page the cursor moves to the server's `next_cursor`
 * (never backwards), so a page of replays or malformed directives is never fetched again. Returns how many directives
 * were new and stored (replays and out-of-order ones are not counted). `onReach` gets the ids of the workspaces the
 * server says this device reaches now (`workspaces`, when the answer has it), so the pass can re-read `/me` at once
 * when they changed (a workspace given back at an invite, or one lost). The first page's `ended_sessions` end the shares
 * the server ended (`endSharesEndedOnServer`).
 */
export async function pollDirectives(ctx: Ctx, onRefresh: (ws: string) => void, onReach: (ws: string[]) => void = () => undefined): Promise<number> {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const from = cursor(ctx);
    const r = await api(ctx, "GET", `/api/v2/directives?cursor=${from}`);
    if (r.status !== 200) {
      if (r.status >= 500 || r.status === 429) throw new HttpError(r.status, r.json?.error ?? null, r.json);
      return n;
    }
    if (i === 0 && Array.isArray(r.json?.workspaces)) onReach(r.json.workspaces.filter((w: unknown): w is string => typeof w === "string"));
    // Shares the server ended (Stop sharing on the web, say), which no directive tells: they end here now (cycle 8).
    if (i === 0 && Array.isArray(r.json?.ended_sessions)) endSharesEndedOnServer(ctx, r.json.ended_sessions.filter(validEnded));
    if (i === 0) endedRead(ctx);
    const list: Directive[] = Array.isArray(r.json?.directives) ? r.json.directives : [];
    for (const d of list) {
      const h = handleDirective(ctx, d);
      h.refreshWorkspaces.forEach(onRefresh);
      if (h.stored) n++;
    }
    const next = Number(r.json?.next_cursor);
    if (/^\d{1,15}$/.test(String(r.json?.next_cursor ?? ""))) advanceCursor(ctx, next);
    if (list.length < PAGE || cursor(ctx) <= from) return n;
  }
  return n;
}

/**
 * `align login`, before it tells sessions this machine is signed in again: the first directives page's `ended_sessions`
 * only (its directives wait for the next pass), so a session whose share its person stopped on the web while this
 * machine's earlier device held it is never told `::align share` shares it again (E2E-AGENT cycle 9 C9-1). Best effort:
 * the next pass reads the same list. Returns how many shares it ended.
 */
export async function pullEndedSessions(ctx: Ctx): Promise<number> {
  const r = await api(ctx, "GET", `/api/v2/directives?cursor=${cursor(ctx)}`);
  if (r.status !== 200) return 0;
  const n = Array.isArray(r.json?.ended_sessions) ? endSharesEndedOnServer(ctx, r.json.ended_sessions.filter(validEnded)) : 0;
  // `/me` follows, which words the signed-in-again notices too.
  endedRead(ctx);
  return n;
}

/** The first directives page of a pass was read: a sign-in whose `ended_sessions` `align login` could not read now tells
 *  its sessions it is signed in again, knowing which of them its person stopped on the web (cycle 10, section 5): their
 *  notices, held back until now, are worded from the state written here (C11-1). */
function endedRead(ctx: Ctx): void {
  if (!kvGet(ctx.db, ENDED_UNREAD)) return;
  ctx.db.prepare("DELETE FROM kv WHERE key=?").run(ENDED_UNREAD);
  renderEndedShares(ctx);
}
