// Caller-owned Directives types and explicit resource bindings.
import { all, get, run, tx } from "./db";
import { V2Error, badRequest, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso } from "./ids";
import { goalCore, goalObj, bindableFor, goalRow, type GoalCore, type GoalRow } from "./goals";
import { canReadGoal } from "./policy";
import type { DevicePrincipal } from "./devices";
import { principalIn } from "./workspaces";
import { expireStoppedSessionTargets, holdWire, requestReceipt, requestWire, type HoldJson, type RequestJson } from "./requests";
import type { HoldWire, CancelReason, SenderRole } from "./requests";
import { create_directives } from "../native/.bindings/server_directives.js";

// Directives: what reaches local agents. Only structured content: ratified goal fields, enumerated states and
// Align's typed requests (lib/v2/requests.ts: a request's type, goal, sender and quoted note; a goal hold), never
// alignment notes or counters. Rows are written inside the transaction of the change that caused them (callers run
// these functions inside tx()); devices fetch them by cursor.
export type DirectiveKind = "goal_version" | "binding_changed" | "binding_suspended" | "stop" | "resume" | "request" | "hold" | "release";

export interface Binding {
    goal_id: string | null;
    effective: "next_root_turn";
    cause: string; // "alignment:<al_id>" | "goal_closed:<al_id>" (binding_suspended: the target was achieved or dropped) | "manual"
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

export type Directive = { hold?: HoldWire | null | undefined; request?: { id: string; type: "replan" | "checkpoint" | "switch_goal"; cancelled: boolean; cancel_reason: CancelReason | null; goal: { id: string; title: string | null; version: number; }; target_goal: { id: string; title: string | null; version: number | null; } | null; sender: { role: SenderRole; id: string; name: string; }; note: string | null; created_at: string; } | null | undefined; id: string; seq: number; ws: string; kind: DirectiveKind; session_keys: string[]; goal: (GoalCore & { bindable: boolean; }) | null; binding: Binding | null; created_at: string; };

export type ReceiptState = (typeof RECEIPT_STATES)[number];

type TargetState = NonNullable<ReturnType<typeof requestReceipt>>;
interface DirectivesRuntime {
  writeDirective: (ws: string, kind: DirectiveKind, sessionKeys: string[], goal: GoalCore | null, binding: Binding | null, extra?: DirectiveExtra) => string | null;
  goalTargets: (ws: string, goalId: string) => string[];
  goalVersionDirective: (ws: string, g: GoalRow) => string | null;
  goalSnapshot: (json: string) => GoalCore;
  directivesFor: (dev: DevicePrincipal, cursor: number, limit?: number) => Directive[];
  endedSessionsFor: (dev: DevicePrincipal, nowMs?: number) => { ws: string; session_key: string; ended_reason: string | null; stopped_at: string; }[];
  parseCursor: (v: string | null) => number;
  RECEIPT_STATES: readonly ["received", "applied", "enforced", "accepted", "declined"];
  recordReceipt: (dev: DevicePrincipal, directiveId: string, sessionKey: string, state: ReceiptState, at: string, autoAccepted?: boolean) => Promise<{ fresh: boolean; request_state?: undefined; } | { fresh: boolean; request_state: TargetState | null; }>;
  stopStatus: (ws: string, sessionKey: string) => { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null;
}
const directivesService = create_directives({
  all: (...args: Parameters<typeof all>) => all(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  V2Error,
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  goalCore: (...args: Parameters<typeof goalCore>) => goalCore(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  bindableFor: (...args: Parameters<typeof bindableFor>) => bindableFor(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  principalIn: (...args: Parameters<typeof principalIn>) => principalIn(...args),
  expireStoppedSessionTargets: (...args: Parameters<typeof expireStoppedSessionTargets>) => expireStoppedSessionTargets(...args),
  holdWire: (...args: Parameters<typeof holdWire>) => holdWire(...args),
  requestReceipt: (...args: Parameters<typeof requestReceipt>) => requestReceipt(...args),
  requestWire: (...args: Parameters<typeof requestWire>) => requestWire(...args),
  readDate: () => Date,
}) as unknown as DirectivesRuntime;

/** Write one directive and its targets. No targets, no directive. */
export function writeDirective(ws: string, kind: DirectiveKind, sessionKeys: string[], goal: GoalCore | null, binding: Binding | null, extra?: DirectiveExtra): string | null {
    return (0, directivesService.writeDirective)(ws, kind, sessionKeys, goal, binding, extra);
}
/** Sessions a goal change reaches: still shared (or suspended), and either bound to the goal by their current
 *  epoch or governed by it. */
export function goalTargets(ws: string, goalId: string): string[] {
    return (0, directivesService.goalTargets)(ws, goalId);
}
export function goalVersionDirective(ws: string, g: GoalRow): string | null {
    return (0, directivesService.goalVersionDirective)(ws, g);
}
/** A goal snapshot as the wire shows it now: snapshots stored before teams were called teams carry `pod` and
 *  visibility "pod" and no level, and those stored before limits existed carry no `limits` (read as none). The MCP
 *  server reads them the same way (lib/mcp/register.ts). A snapshot's limits are those of the saved version it
 *  carries: limit text reaches agents only that way. Snapshots stored before targets existed carry no `target_share`
 *  (read as null, no target). */
export function goalSnapshot(json: string): GoalCore {
    return (0, directivesService.goalSnapshot)(json);
}
/** Directives after `cursor` for this device's own sessions in its granted workspaces, oldest first. */
export function directivesFor(dev: DevicePrincipal, cursor: number, limit = 100): Directive[] {
    return (0, directivesService.directivesFor)(dev, cursor, limit);
}
/**
 * The device's person's sessions whose share has ended on the server in the last 30 days, in the workspaces this device
 * reaches now (newest first, at most 200): stopped on the web (Stop sharing) or by the device that shared it
 * (`ended_reason` null; another device can't stop a session it does not hold), ended because the person was removed from the workspace and is back (`member_removed`), or
 * ended when the device holding it signed out (`device_signed_out`). A stop or resume reaches a device as a directive,
 * but an end of sharing has none, and a device would otherwise hear of it only at the session's next usage upload
 * (refused `sharing_stopped`): listed in every directives answer, the device ends its own share at its next pass
 * (E2E-AGENT cycle 8). Every device of the person, not only the asking one: a machine that paired again (`align login`
 * after a logout, or replacing its live pairing) holds the sessions of its earlier device, whose stop on the web it
 * must still hear (E2E-AGENT cycle 9 C9-1). A device matches only the keys it can compute (its machine's secret), so
 * another machine's entries are inert there; the device's own stops are listed too, and it already knows them.
 */
export function endedSessionsFor(dev: DevicePrincipal, nowMs = Date.now()): { ws: string; session_key: string; ended_reason: string | null; stopped_at: string; }[] {
    return (0, directivesService.endedSessionsFor)(dev, nowMs);
}
export function parseCursor(v: string | null): number {
    return (0, directivesService.parseCursor)(v);
}
export const RECEIPT_STATES = directivesService.RECEIPT_STATES;
/** A delivery receipt (idempotent per directive, session, state and auto_accepted, so the developer's accept after the
 *  agent's own is recorded too): only for a directive that targets one of this user's sessions on this device.
 *  received, applied and enforced report delivery; accepted and declined answer a request directive (the developer's
 *  answer, or, with `autoAccepted`, the agent doing a safe request on its own) and move that session's request state
 *  (lib/v2/requests.ts requestReceipt), whose result is returned as `request_state`. */
export async function recordReceipt(dev: DevicePrincipal, directiveId: string, sessionKey: string, state: ReceiptState, at: string, autoAccepted = false): Promise<{ fresh: boolean; request_state?: undefined; } | { fresh: boolean; request_state: TargetState | null; }> {
    return (0, directivesService.recordReceipt)(dev, directiveId, sessionKey, state, at, autoAccepted);
}
/** For the sessions page: the latest stop/resume directive for a session and how far it got. */
export function stopStatus(ws: string, sessionKey: string): { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null {
    return (0, directivesService.stopStatus)(ws, sessionKey);
}
