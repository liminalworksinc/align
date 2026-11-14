import { randomBytes } from "node:crypto";
import { listAlignments } from "./alignments";
import { listAsks } from "./asks";
import { listChangeRequests } from "./changes";
import { all, onWsChange } from "./db";
import { V2Error } from "./errors";
import { goalsFeed, visibleGoals } from "./goals";
import { workspaceHome } from "./home";
import { webAuth } from "./http";
import { sha256hex } from "./ids";
import type { PolicyPrincipal } from "./policy";
import { listSessions } from "./sessions";
import { enter } from "./workspaces";

// The live workspace (LIM-2503): one Server-Sent Events stream per workspace and tab, GET
// /api/v2/workspaces/<ws>/stream, cookie only, for members and viewers (a non-member 404, like every read).
//
// What a stream says is computed from the reader's own reads, never from the write that caused it: after a write to the
// workspace (lib/v2/db.ts touchWs, at COMMIT), each open stream reads its reader's views again (the Home, the change
// requests, the goals feed, the sessions, the alignments, and presence below) and sends `change` with the names of the
// views that differ for that reader. So a stream carries no content of its own and tells a reader only what their own
// reads would show them a moment later: a change they can't read moves none of their views and sends nothing. Another
// workspace's writes never reach the stream at all (the listeners are per workspace).
//
// Resume: every event has an id that means nothing outside this reader's stream: a random token, never a counter, so
// no reader can count writes they can't see (audit M1, LIM-2503). The server keeps, per reader, which views it sent
// under each of their last few ids; a browser that reconnects sends its last one back as Last-Event-ID and is told the
// views that moved since, or `resync` (read everything again) when that id is unknown (a restart, or long ago).
// Keep-alive: a comment every 15 s (proxies drop idle connections). Every 30 s the stream checks the sign-in and
// membership again and reads the views again, so a missed write costs at most 30 s, and a person signed out or removed
// gets `gone` and the stream ends.
//
// Caps, so streams never crowd out ordinary requests on one machine (founder ruling 2026-11-11): STREAM_CAP per person
// per workspace, a workspace-wide cap and a total for the process (ALIGN_LIVE_STREAMS_PER_WORKSPACE, default 50;
// ALIGN_LIVE_STREAMS_TOTAL, default 200, well under fly.toml's hard limit of 300). One more is 429 too_many_streams,
// and that tab keeps today's reads (the page works without the stream).

export const STREAM_CAP = 4;
const KEEPALIVE_MS = 15_000;
const RECHECK_MS = 30_000;
const SETTLE_MS = 60;
/** Presence: a session counts as "now" when Align heard from it (shared, bound, usage, a receipt, activity) this recently. */
export const PRESENCE_WINDOW_MS = 15 * 60_000;
/** Ids remembered per reader for resume, and readers remembered (least recently used dropped first). */
const SENT_PER_READER = 16;
const SENT_READERS = 5000;
const envInt = (name: string, dflt: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : dflt;
};
export const streamsPerWorkspace = () => envInt("ALIGN_LIVE_STREAMS_PER_WORKSPACE", 50);
export const streamsTotal = () => envInt("ALIGN_LIVE_STREAMS_TOTAL", 200);
/** An event id: random, opaque, never derived from a counter. */
const newEventId = () => randomBytes(12).toString("base64url");

export const LIVE_VIEWS = ["home", "changes", "goals", "sessions", "alignments", "asks", "presence"] as const;
export type LiveView = (typeof LIVE_VIEWS)[number];

interface LiveState {
  subs: Map<string, Set<() => void>>;
  /** Open streams per `${user}\0${ws}`, per workspace, and in all. */
  conns: Map<string, number>;
  wsConns: Map<string, number>;
  total: number;
  /** Per reader (`${user}\0${ws}`): the views sent under each of their recent event ids. */
  sent: Map<string, Map<string, Record<LiveView, string>>>;
  unhook: () => void;
}
const gs = globalThis as unknown as { __alignLive?: LiveState };
function state(): LiveState {
  if (gs.__alignLive) return gs.__alignLive;
  const s: LiveState = { subs: new Map(), conns: new Map(), wsConns: new Map(), total: 0, sent: new Map(), unhook: () => undefined };
  s.unhook = onWsChange((ws) => {
    for (const f of s.subs.get(ws) ?? []) f();
  });
  gs.__alignLive = s;
  return s;
}

type Delivery = "sent" | "received" | "applied" | "enforced";
/** One of the reader's OWN sessions on a goal, in full: never its key or title; `id` is a stand-in for animation. */
export interface PresenceSession {
  id: string;
  /** working: shared, bound to this goal, not stopped, its goal not held. paused: its agent is stopped, its sharing is
   *  suspended, or its goal is held. */
  state: "working" | "paused";
  /** The newest directive Align sent it and how far it got: sent (no receipt yet), received, applied or enforced. */
  directive: { kind: string; at: string; delivery: Delivery } | null;
}
/** Presence on one goal: how many sessions are working toward it and paused (everyone's, as counts), and the reader's own
 *  sessions among them in full. Nothing about another person's session but that it counts. */
export interface GoalPresence {
  goal_id: string;
  working: number;
  paused: number;
  mine: PresenceSession[];
}

/** For each active goal the reader can read: the shared sessions bound to it now (their current epoch), heard from in
 *  the last PRESENCE_WINDOW_MS, from rows Align holds. Founder ruling 2026-11-11: members and owners see counts only for
 *  other people's sessions, and their own in full; viewers see no presence at all. */
export function presenceFor(pp: PolicyPrincipal, nowMs = Date.now()): GoalPresence[] {
  if (pp.wsRole !== "owner" && pp.wsRole !== "member") return [];
  const goals = visibleGoals(pp).filter((g) => g.status === "active");
  if (!goals.length) return [];
  const readable = new Set(goals.map((g) => g.id));
  const held = new Set(all<{ goal_id: string }>("SELECT goal_id FROM v2_goal_holds WHERE ws_id = ?", pp.wsId).map((h) => h.goal_id));
  const since = new Date(nowMs - PRESENCE_WINDOW_MS).toISOString();
  const rows = all<{ session_key: string; user_id: string; goal_id: string; state: string; agent_stopped: number; heard: string | null }>(
    `SELECT s.session_key, s.user_id, e.goal_id, s.state, s.agent_stopped,
       MAX(s.updated_at, e.starts_at,
           COALESCE((SELECT MAX(u.ts) FROM v2_usage u WHERE u.ws_id = s.ws_id AND u.session_key = s.session_key), ''),
           COALESCE((SELECT MAX(r.recorded_at) FROM v2_receipts r WHERE r.ws_id = s.ws_id AND r.session_key = s.session_key), ''),
           COALESCE((SELECT MAX(a.at) FROM v2_activity a WHERE a.ws_id = s.ws_id AND a.session_key = s.session_key), '')) AS heard
     FROM v2_sessions s
     JOIN v2_epochs e ON e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL
     WHERE s.ws_id = ? AND s.state <> 'stopped' AND e.goal_id IS NOT NULL
     ORDER BY s.started_at, s.session_key`,
    pp.wsId,
  );
  const latest = (key: string) => {
    const d = all<{ kind: string; created_at: string; delivery: string | null }>(
      `SELECT d.kind, d.created_at,
         (SELECT r.state FROM v2_receipts r WHERE r.ws_id = t.ws_id AND r.directive_id = d.id AND r.session_key = t.session_key
          ORDER BY CASE r.state WHEN 'enforced' THEN 3 WHEN 'applied' THEN 2 ELSE 1 END DESC LIMIT 1) AS delivery
       FROM v2_directive_targets t JOIN v2_directives d ON d.ws_id = t.ws_id AND d.id = t.directive_id
       WHERE t.ws_id = ? AND t.session_key = ? ORDER BY d.seq DESC LIMIT 1`,
      pp.wsId,
      key,
    )[0];
    return d ? { kind: d.kind, at: d.created_at, delivery: (d.delivery ?? "sent") as Delivery } : null;
  };
  const by = new Map<string, GoalPresence>();
  for (const r of rows) {
    if (!readable.has(r.goal_id) || !r.heard || r.heard < since) continue;
    const paused = !!r.agent_stopped || r.state === "suspended" || held.has(r.goal_id);
    const p = by.get(r.goal_id) ?? { goal_id: r.goal_id, working: 0, paused: 0, mine: [] };
    if (paused) p.paused++;
    else p.working++;
    if (r.user_id === pp.userId) p.mine.push({ id: sha256hex(`${pp.wsId}\0presence\0${r.session_key}`).slice(0, 12), state: paused ? "paused" : "working", directive: latest(r.session_key) });
    by.set(r.goal_id, p);
  }
  return goals.filter((g) => by.has(g.id)).map((g) => by.get(g.id)!);
}

/** The reader's views, each as a hash of what its read returns them. A view whose read fails hashes as "unread". */
function views(pp: PolicyPrincipal): { hashes: Record<LiveView, string>; presence: GoalPresence[] | null } {
  const h = (fn: () => unknown) => {
    try {
      return sha256hex(JSON.stringify(fn())).slice(0, 20);
    } catch {
      return "unread";
    }
  };
  let presence: GoalPresence[] | null = null;
  const hashes: Record<LiveView, string> = {
    home: h(() => workspaceHome(pp)),
    changes: h(() => listChangeRequests(pp)),
    goals: h(() => goalsFeed(pp).version),
    sessions: h(() => listSessions(pp)),
    alignments: h(() => listAlignments(pp)),
    asks: h(() => listAsks(pp)),
    presence: h(() => (presence = presenceFor(pp))),
  };
  return { hashes, presence };
}

const moved = (a: Record<LiveView, string>, b: Record<LiveView, string>) => LIVE_VIEWS.filter((v) => a[v] !== b[v]);

/** The stream route's body (app/api/v2/workspaces/[ws]/stream/route.ts). Authorization happens before any byte is sent,
 *  so a refusal is an ordinary { error, message } response. */
export async function openStream(req: Request, wsId: string): Promise<Response> {
  const s = state();
  const pp0 = enter(await webAuth(req), wsId);
  const who = `${pp0.userId}\0${wsId}`;
  if ((s.conns.get(who) ?? 0) >= STREAM_CAP)
    throw new V2Error(429, "too_many_streams", `You have ${STREAM_CAP} live views of this workspace open already. This one reads when you act or reload instead.`);
  if ((s.wsConns.get(wsId) ?? 0) >= streamsPerWorkspace())
    throw new V2Error(429, "too_many_streams", "This workspace has as many live views open as Align serves at once. This one reads when you act or reload instead.");
  if (s.total >= streamsTotal())
    throw new V2Error(429, "too_many_streams", "Align is busy and can't keep this view live right now. It reads when you act or reload instead.");
  s.conns.set(who, (s.conns.get(who) ?? 0) + 1);
  s.wsConns.set(wsId, (s.wsConns.get(wsId) ?? 0) + 1);
  s.total++;

  const enc = new TextEncoder();
  /** This reader's resume memory: their recent event ids and the views sent under each (most recent reader last). */
  const mem = () => {
    let m = s.sent.get(who);
    if (m) s.sent.delete(who);
    else m = new Map();
    s.sent.set(who, m);
    while (s.sent.size > SENT_READERS) s.sent.delete(s.sent.keys().next().value as string);
    return m;
  };
  const remember = (hashes: Record<LiveView, string>) => {
    const id = newEventId();
    const m = mem();
    m.set(id, hashes);
    while (m.size > SENT_PER_READER) m.delete(m.keys().next().value as string);
    return id;
  };
  const lastId = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("last_event_id");

  let closed = false;
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let last: Record<LiveView, string>;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let checking = false;
  let again = false;
  const timers: ReturnType<typeof setInterval>[] = [];
  const write = (text: string) => {
    if (closed) return;
    try {
      ctrl.enqueue(enc.encode(text));
    } catch {
      close();
    }
  };
  const send = (event: string, id: string | null, data: unknown) => write(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  function close() {
    if (closed) return;
    closed = true;
    if (settle) clearTimeout(settle);
    for (const t of timers) clearInterval(t);
    s.subs.get(wsId)?.delete(onWrite);
    const n = (s.conns.get(who) ?? 1) - 1;
    if (n > 0) s.conns.set(who, n);
    else s.conns.delete(who);
    const w = (s.wsConns.get(wsId) ?? 1) - 1;
    if (w > 0) s.wsConns.set(wsId, w);
    else s.wsConns.delete(wsId);
    s.total = Math.max(0, s.total - 1);
    try {
      ctrl.close();
    } catch {}
  }
  /** Sign-in and membership again, then the views; `change` for those that moved. */
  async function recheck() {
    if (closed) return;
    if (checking) {
      again = true;
      return;
    }
    checking = true;
    try {
      let pp: PolicyPrincipal;
      try {
        pp = enter(await webAuth(req), wsId);
      } catch (e) {
        send("gone", null, { status: e instanceof V2Error ? e.status : 401 });
        return close();
      }
      const now = views(pp);
      const changed = moved(last, now.hashes);
      if (changed.length) {
        last = now.hashes;
        send("change", remember(last), { views: changed, presence: now.presence });
      }
    } finally {
      checking = false;
      if (again && !closed) {
        again = false;
        void recheck();
      }
    }
  }
  function onWrite() {
    if (closed || settle) return;
    // Several writes in a burst (one action can write many rows in separate transactions) read once.
    settle = setTimeout(() => {
      settle = null;
      void recheck();
    }, SETTLE_MS);
  }

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const now = views(pp0);
      last = now.hashes;
      const before = lastId ? s.sent.get(who)?.get(lastId) : undefined;
      write("retry: 2000\n\n");
      // A fresh stream, or a resume: what moved since the id the browser last had, or everything when that id is unknown.
      send("hello", remember(last), { presence: now.presence, views: before ? moved(before, last) : [], resync: !!lastId && !before });
      if (!s.subs.has(wsId)) s.subs.set(wsId, new Set());
      s.subs.get(wsId)!.add(onWrite);
      timers.push(setInterval(() => write(": keep-alive\n\n"), KEEPALIVE_MS));
      timers.push(setInterval(() => void recheck(), RECHECK_MS));
      req.signal?.addEventListener("abort", close);
    },
    cancel() {
      close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform: no compression layer may buffer it; no-store: never cached.
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/** For tests and the operator: open streams per workspace. */
export function liveStats() {
  const s = state();
  return { streams: s.total, workspaces: [...s.wsConns.keys()].length };
}
