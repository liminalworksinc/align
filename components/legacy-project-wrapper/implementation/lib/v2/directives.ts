import { all, get, run, tx } from "./db";
import { badRequest, notFound } from "./errors";
import { newId, nowIso } from "./ids";
import { goalCore, goalObj, bindableFor, goalRow, type GoalCore, type GoalRow } from "./goals";
import { canReadGoal } from "./policy";
import type { DevicePrincipal } from "./devices";
import { principalIn } from "./workspaces";

// Directives: what reaches local agents. Only structured content: ratified goal fields and enumerated states,
// never alignment notes or counters. Rows are written inside the transaction of the change that caused them
// (callers run these functions inside tx()); devices fetch them by cursor.

export type DirectiveKind = "goal_version" | "binding_changed" | "binding_suspended" | "stop" | "resume";
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
  created_at: string;
}

/** Write one directive and its targets. No targets, no directive. */
export function writeDirective(ws: string, kind: DirectiveKind, sessionKeys: string[], goal: GoalCore | null, binding: Binding | null): string | null {
  const keys = [...new Set(sessionKeys)];
  if (!keys.length) return null;
  const id = newId("dir");
  run(
    "INSERT INTO v2_directives (id, ws_id, kind, goal_id, goal_json, binding_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    ws,
    kind,
    goal?.id ?? null,
    goal ? JSON.stringify(goal) : null,
    binding ? JSON.stringify(binding) : null,
    nowIso(),
  );
  for (const k of keys) run("INSERT INTO v2_directive_targets (ws_id, directive_id, session_key) VALUES (?, ?, ?)", ws, id, k);
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
 *  visibility "pod" and no level. */
function snapshot(json: string): GoalCore {
  const { pod, visibility, ...rest } = JSON.parse(json) as Omit<GoalCore, "visibility"> & { pod?: { id: string; name: string } | null; visibility: string };
  return { ...rest, team: rest.team ?? pod ?? null, level: rest.level ?? "team", visibility: (visibility === "pod" ? "team" : visibility) as GoalCore["visibility"] };
}

function serialize(dev: DevicePrincipal, d: DirectiveRow, keys: string[]) {
  let goal: (GoalCore & { bindable: boolean }) | null = null;
  if (d.goal_json) {
    // The goal as ratified when the directive was written; withheld if this user can no longer see it.
    const pp = principalIn(dev, d.ws_id);
    const live = d.goal_id ? goalRow(d.ws_id, d.goal_id) : undefined;
    if (live && canReadGoal(pp, goalObj(live))) goal = { ...snapshot(d.goal_json), bindable: bindableFor(pp, live) };
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
  };
}

export type Directive = ReturnType<typeof serialize>;

/** Directives after `cursor` for this device's own sessions in its granted workspaces, oldest first. */
export function directivesFor(dev: DevicePrincipal, cursor: number, limit = 100): Directive[] {
  const ws = [...dev.grants];
  if (!ws.length) return [];
  const rows = all<DirectiveRow & { keys: string }>(
    `SELECT d.seq, d.id, d.ws_id, d.kind, d.goal_id, d.goal_json, d.binding_json, d.created_at, group_concat(t.session_key, ' ') AS keys
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

export const RECEIPT_STATES = ["received", "applied", "enforced"] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

/** Three-state delivery receipt (idempotent): only for a directive that targets one of this user's sessions on
 *  this device. */
export async function recordReceipt(dev: DevicePrincipal, directiveId: string, sessionKey: string, state: ReceiptState, at: string) {
  const t = get<{ ws_id: string }>(
    `SELECT t.ws_id FROM v2_directive_targets t JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.directive_id = ? AND t.session_key = ? AND s.user_id = ? AND s.device_id = ?`,
    directiveId,
    sessionKey,
    dev.user.id,
    dev.deviceId,
  );
  if (!t || !dev.grants.has(t.ws_id)) throw notFound();
  const n = await tx(() =>
    run("INSERT OR IGNORE INTO v2_receipts (ws_id, directive_id, session_key, state, at, recorded_at) VALUES (?, ?, ?, ?, ?, ?)", t.ws_id, directiveId, sessionKey, state, at, nowIso()),
  );
  return { fresh: n > 0 };
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
