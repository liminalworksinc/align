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
  /** Why it was revoked, as v2_devices.revoked_reason (the refresh refusal's `reason`); revoked_on_web when unset. */
  revokedReason?: string;
  createdAt?: string;
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
  cancel_reason: "withdrawn" | "goal_closed" | null;
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
  log: { method: string; path: string; status: number; auth: boolean; origin: boolean; device?: string }[] = [];
  /** `replaces` of each token poll that created a device (null when the poll named none). */
  replacesSeen: (string | null)[] = [];
  /** Each self-revoke, with the device it named as its replacement (`replaced_by`, null when none). */
  revokesSeen: { device: string; replaced_by: string | null }[] = [];
  /** Hold matching calls (before the server looks at them) until `release` settles; `left` of them, when set (C4). */
  holdCalls: { match: (method: string, path: string) => boolean; release: Promise<void>; left?: number; drop?: boolean } | null = null;
  /** Answer matching calls 503 without processing them (a proxy in front of a failing route, C4-3). */
  failCalls: ((method: string, path: string) => boolean) | null = null;
  /** Refuse every session DELETE with 404 not_found (history this device may not delete, C4-1). */
  refuseDeletes = false;
  user = { id: "u_sean", name: "Sean", email: "sean@example.test" };
  workspaces = [{ id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] }];
  /** The person's workspaces this device was not given (`/me`'s `other_workspaces`). */
  otherWorkspaces: { id: string; name: string }[] = [];
  goals = new Map<string, Goal[]>();
  /** Workspace steering switch, as the goals feed reports it. */
  steering = new Map<string, "on" | "off">();
  /** POST /steering events as accepted. */
  steeringEvents: any[] = [];
  pending = new Map<string, Pending>();
  devices = new Map<string, Device>();
  access = new Map<string, { device: string; exp: number }>();
  /** `ended`: why a stopped session ended when its person did not stop it (as `v2_sessions.ended_reason`). */
  sessions = new Map<string, { ws: string; device: string; body: any; state: string; ended?: "member_removed" | "device_signed_out" | null; stopped_at?: string }>();
  /** As the server: the directives answer lists the person's ended sessions, of every device of theirs (`ended_sessions`,
   *  cycles 8 and 9; a one-person fake: every session). Off to see a device that hears of an end only at its next usage
   *  upload (an older server). */
  reportEnded = true;
  /** DELETE …/sessions/{key} that went through, and the device that sent each (audited with the acting device). */
  deletedBy: { key: string; device: string }[] = [];
  /** POST /activity items as received, plus items other people's machines "sent" (addRemoteActivity). */
  activity: any[] = [];
  activitySeq = 0;
  epochs = new Map<string, any>();
  /** AskView per workspace, as `GET /api/v2/workspaces/:ws/asks` returns them (the reader's `can` flags included). */
  asks = new Map<string, (Ask & { can: Record<string, boolean> })[]>();
  usage = new Map<string, any>();
  /** The answer to `GET …/allocation` (one week); unset: no shared agent time, every active goal with its target. */
  allocationWeek: unknown = null;
  /** Session keys whose history was deleted (on the web or by a device): a later DELETE gets 410 history_deleted. */
  deletedKeys = new Set<string>();

  /** As lib/v2/lifecycle.ts: the session's person was removed from its workspace (its share ends, `member_removed`)
   *  and let back in, all while this device did not look (`/me` lists the workspace throughout). */
  removeAndReAdd(key: string): void {
    const s = this.sessions.get(key)!;
    s.state = "stopped";
    s.ended = "member_removed";
    s.stopped_at = new Date().toISOString();
    for (const e of this.epochs.values()) if (e.session_key === key && !e.ends_at) e.ends_at = new Date().toISOString();
  }

  /** The person stops sharing the session on the web. */
  stopOnWeb(key: string): void {
    const s = this.sessions.get(key)!;
    s.state = "stopped";
    s.ended = null;
    s.stopped_at = new Date().toISOString();
    for (const e of this.epochs.values()) if (e.session_key === key && !e.ends_at) e.ends_at = new Date().toISOString();
  }

  /** The person deletes a session's shared history on the web. */
  deleteOnWeb(key: string): void {
    this.sessions.delete(key);
    this.deletedKeys.add(key);
    for (const [k, e] of this.epochs) if (e.session_key === key) this.epochs.delete(k);
    for (const [k, u] of this.usage) if (u.session_key === key) this.usage.delete(k);
  }
  directives: FakeDirective[] = [];
  receipts: { id: string; session_key: string; state: string; at: string; auto_accepted?: boolean }[] = [];
  requests = new Map<string, FakeRequest>();
  /** Goal holds by `${ws}/${goal}` (`v2_goal_holds`). */
  holds = new Map<string, { held_by: { id: string; name: string }; reason: string | null; at: string; directive_id: string }>();
  refreshes = 0;
  /** Refreshes refused as clock_skew. */
  skewRefusals = 0;
  /** Session and epoch times refused as clock_skew (more than 5 min ahead of this server's clock). */
  timeRefusals = 0;
  /** Every poll of /device/token answers access_denied (the person denied the pairing in the browser). */
  denyLogins = false;
  /** Hold every /device/refresh, before it is processed ("request") or after the server rotated ("answer"), until
   *  `release` settles: a refresh in flight while something else runs (C3-1). */
  holdRefresh: { phase: "request" | "answer"; release: Promise<void> } | null = null;
  /** POST /device/authorize answers 429 rate_limited: `retryAfter` seconds (Retry-After), with the server's message
   *  when `message` is set (an older server sent none). */
  authorizeLimited: { retryAfter: number; message?: string } | null = null;
  /** The next n polls of /device/token answer 502 (a server restarting behind a proxy). */
  failTokenPolls = 0;
  /** Answer without a Date header, so a device can learn its clock offset only from a clock_skew answer. */
  noDate = false;
  /** Refuse every epoch as clock_skew, whatever time it carries (a clock the device can't correct). */
  skewEpochs = false;
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
    return crypto.createHash("sha256").update(JSON.stringify({ g: this.goals.get(ws) || [], s: this.steering.get(ws) || "off" })).digest("hex").slice(0, 12);
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
      cancel_reason: null,
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

  /** DELETE …/requests/{id} (`withdrawn`), or its goal achieved or dropped (`goal_closed`): a `request` directive with
   *  `cancelled: true` to the targets still sent/received; they expire. */
  cancelRequest(id: string, reason: "withdrawn" | "goal_closed" = "withdrawn"): FakeDirective | null {
    const req = this.requests.get(id)!;
    const open = [...req.targets].filter(([, t]) => t.state === "sent" || t.state === "received").map(([k]) => k);
    for (const k of open) req.targets.get(k)!.state = "expired";
    if (!open.length) return null;
    return this.pushDirective({ ws: req.ws, kind: "request", session_keys: open, goal: null, binding: null, request: { ...req.wire, cancelled: true, cancel_reason: reason } });
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

  /** As lib/v2/devices.ts when a device is revoked on the Devices page: it is refused from then on, and its live sessions
   *  end (`device_signed_out`) with their open request targets expired. */
  revokeOnWeb(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (!d) return;
    d.revoked = true;
    d.revokedReason = "revoked_on_web";
    const at = new Date().toISOString();
    for (const [k, s] of this.sessions) {
      if (s.device !== deviceId || s.state === "stopped") continue;
      Object.assign(s, { state: "stopped", ended: "device_signed_out", stopped_at: at });
      for (const e of this.epochs.values()) if (e.session_key === k && !e.ends_at) e.ends_at = at;
      for (const r of this.requests.values()) {
        const t = r.targets.get(k);
        if (t && (t.state === "sent" || t.state === "received")) t.state = "expired";
      }
    }
  }

  revokeAll(): void {
    for (const d of this.devices.values()) d.revoked = true;
    for (const s of this.streams) s.res.destroy();
  }

  sessionHits(): number {
    return this.log.filter((l) => l.path.includes("/sessions/")).length;
  }

  private send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
    if (this.noDate) res.sendDate = false;
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
    const held = this.holdCalls;
    if (held && held.match(entry.method, p) && (held.left === undefined || held.left-- > 0)) {
      await held.release;
      // `drop`: the held call never gets an answer (its connection goes, as a call held past its timeout does).
      if (held.drop) return void req.socket.destroy();
    }
    if (this.failCalls?.(entry.method, p)) return send(503, { error: "unavailable" });
    if (req.headers.origin) return send(403, { error: "origin_forbidden" });
    try {
      const body = req.method === "GET" || req.method === "DELETE" ? null : await this.body(req);
      // ---- device flow ----
      if (req.method === "POST" && p === "/api/v2/device/authorize" && this.authorizeLimited) {
        const lim = this.authorizeLimited;
        return send(429, { error: "rate_limited", ...(lim.message ? { message: lim.message, retry_after: lim.retryAfter } : {}) }, { "retry-after": String(lim.retryAfter) });
      }
      if (req.method === "POST" && p === "/api/v2/device/authorize") {
        // As lib/v2/validate.ts oneLine: a character with more than 6 combining marks is refused (cycle 9).
        if (String(body.device_name).normalize("NFD").match(/\p{M}{7,}/u)) return send(400, { error: "bad_request", message: "device_name has a character with too many accents or marks on it (at most 6 on one character)" });
        const pend: Pending = { device_code: b64u(crypto.randomBytes(33)), user_code: "BCDF-GHJK", name: body.device_name, publicKey: body.public_key, polls: 0, issued: false, denied: false };
        if (Buffer.from(String(body.public_key), "base64url").length !== 32) return send(400, { error: "invalid_public_key" });
        this.pending.set(pend.device_code, pend);
        return send(200, { device_code: pend.device_code, user_code: pend.user_code, verification_uri: `${this.url}/app/device`, expires_in: 600, interval: 1 });
      }
      if (req.method === "POST" && p === "/api/v2/device/token") {
        if (this.failTokenPolls > 0) {
          this.failTokenPolls--;
          return send(502, { error: "bad_gateway" });
        }
        const pend = this.pending.get(body?.device_code);
        if (!pend || pend.issued) return send(400, { error: "expired_token" });
        if (this.denyLogins) return send(400, { error: "access_denied" });
        pend.polls++;
        if (pend.polls === 1 && this.opts.slowDownFirst) return send(400, { error: "slow_down" });
        if (pend.polls < this.opts.approveAfterPolls) return send(400, { error: "authorization_pending" });
        pend.issued = true;
        // As lib/v2/devices.ts: a name none of the person's live devices has ("Test Mac (2)" next to a live "Test Mac").
        // The device this pairing replaces (`replaces`) does not count: a re-login keeps its name.
        this.replacesSeen.push(body?.replaces ?? null);
        const taken = new Set([...this.devices.values()].filter((x) => !x.revoked && x.id !== body?.replaces).map((x) => x.name));
        let name = pend.name;
        for (let n = 2; taken.has(name); n++) name = `${pend.name} (${n})`;
        const d: Device = { id: rid("dv_"), name, publicKey: pend.publicKey, revoked: false, refresh: null, oldRefresh: new Set(), createdAt: new Date().toISOString() };
        this.devices.set(d.id, d);
        return send(200, { device_id: d.id, ...this.issue(d), user: this.user });
      }
      if (req.method === "POST" && p === "/api/v2/device/refresh") {
        const hold = this.holdRefresh;
        if (hold?.phase === "request") await hold.release;
        const answer = (status: number, b: unknown) => (hold?.phase === "answer" ? hold.release.then(() => send(status, b)) : send(status, b));
        const d = this.devices.get(body?.device_id);
        // As lib/v2/devices.ts: an unknown device (its account was deleted) and a revoked one say why.
        if (!d) return answer(401, { error: "invalid_grant", reason: "unknown_device" });
        if (d.revoked) return answer(401, { error: "invalid_grant", reason: d.revokedReason || "revoked_on_web" });
        if (d.oldRefresh.has(body.refresh_token)) {
          d.revoked = true;
          return answer(401, { error: "invalid_grant" });
        }
        if (body.refresh_token !== d.refresh) return answer(401, { error: "invalid_grant" });
        if (Number.isNaN(Date.parse(body.ts))) return answer(401, { error: "invalid_grant" });
        const msg = `align-refresh\n${d.id}\n${crypto.createHash("sha256").update(body.refresh_token).digest("hex")}\n${body.ts}`;
        const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: d.publicKey }, format: "jwk" });
        if (!crypto.verify(null, Buffer.from(msg), key, Buffer.from(String(body.sig), "base64url"))) return answer(401, { error: "invalid_grant" });
        // As lib/v2/devices.ts: a signed refresh from a skewed clock is 400 clock_skew with the server's time, not a revocation.
        if (Math.abs(Date.parse(body.ts) - Date.now()) > 5 * 60_000) {
          this.skewRefusals++;
          return answer(400, { error: "clock_skew", message: "This device's clock is off", server_time: new Date().toISOString() });
        }
        this.refreshes++;
        return answer(200, this.issue(d));
      }
      // ---- authenticated device routes ----
      const dev = this.auth(req);
      if (!dev) return send(401, { error: "unauthorized" });
      entry.device = dev.id;
      if (req.method === "DELETE" && p === "/api/v2/devices/self") {
        dev.revoked = true;
        dev.revokedReason = "logout";
        // As lib/v2/devices.ts passNameOn: the device that replaced it on this machine takes its name when it got
        // "<name> (n)" only because this one was live.
        const next = this.devices.get(url.searchParams.get("replaced_by") ?? "");
        const m = next && !next.revoked ? /^(.*) \((\d+)\)$/.exec(next.name) : null;
        if (next && m && m[1] === dev.name && ![...this.devices.values()].some((x) => !x.revoked && x.name === dev.name)) next.name = dev.name;
        this.revokesSeen.push({ device: dev.id, replaced_by: url.searchParams.get("replaced_by") });
        return send(204);
      }
      if (req.method === "GET" && p === "/api/v2/me") return send(200, { user: this.user, device: { id: dev.id, name: dev.name }, workspaces: this.workspaces, other_workspaces: this.otherWorkspaces });
      if (req.method === "GET" && p === "/api/v2/devices") {
        const list = [...this.devices.values()].map((d) => ({ id: d.id, name: d.name, created_at: d.createdAt ?? new Date(0).toISOString(), last_seen_at: d.createdAt ?? null, revoked_at: d.revoked ? new Date().toISOString() : null, revoked_reason: d.revoked ? d.revokedReason || "revoked_on_web" : null, workspaces: [], current: d.id === dev.id }));
        return send(200, { devices: list });
      }
      let m = /^\/api\/v2\/workspaces\/([^/]+)\/goals$/.exec(p);
      if (m && req.method === "GET") {
        const v = this.feedVersion(m[1]);
        if (req.headers["if-none-match"] === `"${v}"`) return send(304, undefined, { etag: `"${v}"` });
        return send(200, { version: v, goals: this.goals.get(m[1]) || [], steering: this.steering.get(m[1]) || "off" }, { etag: `"${v}"` });
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
        // As the server: a workspace this device's person is no longer a member of is out of reach.
        if (!this.workspaces.some((w) => w.id === ws)) return send(404, { error: "not_found" });
        const sess = this.sessions.get(key);
        const ahead = (t: unknown) => Date.parse(String(t)) > Date.now() + 5 * 60_000;
        const skewed = () => {
          this.timeRefusals++;
          return send(400, { error: "clock_skew", message: "the time is ahead of the server's clock", server_time: new Date().toISOString() });
        };
        // As lib/v2/sessions.ts: a session whose device signed out (was revoked) is shared again by the same person's new
        // pairing; any other device's session is not this one's.
        // A session its person stopped sharing (not one its device's revoke ended) stays stopped: 409 sharing_stopped to
        // any of their devices (C4-8). Its history may be deleted by any of their live devices (C4-1).
        const reshare = !sub && req.method === "PUT" && !!sess && sess.device !== dev.id && sess.state !== "stopped" && !!this.devices.get(sess.device)?.revoked;
        // A session that ended when its person was removed is shared again by any device of theirs once they are back (as
        // lib/v2/sessions.ts: a new pairing after a re-invite too).
        const back = !!sess && !sub && req.method === "PUT" && sess.state === "stopped" && sess.ended === "member_removed";
        if (sess && !sub && req.method === "PUT" && sess.state === "stopped" && !back) return send(409, { error: "sharing_stopped" });
        const deleting = !sub && req.method === "DELETE";
        if (sess && sess.device !== dev.id && !reshare && !back && !deleting) return send(404, { error: "not_found" });
        if (!sub && req.method === "PUT") {
          if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !/^[A-Za-z0-9_-]{43}$/.test(body.repo_key)) return send(400, { error: "bad_key" });
          if (ahead(body.started_at)) return skewed();
          const state = sess?.state === "suspended" ? "suspended" : "shared";
          // A re-PUT never changes started_at.
          this.sessions.set(key, { ws, device: dev.id, body: sess ? { ...body, started_at: sess.body.started_at } : body, state });
          const open = [...this.epochs.values()].find((e) => e.session_key === key && !e.ends_at) || null;
          return send(200, { session_key: key, state, current_epoch: open });
        }
        // As lib/v2/sessions.ts: history deleted already (on the web, say) -> 410 history_deleted to its own account.
        if (!sess && !sub && req.method === "DELETE" && this.deletedKeys.has(key)) return send(410, { error: "history_deleted" });
        if (!sess) return send(404, { error: "not_found" });
        if (!sub && req.method === "DELETE") {
          if (this.refuseDeletes) return send(404, { error: "not_found" });
          this.sessions.delete(key);
          this.deletedKeys.add(key);
          this.deletedBy.push({ key, device: dev.id });
          // As the server: the session's activity goes with it.
          this.activity = this.activity.filter((i) => i.session_key !== key);
          for (const [k, e] of this.epochs) if (e.session_key === key) this.epochs.delete(k);
          for (const [k, u] of this.usage) if (u.session_key === key) this.usage.delete(k);
          return send(204);
        }
        if (sub === "stop-sharing") {
          sess.state = "stopped";
          sess.ended = null;
          sess.stopped_at = new Date().toISOString();
          return send(200, { session_key: key, state: "stopped" });
        }
        if (sub === "epochs") {
          if (this.epochs.has(body.epoch_id)) return send(200, this.epochs.get(body.epoch_id));
          if (this.skewEpochs) {
            this.timeRefusals++;
            return send(400, { error: "clock_skew", message: "starts_at is 10 minutes ahead of the server's clock; this device's clock is off", server_time: new Date().toISOString() });
          }
          if (ahead(body.starts_at)) return skewed();
          // A start stored in the future came from a clock that ran ahead: the epoch moves it back.
          if (Date.parse(sess.body.started_at) > Date.now() && body.starts_at < sess.body.started_at) sess.body.started_at = body.starts_at;
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
          if (sess.state !== "shared") return send(409, sess.state === "stopped" ? { error: "sharing_stopped", ended_reason: sess.ended ?? null } : { error: "suspended" });
          const rows = Array.isArray(body?.rows) ? body.rows : [];
          if (rows.length > 500) return send(413, { error: "too_many_rows" });
          let accepted = 0;
          let duplicates = 0;
          let conflicts = 0;
          const refused: string[] = [];
          // As lib/v2/sessions.ts: a row from after its epoch ended, at a time no epoch of the session covers, was made
          // while the session was not shared: a conflict, never stored, named in `refused` like an unknown epoch's.
          const covered = (t: number) => [...this.epochs.values()].some((x) => x.session_key === key && Date.parse(x.starts_at) <= t && (!x.ends_at || t < Date.parse(x.ends_at)));
          for (const r of rows) {
            const e = this.epochs.get(r.epoch_id);
            if (!e || e.session_key !== key || (e.ends_at && Date.parse(r.ts) >= Date.parse(e.ends_at) && !covered(Date.parse(r.ts)))) {
              conflicts++;
              refused.push(r.request_key);
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
          return send(200, { accepted, duplicates, conflicts, refused });
        }
      }
      if (req.method === "GET" && p === "/api/v2/directives") {
        const cursor = Number(url.searchParams.get("cursor") || 0);
        const list = this.directives.filter((d) => d.seq > cursor && this.ownsAny(dev.id, d.session_keys)).slice(0, 100);
        // As the server: the workspaces this device reaches now (a single-device fake: the person's workspaces).
        const reach = new Set(this.workspaces.map((w) => w.id));
        const ended = this.reportEnded
          ? [...this.sessions].filter(([, x]) => x.state === "stopped" && x.stopped_at && reach.has(x.ws)).map(([k, x]) => ({ ws: x.ws, session_key: k, ended_reason: x.ended ?? null, stopped_at: x.stopped_at }))
          : undefined;
        return send(200, { directives: list, next_cursor: String(list.length ? list[list.length - 1].seq : cursor), workspaces: [...reach].sort(), ...(ended ? { ended_sessions: ended } : {}) });
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
      m = /^\/api\/v2\/workspaces\/([^/]+)\/steering$/.exec(p);
      if (m && req.method === "POST") {
        const events = Array.isArray(body?.events) ? body.events : [];
        let accepted = 0;
        // As lib/v2/steering.ts: what isn't taken is listed in `refused` (C3-4).
        const refused: { index: number; reason: string }[] = [];
        for (const [index, e] of events.entries()) {
          if (Date.parse(e.at) > Date.now() + 5 * 60_000) {
            refused.push({ index, reason: "clock_skew" });
            continue;
          }
          const sess = this.sessions.get(e.session_key);
          if (!sess || sess.device !== dev.id) {
            refused.push({ index, reason: "not_shared" });
            continue;
          }
          this.steeringEvents.push({ ...e, ws: m[1] });
          accepted++;
        }
        return send(200, { accepted, refused, server_time: new Date().toISOString() });
      }
      m = /^\/api\/v2\/workspaces\/([^/]+)\/activity$/.exec(p);
      if (m && req.method === "POST") {
        const items = Array.isArray(body?.items) ? body.items : [];
        let accepted = 0;
        // As lib/v2/activity.ts: what isn't taken is listed in `refused` (C3-4).
        const refused: { index: number; reason: string }[] = [];
        for (const [index, it] of items.entries()) {
          if (Date.parse(it.at) > Date.now() + 5 * 60_000) {
            refused.push({ index, reason: "clock_skew" });
            continue;
          }
          const sess = this.sessions.get(it.session_key);
          if (!sess || sess.device !== dev.id) {
            refused.push({ index, reason: "not_shared" });
            continue;
          }
          this.activity.push({ ...it, seq: ++this.activitySeq, ws: m[1], harness: sess.body.harness, user: { id: this.user.id, name: this.user.name }, mine: true, goal_id: sess.body.goal_id ?? "g_ship", expires_at: new Date(Date.parse(it.at) + 86_400_000).toISOString() });
          accepted++;
        }
        return send(200, { accepted, refused, server_time: new Date().toISOString() });
      }
      if (m && req.method === "GET") {
        const after = Number(url.searchParams.get("after") || 0);
        const items = this.activity.filter((i) => i.ws === m![1] && i.seq > after);
        return send(200, { cursor: items.length ? items[items.length - 1].seq : after, items });
      }
      // A week of the workspace's allocation (lib/v2/allocation.ts), as `allocationWeek` sets it: no shared time by default.
      m = /^\/api\/v2\/workspaces\/([^/]+)\/allocation$/.exec(p);
      if (m && req.method === "GET") {
        const rows = (this.goals.get(m[1]) || []).map((g) => ({ kind: "goal", goal: { id: g.id, title: g.title }, share: 0, target_share: g.allocation?.target_share ?? null, gap: null }));
        return send(200, this.allocationWeek ?? { window: { total_fresh_tokens: 0, rows }, steering: { steering: this.steering.get(m[1]) || "off", total: 0 } });
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
