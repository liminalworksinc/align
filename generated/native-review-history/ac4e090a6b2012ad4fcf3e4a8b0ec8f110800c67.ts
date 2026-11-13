// Caller-owned Devices types and explicit resource bindings.
import { createPublicKey, verify } from "node:crypto";
import { randomInt } from "node:crypto";
import { config } from "../config";
import { all, audit, get, LIVE_WS, run, tx } from "./db";
import { V2Error, badRequest, conflict } from "./errors";
import { event } from "./events";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { retryAfterMs, take, takeAll } from "./limits";
import { endSessions } from "./sessions";
import { create_devices } from "../native/.bindings/server_devices.js";

export interface UserRef {
    id: string;
    name: string;
    email: string;
}

export interface DevicePrincipal {
    kind: "device";
    user: UserRef;
    deviceId: string;
    deviceName: string;
    grants: Set<string>;
}

interface RequestRow {
    id: string;
    device_name: string;
    public_key: string;
    created_at: string;
    expires_at: string;
    interval_s: number;
    last_poll_at: string | null;
    state: "pending" | "approved" | "denied" | "consumed";
    user_id: string | null;
    ws_ids_json: string | null;
    approved_name: string | null;
}

interface DevicesRuntime {
  ACCESS_TTL_S: 3600;
  REFRESH_TTL_S: number;
  CODE_TTL_S: 600;
  POLL_INTERVAL_S: 5;
  userById: (id: string) => (UserRef & { emailVerified: boolean; }) | undefined;
  normalizeUserCode: (input: string) => string | null;
  authorize: (input: { device_name: string; public_key: string; }, client: string, origin: string) => Promise<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; }>;
  token: (deviceCode: string, replaces?: string | null) => Promise<Record<string, unknown>>;
  refreshMessage: (deviceId: string, refreshToken: string, ts: string) => string;
  refresh: (input: { device_id: string; refresh_token: string; ts: string; sig: string; }) => Promise<{ access_token: string; expires_in: number; refresh_token: string; }>;
  revokeDevice: (deviceId: string, reason: string, actor: string, replacedBy?: string | null) => Promise<void>;
  revokeDevicesOf: (userId: string, reason: string, actor: string) => number;
  deviceFromAccessToken: (tokenValue: string) => DevicePrincipal | null;
  userCodeOf: (b: Record<string, unknown>) => string;
  workspaceIdsOf: (b: Record<string, unknown>) => string[];
  WORKSPACES_PER_APPROVAL: 50;
  WORKSPACES_UNREADABLE: "This approval doesn't say which of your workspaces the device may use, so nothing was approved. Tick your workspaces again.";
  TOO_MANY_WORKSPACES: "One approval can give a device at most 50 workspaces, so nothing was approved. Tick fewer workspaces.";
  LONG_CODE: "That code is too long. Enter the code shown by align login.";
  EMPTY_CODE: "Enter the code shown by align login.";
  lookupRequest: (userId: string, code: string) => { device_name: string; requested_at: string; age_seconds: number; expires_at: string; };
  decideRequest: (userId: string, code: string, decision: "approve" | "deny", wsIds: string[]) => Promise<{ state: "denied"; device_name?: undefined; asked_as?: undefined; same_name?: undefined; } | { state: "approved"; device_name: string; asked_as: string; same_name: string[]; }>;
  WORKSPACE_CHOSEN_NOT_YOURS: "A workspace you ticked is not one of yours any more (it was deleted, or you left it or were removed from it), so nothing was approved. Tick your workspaces again.";
  listDevices: (userId: string) => { workspaces: { id: string; name: string; }[]; id: string; name: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; revoked_reason: string | null; }[];
  liveDevicesOf: (userId: string) => { id: string; name: string; created_at: string; last_seen_at: string | null; }[];
  DEVICE_NOT_YOURS: "A device you chose is not one of your paired devices any more (it may have been signed out), so nothing was joined.";
  addWorkspaceToDevices: (userId: string, wsId: string, deviceIds: string[], at: string) => string[];
  WORKSPACE_NOT_YOURS: "This workspace is not one of yours any more (it was deleted, or you left it or were removed from it), so the device was given nothing.";
  grantWorkspace: (userId: string, deviceId: string, wsId: string) => Promise<{ device_id: string; workspace_id: string; }>;
  deviceOwnedBy: (deviceId: string, userId: string) => boolean;
}
const devicesService = create_devices({
  createPublicKey: (...args: Parameters<typeof createPublicKey>) => createPublicKey(...args),
  verify: (...args: Parameters<typeof verify>) => verify(...args),
  randomInt: (...args: Parameters<typeof randomInt>) => randomInt(...args),
  config: (...args: Parameters<typeof config>) => config(...args),
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  LIVE_WS: (...args: Parameters<typeof LIVE_WS>) => LIVE_WS(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  V2Error,
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  secretToken: (...args: Parameters<typeof secretToken>) => secretToken(...args),
  sha256hex: (...args: Parameters<typeof sha256hex>) => sha256hex(...args),
  retryAfterMs: (...args: Parameters<typeof retryAfterMs>) => retryAfterMs(...args),
  take: (...args: Parameters<typeof take>) => take(...args),
  takeAll: (...args: Parameters<typeof takeAll>) => takeAll(...args),
  endSessions: (...args: Parameters<typeof endSessions>) => endSessions(...args),
  readDate: () => Date,
  readBuffer: () => Buffer,
}) as unknown as DevicesRuntime;

export const ACCESS_TTL_S = devicesService.ACCESS_TTL_S;
export const REFRESH_TTL_S = devicesService.REFRESH_TTL_S;
export const CODE_TTL_S = devicesService.CODE_TTL_S;
export const POLL_INTERVAL_S = devicesService.POLL_INTERVAL_S;
export function userById(id: string): (UserRef & {
    emailVerified: boolean;
}) | undefined {
    return (0, devicesService.userById)(id);
}
/** "bcdf ghjk", "BCDFGHJK" and "BCDF-GHJK" are the same code. */
export function normalizeUserCode(input: string): string | null {
    return (0, devicesService.normalizeUserCode)(input);
}
export async function authorize(input: {
    device_name: string;
    public_key: string;
}, client: string, origin: string): Promise<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; }> {
    return (0, devicesService.authorize)(input, client, origin);
}
export async function token(deviceCode: string, replaces: string | null = null): Promise<Record<string, unknown>> {
    return (0, devicesService.token)(deviceCode, replaces);
}
export const refreshMessage = (deviceId: string, refreshToken: string, ts: string): string => (0, devicesService.refreshMessage)(deviceId, refreshToken, ts);
export async function refresh(input: {
    device_id: string;
    refresh_token: string;
    ts: string;
    sig: string;
}): Promise<{ access_token: string; expires_in: number; refresh_token: string; }> {
    return (0, devicesService.refresh)(input);
}
export async function revokeDevice(deviceId: string, reason: string, actor: string, replacedBy: string | null = null): Promise<void> {
    return (0, devicesService.revokeDevice)(deviceId, reason, actor, replacedBy);
}
/** Revoke every unrevoked device of this person, inside the caller's tx() (signing out everywhere). How many. */
export function revokeDevicesOf(userId: string, reason: string, actor: string): number {
    return (0, devicesService.revokeDevicesOf)(userId, reason, actor);
}
/** The device behind a Bearer access token, or null (unknown, expired, revoked). */
export function deviceFromAccessToken(tokenValue: string): DevicePrincipal | null {
    return (0, devicesService.deviceFromAccessToken)(tokenValue);
}
/** The code an approval or denial names, from its body: an empty one, or one that is not text (`null`, a number), is
 *  refused in words the person can act on, never as a field name (E2E-WEB cycle 10 W4, cycle 11 W1). */
export function userCodeOf(b: Record<string, unknown>): string {
    return (0, devicesService.userCodeOf)(b);
}
/** The workspaces an approval grants, from `workspace_ids`: a list of workspace ids, each kept once. A body that is
 *  not one is 400 in a person's words, never the field's name (E2E-WEB cycle 12 W3); an id that is no workspace of
 *  theirs is decided at approval (WORKSPACE_CHOSEN_NOT_YOURS). */
export function workspaceIdsOf(b: Record<string, unknown>): string[] {
    return (0, devicesService.workspaceIdsOf)(b);
}
export const WORKSPACES_PER_APPROVAL = devicesService.WORKSPACES_PER_APPROVAL;
export const WORKSPACES_UNREADABLE = devicesService.WORKSPACES_UNREADABLE;
export const TOO_MANY_WORKSPACES = devicesService.TOO_MANY_WORKSPACES;
export const LONG_CODE = devicesService.LONG_CODE;
export const EMPTY_CODE = devicesService.EMPTY_CODE;
export function lookupRequest(userId: string, code: string): { device_name: string; requested_at: string; age_seconds: number; expires_at: string; } {
    return (0, devicesService.lookupRequest)(userId, code);
}
/** Approve or deny a pairing. Approving decides the device's name now that the person is known (W4): the name it asked
 *  for, or "<name> (n)" when one of their live devices (or another approved pairing of theirs waiting for its poll) has
 *  it. The answer carries it as `device_name`, with `asked_as`, so the page names the device as it is stored. */
export async function decideRequest(userId: string, code: string, decision: "approve" | "deny", wsIds: string[]): Promise<{ state: "denied"; device_name?: undefined; asked_as?: undefined; same_name?: undefined; } | { state: "approved"; device_name: string; asked_as: string; same_name: string[]; }> {
    return (0, devicesService.decideRequest)(userId, code, decision, wsIds);
}
export const WORKSPACE_CHOSEN_NOT_YOURS = devicesService.WORKSPACE_CHOSEN_NOT_YOURS;
export function listDevices(userId: string): { workspaces: { id: string; name: string; }[]; id: string; name: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; revoked_reason: string | null; }[] {
    return (0, devicesService.listDevices)(userId);
}
/** This person's paired devices that are not revoked, most recently seen first: what an invite's accept page offers to
 *  give the workspace. */
export function liveDevicesOf(userId: string): { id: string; name: string; created_at: string; last_seen_at: string | null; }[] {
    return (0, devicesService.liveDevicesOf)(userId);
}
export const DEVICE_NOT_YOURS = devicesService.DEVICE_NOT_YOURS;
export function addWorkspaceToDevices(userId: string, wsId: string, deviceIds: string[], at: string): string[] {
    return (0, devicesService.addWorkspaceToDevices)(userId, wsId, deviceIds, at);
}
export const WORKSPACE_NOT_YOURS = devicesService.WORKSPACE_NOT_YOURS;
/**
 * Give one of this person's own live devices a workspace they are a member of, later than at an invite (the Devices
 * page, an extension of owner decision 2026-11-01, ADR 0003 section 6): the same grant and the same
 * `device.workspace_added` audit row as accepting an invite with the device ticked. 404 for a device that is not theirs
 * or is revoked, or a workspace they are not a member of; 409 `already_granted` when the device has it already.
 */
export async function grantWorkspace(userId: string, deviceId: string, wsId: string): Promise<{ device_id: string; workspace_id: string; }> {
    return (0, devicesService.grantWorkspace)(userId, deviceId, wsId);
}
export function deviceOwnedBy(deviceId: string, userId: string): boolean {
    return (0, devicesService.deviceOwnedBy)(deviceId, userId);
}
