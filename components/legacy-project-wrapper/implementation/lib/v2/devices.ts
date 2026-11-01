import { createPublicKey, verify } from "node:crypto";
import { randomInt } from "node:crypto";
import { config } from "../config";
import { all, audit, get, LIVE_WS, run, tx } from "./db";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { retryAfterMs, take, takeAll } from "./limits";
import { endSessions } from "./sessions";

// Device pairing (RFC 8628 style, key-bound) and device credentials. docs/v2/WIRE.md "Device pairing".
// Access tokens (alnd_) last 1 h; refresh tokens (alnr_) rotate on every use and last 30 days. Only SHA-256 hashes
// are stored. Presenting a refresh token that was already rotated revokes the whole device.

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
export const CODE_TTL_S = 600;
export const POLL_INTERVAL_S = 5;
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"; // no vowels (no words), no lookalikes
const REFRESH_SKEW_MS = 5 * 60 * 1000;

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

export function userById(id: string): (UserRef & { emailVerified: boolean }) | undefined {
  const u = get<{ id: string; name: string; email: string; emailVerified: number }>("SELECT id, name, email, emailVerified FROM ba_user WHERE id = ?", id);
  return u ? { id: u.id, name: u.name, email: u.email, emailVerified: !!u.emailVerified } : undefined;
}

function publicKeyOf(b64: string) {
  const raw = Buffer.from(b64, "base64url");
  if (raw.length !== 32 || raw.toString("base64url") !== b64) throw badRequest("public_key must be a base64url Ed25519 public key (32 bytes)");
  try {
    return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64 }, format: "jwk" });
  } catch {
    throw badRequest("public_key must be a base64url Ed25519 public key (32 bytes)");
  }
}

function userCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** "bcdf ghjk", "BCDFGHJK" and "BCDF-GHJK" are the same code. */
export function normalizeUserCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length !== 8 || [...s].some((c) => !USER_CODE_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Pairings one client may start per hour. */
const PAIRINGS_PER_HOUR = 10;

/** The pairing limit's refusal says how long to wait (whole minutes, at least 1), and `retry_after` (seconds, also sent
 *  as Retry-After). In Mode L every pairing on the computer is one client, and the counter is in memory. */
function pairingLimited(waitMs: number): V2Error {
  const min = Math.max(1, Math.ceil(waitMs / 60_000));
  const wait = min === 1 ? "1 minute" : `${min} minutes`;
  const message = config().hosted
    ? `Too many device pairings were started from this network in the last hour (the limit is ${PAIRINGS_PER_HOUR}). Try again in ${wait}.`
    : `Align on this computer has started ${PAIRINGS_PER_HOUR} device pairings in the last hour, its limit for everyone who pairs here. Try again in ${wait}, or restart Align to clear it.`;
  return new V2Error(429, "rate_limited", message, { retry_after: Math.max(1, Math.ceil(waitMs / 1000)) });
}

export async function authorize(input: { device_name: string; public_key: string }, client: string, origin: string) {
  publicKeyOf(input.public_key);
  const limit = { key: `device-authorize:${client}`, max: PAIRINGS_PER_HOUR, windowMs: 60 * 60 * 1000 };
  if (!takeAll([limit])) throw pairingLimited(retryAfterMs([limit]));
  const deviceCode = secretToken(32); // 43 chars
  const now = Date.now();
  const code = await tx(() => {
    for (let i = 0; i < 10; i++) {
      const c = userCode();
      if (get("SELECT 1 AS x FROM v2_device_requests WHERE user_code = ?", c)) continue;
      // Expired requests are dropped here, so stale codes don't accumulate.
      run("DELETE FROM v2_device_requests WHERE expires_at < ? AND state <> 'approved'", new Date(now - 3600_000).toISOString());
      run(
        "INSERT INTO v2_device_requests (id, device_code_hash, user_code, device_name, public_key, created_at, expires_at, interval_s, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
        newId("dr"),
        sha256hex(deviceCode),
        c,
        input.device_name,
        input.public_key,
        new Date(now).toISOString(),
        new Date(now + CODE_TTL_S * 1000).toISOString(),
        POLL_INTERVAL_S,
      );
      return c;
    }
    throw new V2Error(503, "busy", "Try again");
  });
  return { device_code: deviceCode, user_code: code, verification_uri: `${origin}/app/device`, expires_in: CODE_TTL_S, interval: POLL_INTERVAL_S };
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
}

const oauthError = (code: string) => new V2Error(400, code, code.replaceAll("_", " "));

function issueTokens(deviceId: string, nowMs: number) {
  const access = `alnd_${secretToken(32)}`;
  const refresh = `alnr_${secretToken(32)}`;
  const at = new Date(nowMs).toISOString();
  run("INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'access', ?, ?)", sha256hex(access), deviceId, at, new Date(nowMs + ACCESS_TTL_S * 1000).toISOString());
  run("INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'refresh', ?, ?)", sha256hex(refresh), deviceId, at, new Date(nowMs + REFRESH_TTL_S * 1000).toISOString());
  // Expired tokens of this device are pruned (a rotated refresh token is kept until it expires, for reuse detection).
  run("DELETE FROM v2_device_tokens WHERE device_id = ? AND expires_at < ?", deviceId, at);
  return { access, refresh };
}

export async function token(deviceCode: string, replaces: string | null = null) {
  const nowMs = Date.now();
  const at = new Date(nowMs).toISOString();
  // The poll bookkeeping (last poll, slow_down's longer interval) must commit even when the answer is an error,
  // so the transaction returns the outcome and the error is thrown after COMMIT.
  const out = await tx((): { error: string } | { ok: Record<string, unknown> } => {
    const r = get<RequestRow>("SELECT * FROM v2_device_requests WHERE device_code_hash = ?", sha256hex(deviceCode));
    if (!r) return { error: "invalid_grant" };
    if (r.state === "consumed") return { error: "expired_token" };
    if (Date.parse(r.expires_at) <= nowMs) return { error: "expired_token" };
    if (r.last_poll_at && nowMs - Date.parse(r.last_poll_at) < r.interval_s * 1000) {
      run("UPDATE v2_device_requests SET last_poll_at = ?, interval_s = interval_s + 5 WHERE id = ?", at, r.id);
      return { error: "slow_down" };
    }
    run("UPDATE v2_device_requests SET last_poll_at = ? WHERE id = ?", at, r.id);
    if (r.state === "denied") return { error: "access_denied" };
    if (r.state === "pending") return { error: "authorization_pending" };
    // approved: create the device once, then the request is spent.
    const user = r.user_id ? userById(r.user_id) : undefined;
    if (!user) return { error: "access_denied" };
    const deviceId = newId("dv");
    run("INSERT INTO v2_devices (id, user_id, name, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)", deviceId, user.id, distinctName(user.id, r.device_name, replaces), r.public_key, at, at);
    const granted: string[] = [];
    for (const ws of JSON.parse(r.ws_ids_json || "[]") as string[]) {
      if (get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, ws, user.id)) {
        run("INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)", deviceId, ws);
        granted.push(ws);
      }
    }
    run("UPDATE v2_device_requests SET state = 'consumed', device_id = ? WHERE id = ?", deviceId, r.id);
    audit(null, user.id, "device.paired", deviceId, at);
    // One event per workspace the device was granted, so the funnel counts workspaces with a paired device.
    for (const ws of granted) event("device_paired", { ws, user: user.id, props: { workspaces: granted.length }, at });
    const t = issueTokens(deviceId, nowMs);
    return { ok: { device_id: deviceId, access_token: t.access, expires_in: ACCESS_TTL_S, refresh_token: t.refresh, user: { id: user.id, name: user.name, email: user.email } } };
  });
  if ("error" in out) throw oauthError(out.error);
  return out.ok;
}

/** A name none of this person's live devices has: a second "Milo's laptop" (another machine of that name, or a second
 *  login at once) becomes "Milo's laptop (2)", so the Devices page and `align login` never show two live devices of one
 *  name (E2E cycle 5). The device this pairing replaces on the same machine (`replaces`, counted only when it is this
 *  person's: the query reads only theirs) does not count, as it is revoked a moment later: a re-login keeps its name. */
function distinctName(userId: string, name: string, replaces: string | null): string {
  const taken = new Set(all<{ name: string }>("SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?", userId, replaces ?? "").map((d) => d.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} (${n})`)) return `${name} (${n})`;
}

/** The exact bytes a device signs to refresh (docs/v2/WIRE.md). */
export const refreshMessage = (deviceId: string, refreshToken: string, ts: string) => `align-refresh\n${deviceId}\n${sha256hex(refreshToken)}\n${ts}`;

export async function refresh(input: { device_id: string; refresh_token: string; ts: string; sig: string }) {
  // `reason` says why a device is refused when that is safe to say: `unknown_device` (no such device: only deleting an
  // account deletes devices) or, for a correctly signed refresh of a revoked device, why it was revoked
  // (`revoked_on_web`, `signed_out_everywhere`, `logout`, `refresh_reuse`), so the device can tell its person why.
  const invalid = (reason?: string) => new V2Error(401, "invalid_grant", "invalid grant", reason ? { reason } : undefined);
  const nowMs = Date.now();
  const device = get<{ id: string; public_key: string; revoked_at: string | null; revoked_reason: string | null }>(
    "SELECT id, public_key, revoked_at, revoked_reason FROM v2_devices WHERE id = ?",
    input.device_id,
  );
  if (!device) throw invalid("unknown_device");
  const tsMs = Date.parse(input.ts);
  if (Number.isNaN(tsMs)) throw invalid();
  let ok = false;
  try {
    ok = verify(null, Buffer.from(refreshMessage(input.device_id, input.refresh_token, input.ts), "utf8"), publicKeyOf(device.public_key), Buffer.from(input.sig, "base64url"));
  } catch {
    ok = false;
  }
  if (device.revoked_at) throw invalid(ok ? device.revoked_reason || "revoked" : undefined);
  if (!ok) throw invalid();
  // A correctly signed request whose clock is off is not a bad grant: the device stays paired, nothing is rotated, and
  // the answer carries the server's time so the device can say how far off its clock is and sign again with a
  // timestamp the server accepts. The window itself is unchanged, so a captured signed message still expires in 5 min.
  if (Math.abs(nowMs - tsMs) > REFRESH_SKEW_MS) {
    const minutes = Math.round((tsMs - nowMs) / 60_000);
    throw new V2Error(400, "clock_skew", `This device's clock is ${Math.abs(minutes)} minutes ${minutes > 0 ? "ahead of" : "behind"} the server's`, { server_time: new Date(nowMs).toISOString() });
  }
  const out = await tx(() => {
    const t = get<{ rotated_at: string | null; expires_at: string }>(
      "SELECT rotated_at, expires_at FROM v2_device_tokens WHERE token_hash = ? AND device_id = ? AND kind = 'refresh'",
      sha256hex(input.refresh_token),
      input.device_id,
    );
    if (!t) return null;
    if (t.rotated_at) {
      revokeInTx(input.device_id, "refresh_reuse", null);
      return null;
    }
    if (Date.parse(t.expires_at) <= nowMs) return null;
    run("UPDATE v2_device_tokens SET rotated_at = ? WHERE token_hash = ?", new Date(nowMs).toISOString(), sha256hex(input.refresh_token));
    run("UPDATE v2_devices SET last_seen_at = ? WHERE id = ?", new Date(nowMs).toISOString(), input.device_id);
    const n = issueTokens(input.device_id, nowMs);
    return { access_token: n.access, expires_in: ACCESS_TTL_S, refresh_token: n.refresh };
  });
  if (!out) throw invalid();
  return out;
}

/** `actor` is the person who revoked it; null for automatic revocation (refresh-token reuse). The reason stays on the
 *  device row. */
function revokeInTx(deviceId: string, reason: string, actor: string | null) {
  const at = nowIso();
  run("UPDATE v2_devices SET revoked_at = COALESCE(revoked_at, ?), revoked_reason = COALESCE(revoked_reason, ?) WHERE id = ?", at, reason, deviceId);
  run("DELETE FROM v2_device_tokens WHERE device_id = ?", deviceId);
  endDeviceSessions(deviceId, at);
  audit(null, actor, "device.revoked", deviceId, at);
}

/**
 * A revoked device can no longer fetch directives, so none of its sessions can be stopped, resumed or released any
 * more: each one still shared (or suspended) ends now (lib/v2/sessions.ts endSessions), marked `device_signed_out` so
 * the Sessions tab can say why and refuse Stop and Resume. Its history stays.
 */
function endDeviceSessions(deviceId: string, at: string) {
  endSessions(all<{ ws_id: string; session_key: string }>("SELECT ws_id, session_key FROM v2_sessions WHERE device_id = ? AND state <> 'stopped'", deviceId), "device_signed_out", at);
}

export async function revokeDevice(deviceId: string, reason: string, actor: string) {
  await tx(() => revokeInTx(deviceId, reason, actor));
}

/** Revoke every unrevoked device of this person, inside the caller's tx() (signing out everywhere). How many. */
export function revokeDevicesOf(userId: string, reason: string, actor: string): number {
  const ids = all<{ id: string }>("SELECT id FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL", userId);
  for (const { id } of ids) revokeInTx(id, reason, actor);
  return ids.length;
}

/** The device behind a Bearer access token, or null (unknown, expired, revoked). */
export function deviceFromAccessToken(tokenValue: string): DevicePrincipal | null {
  if (!/^alnd_[A-Za-z0-9_-]{20,100}$/.test(tokenValue)) return null;
  const row = get<{ device_id: string; expires_at: string; name: string; user_id: string; revoked_at: string | null; last_seen_at: string | null }>(
    `SELECT t.device_id, t.expires_at, d.name, d.user_id, d.revoked_at, d.last_seen_at FROM v2_device_tokens t JOIN v2_devices d ON d.id = t.device_id
     WHERE t.token_hash = ? AND t.kind = 'access'`,
    sha256hex(tokenValue),
  );
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;
  const user = userById(row.user_id);
  if (!user) return null;
  // "Last seen" for the devices page, at most every 5 minutes; best effort (a busy database just skips it).
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 5 * 60 * 1000) {
    try {
      run("UPDATE v2_devices SET last_seen_at = ? WHERE id = ?", nowIso(), row.device_id);
    } catch {}
  }
  // A grant counts only while the user is still a member of that workspace and it is not deleted.
  const grants = new Set(
    all<{ ws_id: string }>(
      `SELECT g.ws_id FROM v2_device_grants g JOIN v2_members m ON m.ws_id = g.ws_id AND m.user_id = ? WHERE g.device_id = ? AND ${LIVE_WS("g.ws_id")}`,
      row.user_id,
      row.device_id,
    ).map((r) => r.ws_id),
  );
  return { kind: "device", user: { id: user.id, name: user.name, email: user.email }, deviceId: row.device_id, deviceName: row.name, grants };
}

// ---- the browser half (signed-in user at /app/device) ----

function pendingByCode(code: string, nowMs = Date.now()): RequestRow {
  const norm = normalizeUserCode(code);
  const r = norm ? get<RequestRow>("SELECT * FROM v2_device_requests WHERE user_code = ?", norm) : undefined;
  if (!r || r.state !== "pending" || Date.parse(r.expires_at) <= nowMs) throw notFound();
  return r;
}

export function lookupRequest(userId: string, code: string) {
  take(`device-lookup:${userId}`, 20, 10 * 60 * 1000);
  const r = pendingByCode(code);
  return { device_name: r.device_name, requested_at: r.created_at, age_seconds: Math.max(0, Math.round((Date.now() - Date.parse(r.created_at)) / 1000)), expires_at: r.expires_at };
}

export async function decideRequest(userId: string, code: string, decision: "approve" | "deny", wsIds: string[]) {
  take(`device-decide:${userId}`, 20, 10 * 60 * 1000);
  return tx(() => {
    const r = pendingByCode(code);
    if (decision === "deny") {
      run("UPDATE v2_device_requests SET state = 'denied', user_id = ? WHERE id = ?", userId, r.id);
      return { state: "denied" as const };
    }
    if (!wsIds.length) throw badRequest("Choose at least one workspace for this device");
    for (const ws of wsIds) if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, ws, userId)) throw notFound();
    run("UPDATE v2_device_requests SET state = 'approved', user_id = ?, ws_ids_json = ? WHERE id = ?", userId, JSON.stringify(wsIds), r.id);
    return { state: "approved" as const };
  });
}

export function listDevices(userId: string) {
  const rows = all<{ id: string; name: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; revoked_reason: string | null }>(
    "SELECT id, name, created_at, last_seen_at, revoked_at, revoked_reason FROM v2_devices WHERE user_id = ? ORDER BY created_at DESC",
    userId,
  );
  return rows.map((d) => ({
    ...d,
    workspaces: all<{ id: string; name: string }>("SELECT w.id, w.name FROM v2_device_grants g JOIN v2_workspaces w ON w.id = g.ws_id WHERE g.device_id = ? AND w.deleted_at IS NULL ORDER BY w.name", d.id),
  }));
}

/** This person's paired devices that are not revoked, most recently seen first: what an invite's accept page offers to
 *  give the workspace. */
export function liveDevicesOf(userId: string) {
  // By name: last_seen_at moves at most every 5 minutes, so ordering by it could contradict what the person just did (Y4).
  return all<{ id: string; name: string; created_at: string; last_seen_at: string | null }>(
    "SELECT id, name, created_at, last_seen_at FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY name COLLATE NOCASE, id",
    userId,
  );
}

/** Give each of these devices workspace `wsId`, inside the caller's tx() (accepting an invite; the person is a member
 *  by then). Each must be the person's own and not revoked, else 404 and the caller's transaction rolls back. Audited
 *  in the workspace as `device.workspace_added` (the device as object). */
export const DEVICE_NOT_YOURS = "A device you chose is not one of your paired devices any more (it may have been signed out), so nothing was joined.";

export function addWorkspaceToDevices(userId: string, wsId: string, deviceIds: string[], at: string): string[] {
  for (const id of deviceIds) {
    // The same 404 for another person's, a revoked and an unknown device; it says what happened, never whose it is (Y1).
    if (!get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL", id, userId)) throw new V2Error(404, "not_found", DEVICE_NOT_YOURS);
    run("INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)", id, wsId);
    audit(wsId, userId, "device.workspace_added", id, at);
  }
  return deviceIds;
}

/**
 * Give one of this person's own live devices a workspace they are a member of, later than at an invite (the Devices
 * page, an extension of owner decision 2026-11-01, ADR 0003 section 6): the same grant and the same
 * `device.workspace_added` audit row as accepting an invite with the device ticked. 404 for a device that is not theirs
 * or is revoked, or a workspace they are not a member of; 409 `already_granted` when the device has it already.
 */
export async function grantWorkspace(userId: string, deviceId: string, wsId: string) {
  const at = nowIso();
  await tx(() => {
    // Another person's, a revoked and an unknown device read alike, as at an invite (Y1), in this page's words.
    if (!get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL", deviceId, userId)) {
      throw new V2Error(404, "not_found", "This device is not one of your paired devices any more (it may have been signed out), so it was given nothing.");
    }
    if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, wsId, userId)) throw notFound();
    if (get("SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?", deviceId, wsId)) throw conflict("already_granted", "This device already has this workspace");
    // The invite path's grant and audit row, as it stands.
    addWorkspaceToDevices(userId, wsId, [deviceId], at);
  });
  return { device_id: deviceId, workspace_id: wsId };
}

export function deviceOwnedBy(deviceId: string, userId: string): boolean {
  return !!get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ?", deviceId, userId);
}
