import { all, get, run, tx } from "./db";
import { badRequest, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso } from "./ids";
import { goalCore, goalObj, bindableFor, goalRow, type GoalCore, type GoalRow } from "./goals";
import { canReadGoal } from "./policy";
import type { DevicePrincipal } from "./devices";
import { principalIn } from "./workspaces";
import { holdWire, requestReceipt, requestWire, type HoldJson, type RequestJson } from "./requests";

// Directives: what reaches local agents. Only structured content: ratified goal fields, enumerated states and
// Align's typed requests (lib/v2/requests.ts: a request's type, goal, sender and quoted note; a goal hold), never
// alignment notes or counters. Rows are written inside the transaction of the change that caused them (callers run
// these functions inside tx()); devices fetch them by cursor.

export type DirectiveKind = "goal_version" | "binding_changed" | "binding_suspended" | "stop" | "resume" | "request" | "hold" | "release";
export interface Binding {
  goal_id: string | null;
  effective: "next_root_turn";
  cause: string; // "alignment:<al_id>" | "manual"
}

interface DirectiveRow {
  seq: number;
  id: string;
  ws_id: string;
  kind: DirectiveKind;
  goal_id: string | null;
  goal_json: string | null;
  binding_json: string | null;
  request_json: string | null;
  hold_json: string | null;
  created_at: string;
}

/** What a request, hold or release directive carries besides its kind: the goal it is about (no snapshot) and the
 *  request reference or the hold's who, why and when. */
export interface DirectiveExtra {
  goalId: string;
  request?: RequestJson;
  hold?: HoldJson;
}

/** Write one directive and its targets. No targets, no directive. */
export function writeDirective(ws: string, kind: DirectiveKind, sessionKeys: string[], goal: GoalCore | null, binding: Binding | null, extra?: DirectiveExtra): string | null {
  const keys = [...new Set(sessionKeys)];
  if (!keys.length) return null;
  const id = newId("dir");
  run(
    "INSERT INTO v2_directives (id, ws_id, kind, goal_id, goal_json, binding_json, request_json, hold_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    ws,
    kind,
    goal?.id ?? extra?.goalId ?? null,
    goal ? JSON.stringify(goal) : null,
    binding ? JSON.stringify(binding) : null,
    extra?.request ? JSON.stringify(extra.request) : null,
    extra?.hold ? JSON.stringify(extra.hold) : null,
    nowIso(),
  );
  for (const k of keys) run("INSERT INTO v2_directive_targets (ws_id, directive_id, session_key) VALUES (?, ?, ?)", ws, id, k);
  // The workspace's first directive that reached a session (no actor: several actions write directives).
  event("first_directive", { ws, props: { kind } });
  return id;
}

/** Sessions a goal change reaches: still shared (or suspended), and either bound to the goal by their current
 *  epoch or governed by it. */
export function goalTargets(ws: string, goalId: string): string[] {
  return all<{ session_key: string }>(
    `SELECT s.session_key FROM v2_sessions s
     LEFT JOIN v2_epochs e ON e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL
     WHERE s.ws_id = ? AND s.state <> 'stopped' AND (e.goal_id = ? OR s.governing_goal_id = ?)
     ORDER BY s.session_key`,
    ws,
    goalId,
    goalId,
  ).map((r) => r.session_key);
}

export function goalVersionDirective(ws: string, g: GoalRow): string | null {
  return writeDirective(ws, "goal_version", goalTargets(ws, g.id), goalCore(g), null);
}

/** A goal snapshot as the wire shows it now: snapshots stored before teams were called teams carry `pod` and
 *  visibility "pod" and no level, and those stored before limits existed carry no `limits` (read as none). The MCP
 *  server reads them the same way (lib/mcp/register.ts). A snapshot's limits are those of the saved version it
 *  carries: limit text reaches agents only that way. */
export function goalSnapshot(json: string): GoalCore {
  const { pod, visibility, ...rest } = JSON.parse(json) as Omit<GoalCore, "visibility" | "limits"> & { pod?: { id: string; name: string } | null; visibility: string; limits?: GoalCore["limits"] };
  return {
    ...rest,
    team: rest.team ?? pod ?? null,
    level: rest.level ?? "team",
    visibility: (visibility === "pod" ? "team" : visibility) as GoalCore["visibility"],
    limits: rest.limits ?? [],
  };
}

function serialize(dev: DevicePrincipal, d: DirectiveRow, keys: string[]) {
  let goal: (GoalCore & { bindable: boolean }) | null = null;
  const pp = principalIn(dev, d.ws_id);
  if (d.goal_json) {
    // The goal as ratified when the directive was written; withheld if this user can no longer see it.
    const live = d.goal_id ? goalRow(d.ws_id, d.goal_id) : undefined;
    if (live && canReadGoal(pp, goalObj(live))) goal = { ...goalSnapshot(d.goal_json), bindable: bindableFor(pp, live) };
  }
  return {
    id: d.id,
    seq: d.seq,
    ws: d.ws_id,
    kind: d.kind,
    session_keys: keys,
    goal,
    binding: d.binding_json ? (JSON.parse(d.binding_json) as Binding) : null,
    created_at: d.created_at,
    // Only on the kinds that carry them, so the other kinds' shape is unchanged.
    ...(d.kind === "request" ? { request: d.request_json ? requestWire(pp, JSON.parse(d.request_json) as RequestJson) : null } : {}),
    ...(d.kind === "hold" || d.kind === "release" ? { hold: d.hold_json && d.goal_id ? holdWire(pp, d.kind, d.goal_id, JSON.parse(d.hold_json) as HoldJson) : null } : {}),
  };
}

export type Directive = ReturnType<typeof serialize>;

/** Directives after `cursor` for this device's own sessions in its granted workspaces, oldest first. */
export function directivesFor(dev: DevicePrincipal, cursor: number, limit = 100): Directive[] {
  const ws = [...dev.grants];
  if (!ws.length) return [];
  const rows = all<DirectiveRow & { keys: string }>(
    `SELECT d.seq, d.id, d.ws_id, d.kind, d.goal_id, d.goal_json, d.binding_json, d.request_json, d.hold_json, d.created_at, group_concat(t.session_key, ' ') AS keys
     FROM v2_directives d
     JOIN v2_directive_targets t ON t.directive_id = d.id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE s.device_id = ? AND s.user_id = ? AND d.seq > ? AND d.ws_id IN (${ws.map(() => "?").join(",")})
     GROUP BY d.seq ORDER BY d.seq LIMIT ?`,
    dev.deviceId,
    dev.user.id,
    cursor,
    ...ws,
    limit,
  );
  return rows.map((r) => serialize(dev, r, r.keys.split(" ").sort()));
}

export function parseCursor(v: string | null): number {
  if (v === null || v === "") return 0;
  if (!/^\d{1,15}$/.test(v)) throw badRequest("cursor must be a sequence number");
  return Number(v);
}

export const RECEIPT_STATES = ["received", "applied", "enforced", "accepted", "declined"] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

/** A delivery receipt (idempotent per directive, session, state and auto_accepted, so the developer's accept after the
 *  agent's own is recorded too): only for a directive that targets one of this user's sessions on this device.
 *  received, applied and enforced report delivery; accepted and declined answer a request directive (the developer's
 *  answer, or, with `autoAccepted`, the agent doing a safe request on its own) and move that session's request state
 *  (lib/v2/requests.ts requestReceipt), whose result is returned as `request_state`. */
export async function recordReceipt(dev: DevicePrincipal, directiveId: string, sessionKey: string, state: ReceiptState, at: string, autoAccepted = false) {
  const t = get<{ ws_id: string; kind: DirectiveKind; request_json: string | null }>(
    `SELECT t.ws_id, d.kind, d.request_json FROM v2_directive_targets t
     JOIN v2_directives d ON d.id = t.directive_id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.directive_id = ? AND t.session_key = ? AND s.user_id = ? AND s.device_id = ?`,
    directiveId,
    sessionKey,
    dev.user.id,
    dev.deviceId,
  );
  if (!t || !dev.grants.has(t.ws_id)) throw notFound();
  const answer = state === "accepted" || state === "declined";
  if (answer && t.kind !== "request") throw badRequest("accepted and declined answer a request directive");
  if (autoAccepted && state !== "accepted") throw badRequest("auto_accepted goes only with state accepted");
  const request = t.kind === "request" && t.request_json ? (JSON.parse(t.request_json) as RequestJson) : null;
  return tx(() => {
    const n = run(
      "INSERT OR IGNORE INTO v2_receipts (ws_id, directive_id, session_key, state, at, recorded_at, auto_accepted) VALUES (?, ?, ?, ?, ?, ?, ?)",
      t.ws_id,
      directiveId,
      sessionKey,
      state,
      at,
      nowIso(),
      autoAccepted ? 1 : 0,
    );
    if (!request) return { fresh: n > 0 };
    return { fresh: n > 0, request_state: requestReceipt(t.ws_id, request.request_id, sessionKey, state, autoAccepted, dev.user.id) };
  });
}

/** For the sessions page: the latest stop/resume directive for a session and how far it got. */
export function stopStatus(ws: string, sessionKey: string) {
  const d = get<{ id: string; kind: DirectiveKind; created_at: string }>(
    `SELECT d.id, d.kind, d.created_at FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
     WHERE t.ws_id = ? AND t.session_key = ? AND d.kind IN ('stop','resume') ORDER BY d.seq DESC LIMIT 1`,
    ws,
    sessionKey,
  );
  if (!d) return null;
  const receipts = all<{ state: ReceiptState; at: string }>("SELECT state, at FROM v2_receipts WHERE directive_id = ? AND session_key = ? ORDER BY at", d.id, sessionKey);
  return { directive_id: d.id, kind: d.kind, created_at: d.created_at, receipts };
}
