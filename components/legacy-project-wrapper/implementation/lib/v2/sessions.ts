// Caller-owned Sessions types and explicit resource bindings.
import { caps } from "./config";
import { sessionCapError } from "./creation";
import { all, audit, get, run, tx } from "./db";
import { takeDurable } from "./limits";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { event } from "./events";
import { nowIso, sha256hex } from "./ids";
import { goalObj, goalRow, transferFor } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { stopStatus, writeDirective } from "./directives";
import type { DevicePrincipal } from "./devices";
import type { Principal } from "./http";
import { need } from "./workspaces";
import { expireStoppedSessionTargets, holdNewlyBound } from "./requests";
import { personName } from "./retention";
import { shareAgainText, shareAgainWords, sharingStoppedText } from "./share-again.mts";
import { b64url, iso, nonNegInt, oneOf, optInt, optStr, str, type Body } from "./validate";
import { create_sessions } from "../native/.bindings/server_sessions.js";

// Shared sessions, binding epochs and usage. docs/v2/WIRE.md "Shared sessions".
// A session belongs to the device (and user) that shared it: any other caller gets 404 for its key, except that any
// live device of that user may delete its history (deleteSession).
// Audit rows for session actions name the actor but not the session key, so deleting a session's history leaves no
// row that mentions it.
export interface SessionRow {
    ws_id: string;
    session_key: string;
    user_id: string;
    device_id: string | null;
    harness: "claude-code" | "codex";
    repo_key: string;
    repo_alias: string | null;
    title: string | null;
    started_at: string;
    state: "shared" | "suspended" | "stopped";
    stopped_at: string | null;
    /** Why a stopped session ended when its person did not stop it: its device signed out (lib/v2/devices.ts), or its
     *  person was removed from the workspace or left it (lib/v2/lifecycle.ts). Nothing can reach it any more. */
    ended_reason: EndedReason | null;
    governing_goal_id: string | null;
    governing_alignment_id: string | null;
    agent_stopped: number;
    conflicts: number;
    created_at: string;
    updated_at: string;
}

interface EpochRow {
    ws_id: string;
    session_key: string;
    epoch_id: string;
    goal_id: string | null;
    goal_version_at_start: number | null;
    starts_at: string;
    ends_at: string | null;
    root_turn: string | null;
    cause: string;
    authority: "none" | "own" | "pod" | "alignment";
    alignment_id: string | null;
}

export type EndedReason = "device_signed_out" | "member_removed";

type UsageRow = Record<(typeof USAGE_FIELDS)[number] | "request_key", string | number | null>;

type DirectiveKind = NonNullable<ReturnType<typeof stopStatus>>["kind"];
type ReceiptState = NonNullable<ReturnType<typeof stopStatus>>["receipts"][number]["state"];

interface SessionsRuntime {
  endSessions: (live: { ws_id: string; session_key: string; }[], reason: EndedReason, at: string) => number;
  sessionRow: (ws: string, key: string) => SessionRow | undefined;
  openEpoch: (ws: string, key: string) => EpochRow | undefined;
  ownSession: (pp: PolicyPrincipal, p: Principal, key: string) => SessionRow;
  putSession: (pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) => Promise<{ session_key: string; state: "shared" | "suspended" | "stopped"; current_epoch: { epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; } | null; }>;
  openBindingEpoch: (pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) => Promise<{ epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; }>;
  USAGE_FIELDS: readonly ["epoch_id", "ts", "model", "query_source", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "basis", "est_list_usd_micros", "price_table_version", "source"];
  ingestUsage: (pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) => Promise<{ accepted: number; duplicates: number; conflicts: number; refused: string[]; }>;
  stopSharing: (pp: PolicyPrincipal, p: Principal, key: string) => Promise<{ session_key: string; state: "stopped"; }>;
  deleteSession: (pp: PolicyPrincipal, p: Principal, key: string) => Promise<void>;
  setAgentStop: (pp: PolicyPrincipal, key: string, stop: boolean) => Promise<{ directive_id: string | null; agent_stopped: boolean; }>;
  listSessions: (pp: PolicyPrincipal) => { mine: { session_key: string; harness: "claude-code" | "codex"; repo_alias: string | null; title: string | null; started_at: string; state: "shared" | "suspended" | "stopped"; stopped_at: string | null; ended_reason: EndedReason | null; device: { id: string; name: string; signed_out: boolean; has_workspace: boolean; } | null; current_epoch: { goal: { id: string; title: string; version: number; private?: undefined; } | { id: null; title: null; private: boolean; version?: undefined; } | null; epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; } | null; governing_goal: { id: string; title: string; version: number; private?: undefined; } | { id: null; title: null; private: boolean; version?: undefined; } | null; agent_stopped: boolean; stop_status: { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null; conflicts: number; usage: { requests: number; input: number; output: number; } | undefined; }[]; all: { session_key: string; owner: { id: string; name: string; }; repo_alias: string | null; harness: "claude-code" | "codex"; started_at: string; state: "shared" | "suspended" | "stopped"; agent_stopped: boolean; stop_status: { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null; }[] | null; };
}
const sessionsService = create_sessions({
  caps: (...args: Parameters<typeof caps>) => caps(...args),
  sessionCapError: (...args: Parameters<typeof sessionCapError>) => sessionCapError(...args),
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  takeDurable: (...args: Parameters<typeof takeDurable>) => takeDurable(...args),
  V2Error,
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  sha256hex: (...args: Parameters<typeof sha256hex>) => sha256hex(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  transferFor: (...args: Parameters<typeof transferFor>) => transferFor(...args),
  authorize: (...args: Parameters<typeof authorize>) => authorize(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  stopStatus: (...args: Parameters<typeof stopStatus>) => stopStatus(...args),
  writeDirective: (...args: Parameters<typeof writeDirective>) => writeDirective(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  expireStoppedSessionTargets: (...args: Parameters<typeof expireStoppedSessionTargets>) => expireStoppedSessionTargets(...args),
  holdNewlyBound: (...args: Parameters<typeof holdNewlyBound>) => holdNewlyBound(...args),
  personName: (...args: Parameters<typeof personName>) => personName(...args),
  shareAgainText: (...args: Parameters<typeof shareAgainText>) => shareAgainText(...args),
  shareAgainWords: (...args: Parameters<typeof shareAgainWords>) => shareAgainWords(...args),
  sharingStoppedText: (...args: Parameters<typeof sharingStoppedText>) => sharingStoppedText(...args),
  b64url: (...args: Parameters<typeof b64url>) => b64url(...args),
  iso: (...args: Parameters<typeof iso>) => iso(...args),
  nonNegInt: (...args: Parameters<typeof nonNegInt>) => nonNegInt(...args),
  oneOf: (...args: Parameters<typeof oneOf>) => oneOf(...args),
  optInt: (...args: Parameters<typeof optInt>) => optInt(...args),
  optStr: (...args: Parameters<typeof optStr>) => optStr(...args),
  str: (...args: Parameters<typeof str>) => str(...args),
  readDate: () => Date,
}) as unknown as SessionsRuntime;

/**
 * End sessions nothing can deliver a stop, a resume or a release to any more (inside the caller's tx()): each one still
 * shared (or suspended) is stopped as stop-sharing would stop it (open epoch closed, no governing goal), marked with
 * why, and the requests still waiting on it expire, each target marked with the same reason (a request no device can
 * answer never stays open, and it says its sessions ended rather than that its goal closed). Its history
 * stays. A goal hold already set on the machine stays until the developer runs `align stop-sharing`; a stop stays
 * until a resume from here reaches it, once the session is shared again (`align stop-sharing` never lifts it: LIM-2441).
 * Used when a device is revoked (lib/v2/devices.ts) and when a member leaves or is removed (lib/v2/lifecycle.ts).
 * Returns how many ended.
 */
export function endSessions(live: {
    ws_id: string;
    session_key: string;
}[], reason: EndedReason, at: string): number {
    return (0, sessionsService.endSessions)(live, reason, at);
}
export const sessionRow = (ws: string, key: string): SessionRow | undefined => (0, sessionsService.sessionRow)(ws, key);
export const openEpoch = (ws: string, key: string): EpochRow | undefined => (0, sessionsService.openEpoch)(ws, key);
/** The session if this caller owns it (the device that shared it, or its user on the web), else 404. */
export function ownSession(pp: PolicyPrincipal, p: Principal, key: string): SessionRow {
    return (0, sessionsService.ownSession)(pp, p, key);
}
export async function putSession(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body): Promise<{ session_key: string; state: "shared" | "suspended" | "stopped"; current_epoch: { epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; } | null; }> {
    return (0, sessionsService.putSession)(pp, dev, key, b);
}
export async function openBindingEpoch(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body): Promise<{ epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; }> {
    return (0, sessionsService.openBindingEpoch)(pp, dev, key, b);
}
export const USAGE_FIELDS = sessionsService.USAGE_FIELDS;
/** Idempotent usage batch: INSERT OR IGNORE on (ws, session_key, request_key). The same key with different values is
 *  a conflict and never overwrites; a row whose epoch is unknown or another session's is a conflict too. */
export async function ingestUsage(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body): Promise<{ accepted: number; duplicates: number; conflicts: number; refused: string[]; }> {
    return (0, sessionsService.ingestUsage)(pp, dev, key, b);
}
/** Stop sharing (future only): no more uploads; the open epoch ends now. History stays until deleted. It is its person's
 *  stop also for a session that had ended (`member_removed`, `device_signed_out`): the reason goes, so it is never
 *  shared again and its refusals say `ended_reason: null` (E2E-AGENT cycle 6). */
export async function stopSharing(pp: PolicyPrincipal, p: Principal, key: string): Promise<{ session_key: string; state: "stopped"; }> {
    return (0, sessionsService.stopSharing)(pp, p, key);
}
/** Delete shared history: the session, its epochs, usage, directive deliveries and receipts, hard-deleted.
 *  Spend totals change. Directives left with no recipient are removed too. Unlike the session's other calls, any live
 *  device of the person who shared it may do this, not only the device that shared it (C4-1): a re-pair would
 *  otherwise strand the history where only the web could delete it. The audit row names the device that did it. */
export async function deleteSession(pp: PolicyPrincipal, p: Principal, key: string): Promise<void> {
    return (0, sessionsService.deleteSession)(pp, p, key);
}
/** Stop or resume the session's agent (its local stop latch). The session owner or a workspace owner. */
export async function setAgentStop(pp: PolicyPrincipal, key: string, stop: boolean): Promise<{ directive_id: string | null; agent_stopped: boolean; }> {
    return (0, sessionsService.setAgentStop)(pp, key, stop);
}
/** The sessions page: the caller's own shared sessions in full; for workspace owners, every shared session's
 *  alias, owner, start and state (for stop/resume), never its title or usage. */
export function listSessions(pp: PolicyPrincipal): { mine: { session_key: string; harness: "claude-code" | "codex"; repo_alias: string | null; title: string | null; started_at: string; state: "shared" | "suspended" | "stopped"; stopped_at: string | null; ended_reason: EndedReason | null; device: { id: string; name: string; signed_out: boolean; has_workspace: boolean; } | null; current_epoch: { goal: { id: string; title: string; version: number; private?: undefined; } | { id: null; title: null; private: boolean; version?: undefined; } | null; epoch_id: string; goal_id: string | null; goal_version_at_start: number | null; starts_at: string; ends_at: string | null; } | null; governing_goal: { id: string; title: string; version: number; private?: undefined; } | { id: null; title: null; private: boolean; version?: undefined; } | null; agent_stopped: boolean; stop_status: { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null; conflicts: number; usage: { requests: number; input: number; output: number; } | undefined; }[]; all: { session_key: string; owner: { id: string; name: string; }; repo_alias: string | null; harness: "claude-code" | "codex";
// When it started: with the key's end, it tells one person's sessions in one repository apart (W3).
started_at: string; state: "shared" | "suspended" | "stopped"; agent_stopped: boolean; stop_status: { directive_id: string; kind: DirectiveKind; created_at: string; receipts: { state: ReceiptState; at: string; }[]; } | null; }[] | null; } {
    return (0, sessionsService.listSessions)(pp);
}
