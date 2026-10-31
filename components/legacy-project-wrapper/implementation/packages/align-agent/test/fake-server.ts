// In-memory fake of the hosted server, implementing docs/v2/WIRE.md closely enough to exercise the agent end to end:
// device flow (with slow_down), key-bound rotating refresh (signature + reuse revocation), /me, goal feed with ETag,
// session/epoch/usage idempotency (and epoch_overlap: an epoch may not start before the session, the open epoch or the
// last closed one), stop-sharing, delete, directives (poll + SSE with Last-Event-ID) and receipts, goal limits (PORT-002)
// and the asks feed with ETag (PORT-003's `GET /asks`), requests and goal holds (REQ-001's directive wire: `request`,
// `hold` and `release` directives; `accepted`/`declined` receipts with `auto_accepted`).
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Ask, Goal } from "../src/shared/types.ts";

interface Device {
  id: string;
  name: string;
  publicKey: string;
  revoked: boolean;
  refresh: string | null;
  oldRefresh: Set<string>;
}

interface Pending {
  device_code: string;
  user_code: string;
  name: string;
  publicKey: string;
  polls: number;
  issued: boolean;
  denied: boolean;
}

export interface FakeDirective {
  id: string;
  seq: number;
  ws: string;
  kind: string;
  session_keys: string[];
  goal: Goal | null;
  binding: { goal_id: string | null; effective: string; cause: string } | null;
  request?: FakeRequestWire;
  hold?: Record<string, unknown>;
  created_at: string;
}

/** `request` of a `kind: "request"` directive, as REQ-001 specifies it. */
export interface FakeRequestWire {
  id: string;
  type: "replan" | "checkpoint" | "switch_goal";
  cancelled: boolean;
  goal: { id: string; title: string; version: number };
  target_goal: { id: string; title: string; version: number } | null;
  sender: { id: string; name: string; role: "approver" | "owner" };
  note: string | null;
  created_at: string;
}

/** A request and its per-session target states (`v2_request_targets`). */
export interface FakeRequest {
  wire: FakeRequestWire;
  ws: string;
  directive_id: string;
  targets: Map<string, { state: "sent" | "received" | "accepted" | "declined" | "expired"; auto_accepted: boolean }>;
}

export interface FakeOptions {
  accessTtl?: number;
  slowDownFirst?: boolean;
  approveAfterPolls?: number;
}

const b64u = (b: Buffer) => b.toString("base64url");
const rid = (p: string) => p + b64u(crypto.randomBytes(16));

export class FakeServer {
  /** Activity from another person's machine, as the real server would return it. */
  addRemoteActivity(ws: string, it: Record<string, unknown>) {
    const at = (it.at as string) || new Date().toISOString();
    const row = { harness: "codex", mine: false, goal_id: "g_ship", path_hash: null, path: null, text: null, ...it, at, ws, seq: ++this.activitySeq, expires_at: (it.expires_at as string) || new Date(Date.parse(at) + 86_400_000).toISOString() };
    this.activity.push(row);
    return row;
  }

  url = "";
  server: http.Server;
  opts: Required<FakeOptions>;
  offline = false;
  log: { method: string; path: string; status: number; auth: boolean; origin: boolean }[] = [];
  user = { id: "u_sean", name: "Sean", email: "sean@example.test" };
  workspaces = [{ id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] }];
  goals = new Map<string, Goal[]>();
  pending = new Map<string, Pending>();
  devices = new Map<string, Device>();
  access = new Map<string, { device: string; exp: number }>();
  sessions = new Map<string, { ws: string; device: string; body: any; state: string }>();
  /** POST /activity items as received, plus items other people's machines "sent" (addRemoteActivity). */
  activity: any[] = [];
  activitySeq = 0;
  epochs = new Map<string, any>();
  /** AskView per workspace, as `GET /api/v2/workspaces/:ws/asks` returns them (the reader's `can` flags included). */
  asks = new Map<string, (Ask & { can: Record<string, boolean> })[]>();
  usage = new Map<string, any>();
  directives: FakeDirective[] = [];
  receipts: { id: string; session_key: string; state: string; at: string; auto_accepted?: boolean }[] = [];
  requests = new Map<string, FakeRequest>();
  /** Goal holds by `${ws}/${goal}` (`v2_goal_holds`). */
  holds = new Map<string, { held_by: { id: string; name: string }; reason: string | null; at: string; directive_id: string }>();
  refreshes = 0;
  private streams = new Set<{ res: http.ServerResponse; device: string }>();
  private seq = 0;

  constructor(opts: FakeOptions = {}) {
    this.opts = { accessTtl: 3600, slowDownFirst: true, approveAfterPolls: 2, ...opts };
    this.goals.set("ws_acme", [
      this.goal("g_ship", "Ship the v2 onboarding flow", 1, true),
      this.goal("g_perf", "Cut hook latency", 1, true),
      this.goal("g_theirs", "Someone else's private plan", 1, false),
    ]);
    this.server = http.createServer((req, res) => void this.handle(req, res));
  }

  goal(id: string, title: string, version: number, bindable: boolean): Goal {
    return {
      id,
      version,
      title,
      measures: [{ id: `${id}_m1`, text: `${title} measured`, target: null }],
      status: "active",
      visibility: "workspace",
      level: "team",
      owner: { id: "u_sean", name: "Sean" },
      team: null,
      anchors: { repos: [], branch_patterns: [], issues: [] },
      bindable,
    };
  }

  async start(): Promise<void> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    for (const s of this.streams) s.res.destroy();
    this.server.closeAllConnections();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  setOffline(v: boolean): void {
    this.offline = v;
    if (v) for (const s of this.streams) s.res.destroy();
  }

  feedVersion(ws: string): string {
    return crypto.createHash("sha256").update(JSON.stringify(this.goals.get(ws) || [])).digest("hex").slice(0, 12);
  }

  asksVersion(ws: string): string {
    return crypto.createHash("sha256").update(JSON.stringify(this.asks.get(ws) || [])).digest("hex").slice(0, 12);
  }

  /** Record an ask as the real server would show it to this reader. */
  addAsk(ws: string, a: Partial<Ask> & { id: string; text: string }): Ask {
    const now = new Date().toISOString();
    const full = {
      state: "open" as Ask["state"],
      team: { id: "pod_core", name: "Core" },
      goal: null,
      from_label: null,
      requester: { id: "u_dana", name: "Dana Lee" },
      source: { kind: "meeting" as const, title: "Board sync", date: now.slice(0, 10) },
      mentions: [],
      decided_by: null,
      decided_at: null,
      created_at: now,
      updated_at: now,
      waiting_on_me: false,
      can: { accept: false, decline: false, done: false, reopen: false, withdraw: false, mention: true },
      ...a,
    };
    this.asks.set(ws, [...(this.asks.get(ws) || []), full]);
    return full;
  }

  setAsk(ws: string, id: string, patch: Partial<Ask>): void {
    const a = (this.asks.get(ws) || []).find((x) => x.id === id);
    if (a) Object.assign(a, patch, { updated_at: new Date().toISOString() });
  }

  bumpGoal(ws: string, id: string, patch: Partial<Goal> = {}): Goal {
    const list = this.goals.get(ws) || [];
    const g = list.find((x) => x.id === id) as Goal;
    Object.assign(g, patch, { version: g.version + 1 });
    return g;
  }

  pushDirective(d: Omit<FakeDirective, "id" | "seq" | "created_at">): FakeDirective {
    const full: FakeDirective = { ...d, id: rid("dir_"), seq: ++this.seq, created_at: new Date().toISOString() };
    this.directives.push(full);
    for (const s of this.streams) {
      if (this.ownsAny(s.device, full.session_keys)) s.res.write(`id: ${full.seq}\nevent: directive\ndata: ${JSON.stringify(full)}\n\n`);
    }
    return full;
  }

  private goalRef(ws: string, id: string): { id: string; title: string; version: number } {
    const g = (this.goals.get(ws) || []).find((x) => x.id === id)!;
    return { id: g.id, title: g.title, version: g.version };
  }

  /** POST …/goals/{goal}/requests: one `request` directive to the target sessions. */
  sendRequest(
    ws: string,
    o: { type: FakeRequestWire["type"]; goal_id: string; session_keys: string[]; target_goal_id?: string; note?: string | null; sender?: FakeRequestWire["sender"] },
  ): FakeRequest {
    const wire: FakeRequestWire = {
      id: `rq_${Array.from(crypto.randomBytes(24), (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("")}`,
      type: o.type,
      cancelled: false,
      goal: this.goalRef(ws, o.goal_id),
      target_goal: o.target_goal_id ? this.goalRef(ws, o.target_goal_id) : null,
      sender: o.sender || { id: "u_dana", name: "Dana Lee", role: "approver" },
      note: o.note ?? null,
      created_at: new Date().toISOString(),
    };
    const d = this.pushDirective({ ws, kind: "request", session_keys: o.session_keys, goal: null, binding: null, request: wire });
    const req: FakeRequest = { wire, ws, directive_id: d.id, targets: new Map(o.session_keys.map((k) => [k, { state: "sent" as const, auto_accepted: false }])) };
    this.requests.set(wire.id, req);
    return req;
  }

  /** DELETE …/requests/{id}: a `request` directive with `cancelled: true` to the targets still sent/received; they expire. */
  cancelRequest(id: string): FakeDirective | null {
    const req = this.requests.get(id)!;
    const open = [...req.targets].filter(([, t]) => t.state === "sent" || t.state === "received").map(([k]) => k);
    for (const k of open) req.targets.get(k)!.state = "expired";
    if (!open.length) return null;
    return this.pushDirective({ ws: req.ws, kind: "request", session_keys: open, goal: null, binding: null, request: { ...req.wire, cancelled: true } });
  }

  /** PUT …/goals/{goal}/hold: idempotent; a `hold` directive to every session on the goal. */
  holdGoal(ws: string, goalId: string, session_keys: string[], reason: string | null = null, by = { id: "u_dana", name: "Dana Lee" }): FakeDirective | null {
    if (this.holds.has(`${ws}/${goalId}`)) return null;
    const g = this.goalRef(ws, goalId);
    const at = new Date().toISOString();
    const d = this.pushDirective({ ws, kind: "hold", session_keys, goal: null, binding: null, hold: { goal: { id: g.id, title: g.title }, held_by: by, reason, at } });
    this.holds.set(`${ws}/${goalId}`, { held_by: by, reason, at, directive_id: d.id });
    return d;
  }

  /** DELETE …/goals/{goal}/hold: a `release` directive. */
  releaseGoal(ws: string, goalId: string, session_keys: string[], by = { id: "u_dana", name: "Dana Lee" }): FakeDirective {
    this.holds.delete(`${ws}/${goalId}`);
    const g = this.goalRef(ws, goalId);
    return this.pushDirective({ ws, kind: "release", session_keys, goal: null, binding: null, hold: { goal: { id: g.id, title: g.title }, released_by: by, at: new Date().toISOString() } });
  }

  private ownsAny(device: string, keys: string[]): boolean {
    return keys.some((k) => this.sessions.get(k)?.device === device);
  }

  revokeAll(): void {
    for (const d of this.devices.values()) d.revoked = true;
    for (const s of this.streams) s.res.destroy();
  }

  sessionHits(): number {
    return this.log.filter((l) => l.path.includes("/sessions/")).length;
  }

  private send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers });
    res.end(body !== undefined ? JSON.stringify(body) : undefined);
  }

  private async body(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : null;
  }

  private auth(req: http.IncomingMessage): Device | null {
    const m = /^Bearer (alnd_\S+)$/.exec(String(req.headers.authorization || ""));
    if (!m) return null;
    const a = this.access.get(m[1]);
    if (!a || a.exp < Date.now()) return null;
    const d = this.devices.get(a.device);
    return d && !d.revoked ? d : null;
  }

  private issue(d: Device): { access_token: string; expires_in: number; refresh_token: string } {
    const access = rid("alnd_");
    this.access.set(access, { device: d.id, exp: Date.now() + this.opts.accessTtl * 1000 });
    if (d.refresh) d.oldRefresh.add(d.refresh);
    d.refresh = rid("alnr_");
    return { access_token: access, expires_in: this.opts.accessTtl, refresh_token: d.refresh };
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", "http://x");
    const p = url.pathname;
    const entry = { method: req.method || "", path: p, status: 0, auth: !!req.headers.authorization, origin: !!req.headers.origin };
    this.log.push(entry);
    const send = (status: number, body?: unknown, headers?: Record<string, string>) => {
      entry.status = status;
      this.send(res, status, body, headers);
    };
    if (this.offline) {
      entry.status = 503;
      res.destroy();
      return;
    }
    if (req.headers.origin) return send(403, { error: "origin_forbidden" });
    try {
      const body = req.method === "GET" || req.method === "DELETE" ? null : await this.body(req);
      // ---- device flow ----
      if (req.method === "POST" && p === "/api/v2/device/authorize") {
        const pend: Pending = { device_code: b64u(crypto.randomBytes(33)), user_code: "BCDF-GHJK", name: body.device_name, publicKey: body.public_key, polls: 0, issued: false, denied: false };
        if (Buffer.from(String(body.public_key), "base64url").length !== 32) return send(400, { error: "invalid_public_key" });
        this.pending.set(pend.device_code, pend);
        return send(200, { device_code: pend.device_code, user_code: pend.user_code, verification_uri: `${this.url}/app/device`, expires_in: 600, interval: 1 });
      }
      if (req.method === "POST" && p === "/api/v2/device/token") {
        const pend = this.pending.get(body?.device_code);
        if (!pend || pend.issued) return send(400, { error: "expired_token" });
        pend.polls++;
        if (pend.polls === 1 && this.opts.slowDownFirst) return send(400, { error: "slow_down" });
        if (pend.polls < this.opts.approveAfterPolls) return send(400, { error: "authorization_pending" });
        pend.issued = true;
        const d: Device = { id: rid("dv_"), name: pend.name, publicKey: pend.publicKey, revoked: false, refresh: null, oldRefresh: new Set() };
        this.devices.set(d.id, d);
        return send(200, { device_id: d.id, ...this.issue(d), user: this.user });
      }
      if (req.method === "POST" && p === "/api/v2/device/refresh") {
        const d = this.devices.get(body?.device_id);
        if (!d || d.revoked) return send(401, { error: "invalid_grant" });
        if (d.oldRefresh.has(body.refresh_token)) {
          d.revoked = true;
          return send(401, { error: "invalid_grant" });
        }
        if (body.refresh_token !== d.refresh) return send(401, { error: "invalid_grant" });
        if (Math.abs(Date.parse(body.ts) - Date.now()) > 5 * 60_000) return send(401, { error: "invalid_grant" });
        const msg = `align-refresh\n${d.id}\n${crypto.createHash("sha256").update(body.refresh_token).digest("hex")}\n${body.ts}`;
        const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: d.publicKey }, format: "jwk" });
        if (!crypto.verify(null, Buffer.from(msg), key, Buffer.from(String(body.sig), "base64url"))) return send(401, { error: "invalid_grant" });
        this.refreshes++;
        return send(200, this.issue(d));
      }
      // ---- authenticated device routes ----
      const dev = this.auth(req);
      if (!dev) return send(401, { error: "unauthorized" });
      if (req.method === "DELETE" && p === "/api/v2/devices/self") {
        dev.revoked = true;
        return send(204);
      }
      if (req.method === "GET" && p === "/api/v2/me") return send(200, { user: this.user, device: { id: dev.id, name: dev.name }, workspaces: this.workspaces });
      let m = /^\/api\/v2\/workspaces\/([^/]+)\/goals$/.exec(p);
      if (m && req.method === "GET") {
        const v = this.feedVersion(m[1]);
        if (req.headers["if-none-match"] === `"${v}"`) return send(304, undefined, { etag: `"${v}"` });
        return send(200, { version: v, goals: this.goals.get(m[1]) || [] }, { etag: `"${v}"` });
      }
      m = /^\/api\/v2\/workspaces\/([^/]+)\/asks$/.exec(p);
      if (m && req.method === "GET") {
        const v = this.asksVersion(m[1]);
        if (req.headers["if-none-match"] === `"${v}"`) return send(304, undefined, { etag: `"${v}"` });
        const state = url.searchParams.get("state");
        const team = url.searchParams.get("team_id");
        const list = (this.asks.get(m[1]) || []).filter((a) => (!state || a.state === state) && (!team || a.team.id === team));
        return send(200, { version: v, asks: list }, { etag: `"${v}"` });
      }
      m = /^\/api\/v2\/workspaces\/([^/]+)\/sessions\/([^/]+)(\/(epochs|usage|stop-sharing))?$/.exec(p);
      if (m) {
        const [, ws, key, , sub] = m;
        const sess = this.sessions.get(key);
        if (sess && sess.device !== dev.id) return send(404, { error: "not_found" });
        if (!sub && req.method === "PUT") {
          if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !/^[A-Za-z0-9_-]{43}$/.test(body.repo_key)) return send(400, { error: "bad_key" });
          const state = sess?.state === "suspended" ? "suspended" : "shared";
          // A re-PUT never changes started_at.
          this.sessions.set(key, { ws, device: dev.id, body: sess ? { ...body, started_at: sess.body.started_at } : body, state });
          const open = [...this.epochs.values()].find((e) => e.session_key === key && !e.ends_at) || null;
          return send(200, { session_key: key, state, current_epoch: open });
        }
        if (!sess) return send(404, { error: "not_found" });
        if (!sub && req.method === "DELETE") {
          this.sessions.delete(key);
          for (const [k, e] of this.epochs) if (e.session_key === key) this.epochs.delete(k);
          for (const [k, u] of this.usage) if (u.session_key === key) this.usage.delete(k);
          return send(204);
        }
        if (sub === "stop-sharing") {
          sess.state = "stopped";
          return send(200, { session_key: key, state: "stopped" });
        }
        if (sub === "epochs") {
          if (this.epochs.has(body.epoch_id)) return send(200, this.epochs.get(body.epoch_id));
          // As the server: "manual", or a directive that was sent to this session.
          const cause = String(body.cause || "");
          if (cause !== "manual" && !(cause.startsWith("directive:") && this.directives.some((d) => d.id === cause.slice(10) && d.session_keys.includes(key)))) {
            return send(400, { error: "bad_request", message: "cause names a directive that was not sent to this session" });
          }
          const goal = body.goal_id ? (this.goals.get(ws) || []).find((g) => g.id === body.goal_id) : null;
          if (body.goal_id && (!goal || !goal.bindable)) return send(403, { error: "alignment_required" });
          // No backdating: not before the session's start, the open epoch's start, or the last epoch's end.
          const mine = [...this.epochs.values()].filter((e) => e.session_key === key);
          const floor = [sess.body.started_at, ...mine.map((e) => e.ends_at || e.starts_at)].filter(Boolean).sort().pop();
          if (floor && body.starts_at < floor) return send(409, { error: "epoch_overlap" });
          for (const e of this.epochs.values()) if (e.session_key === key && !e.ends_at) e.ends_at = body.starts_at;
          const epoch = { epoch_id: body.epoch_id, goal_id: body.goal_id, goal_version_at_start: goal ? goal.version : null, starts_at: body.starts_at, ends_at: null, root_turn: body.root_turn, cause: body.cause, session_key: key };
          this.epochs.set(body.epoch_id, epoch);
          if (sess.state === "suspended") sess.state = "shared";
          const { session_key: _k, root_turn: _r, cause: _c, ...wire } = epoch;
          return send(200, wire);
        }
        if (sub === "usage") {
          if (sess.state !== "shared") return send(409, { error: sess.state === "stopped" ? "sharing_stopped" : "suspended" });
          const rows = Array.isArray(body?.rows) ? body.rows : [];
          if (rows.length > 500) return send(413, { error: "too_many_rows" });
          let accepted = 0;
          let duplicates = 0;
          let conflicts = 0;
          for (const r of rows) {
            const e = this.epochs.get(r.epoch_id);
            if (!e || e.session_key !== key) {
              conflicts++;
              continue;
            }
            const prev = this.usage.get(r.request_key);
            if (prev) {
              const { session_key: _s, ...prevRow } = prev;
              if (JSON.stringify(prevRow) === JSON.stringify(r)) duplicates++;
              else conflicts++;
              continue;
            }
            this.usage.set(r.request_key, { ...r, session_key: key });
            accepted++;
          }
          return send(200, { accepted, duplicates, conflicts });
        }
      }
      if (req.method === "GET" && p === "/api/v2/directives") {
        const cursor = Number(url.searchParams.get("cursor") || 0);
        const list = this.directives.filter((d) => d.seq > cursor && this.ownsAny(dev.id, d.session_keys)).slice(0, 100);
        return send(200, { directives: list, next_cursor: String(list.length ? list[list.length - 1].seq : cursor) });
      }
      if (req.method === "GET" && p === "/api/v2/directives/stream") {
        entry.status = 200;
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const last = Number(req.headers["last-event-id"] || 0);
        for (const d of this.directives) if (d.seq > last && this.ownsAny(dev.id, d.session_keys)) res.write(`id: ${d.seq}\nevent: directive\ndata: ${JSON.stringify(d)}\n\n`);
        res.write(": connected\n\n");
        const s = { res, device: dev.id };
        this.streams.add(s);
        const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 15_000);
        res.on("close", () => {
          clearInterval(ping);
          this.streams.delete(s);
        });
        return;
      }
      m = /^\/api\/v2\/workspaces\/([^/]+)\/activity$/.exec(p);
      if (m && req.method === "POST") {
        const items = Array.isArray(body?.items) ? body.items : [];
        let accepted = 0;
        for (const it of items) {
          const sess = this.sessions.get(it.session_key);
          if (!sess || sess.device !== dev.id) continue;
          this.activity.push({ ...it, seq: ++this.activitySeq, ws: m[1], harness: sess.body.harness, user: { id: this.user.id, name: this.user.name }, mine: true, goal_id: sess.body.goal_id ?? "g_ship", expires_at: new Date(Date.parse(it.at) + 86_400_000).toISOString() });
          accepted++;
        }
        return send(200, { accepted });
      }
      if (m && req.method === "GET") {
        const after = Number(url.searchParams.get("after") || 0);
        const items = this.activity.filter((i) => i.ws === m![1] && i.seq > after);
        return send(200, { cursor: items.length ? items[items.length - 1].seq : after, items });
      }
      m = /^\/api\/v2\/directives\/([^/]+)\/receipts$/.exec(p);
      if (m && req.method === "POST") {
        const d = this.directives.find((x) => x.id === m![1]);
        if (!d || !d.session_keys.includes(body.session_key) || this.sessions.get(body.session_key)?.device !== dev.id) return send(404, { error: "not_found" });
        const states = d.kind === "request" ? ["received", "accepted", "declined"] : ["received", "applied", "enforced"];
        if (!states.includes(body.state)) return send(400, { error: "bad_request", message: "state" });
        const auto = body.auto_accepted === true;
        if (body.auto_accepted !== undefined && (typeof body.auto_accepted !== "boolean" || body.state !== "accepted")) return send(400, { error: "bad_request", message: "auto_accepted" });
        const req = d.kind === "request" && d.request && !d.request.cancelled ? this.requests.get(d.request.id) : null;
        if (auto && req?.wire.type === "switch_goal") return send(400, { error: "bad_request", message: "a switch_goal is never auto-accepted" });
        const fresh = !this.receipts.some((r) => r.id === d.id && r.session_key === body.session_key && r.state === body.state && !!r.auto_accepted === auto);
        if (fresh) this.receipts.push({ id: d.id, session_key: body.session_key, state: body.state, at: body.at, ...(auto ? { auto_accepted: true } : {}) });
        const t = req?.targets.get(body.session_key);
        if (t && t.state !== "expired") {
          // A later decline overrides an auto-accept; nothing moves an answered target back to received.
          if (body.state === "received" && t.state === "sent") t.state = "received";
          else if (body.state === "accepted" && (t.state === "sent" || t.state === "received")) Object.assign(t, { state: "accepted", auto_accepted: auto });
          // The developer agreeing to a replan the agent drafted: accepted by the developer from then on.
          else if (body.state === "accepted" && !auto && t.state === "accepted" && t.auto_accepted) t.auto_accepted = false;
          else if (body.state === "declined" && (t.state !== "accepted" || t.auto_accepted)) Object.assign(t, { state: "declined", auto_accepted: false });
        }
        return send(200, { fresh, ...(t ? { request_state: t.state } : {}) });
      }
      return send(404, { error: "not_found" });
    } catch (e) {
      return send(500, { error: "fake_error", message: (e as Error).message });
    }
  }
}
