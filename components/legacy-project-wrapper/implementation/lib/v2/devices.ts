import { createPublicKey, verify } from "node:crypto";
import { randomInt } from "node:crypto";
import { all, audit, get, LIVE_WS, run, tx } from "./db";
import { V2Error, badRequest, notFound } from "./errors";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { take } from "./limits";

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

export async function authorize(input: { device_name: string; public_key: string }, client: string, origin: string) {
  publicKeyOf(input.public_key);
  take(`device-authorize:${client}`, 10, 60 * 60 * 1000);
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

export async function token(deviceCode: string) {
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
    run("INSERT INTO v2_devices (id, user_id, name, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)", deviceId, user.id, r.device_name, r.public_key, at, at);
    for (const ws of JSON.parse(r.ws_ids_json || "[]") as string[]) {
      if (get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, ws, user.id)) run("INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)", deviceId, ws);
    }
    run("UPDATE v2_device_requests SET state = 'consumed', device_id = ? WHERE id = ?", deviceId, r.id);
    audit(null, user.id, "device.paired", deviceId, at);
    const t = issueTokens(deviceId, nowMs);
    return { ok: { device_id: deviceId, access_token: t.access, expires_in: ACCESS_TTL_S, refresh_token: t.refresh, user: { id: user.id, name: user.name, email: user.email } } };
  });
  if ("error" in out) throw oauthError(out.error);
  return out.ok;
}

/** The exact bytes a device signs to refresh (docs/v2/WIRE.md). */
export const refreshMessage = (deviceId: string, refreshToken: string, ts: string) => `align-refresh\n${deviceId}\n${sha256hex(refreshToken)}\n${ts}`;

export async function refresh(input: { device_id: string; refresh_token: string; ts: string; sig: string }) {
  const invalid = () => new V2Error(401, "invalid_grant", "invalid grant");
  const nowMs = Date.now();
  const device = get<{ id: string; public_key: string; revoked_at: string | null }>("SELECT id, public_key, revoked_at FROM v2_devices WHERE id = ?", input.device_id);
  if (!device || device.revoked_at) throw invalid();
  const tsMs = Date.parse(input.ts);
  if (Number.isNaN(tsMs) || Math.abs(nowMs - tsMs) > REFRESH_SKEW_MS) throw invalid();
  let ok = false;
  try {
    ok = verify(null, Buffer.from(refreshMessage(input.device_id, input.refresh_token, input.ts), "utf8"), publicKeyOf(device.public_key), Buffer.from(input.sig, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) throw invalid();
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
  audit(null, actor, "device.revoked", deviceId, at);
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

export function deviceOwnedBy(deviceId: string, userId: string): boolean {
  return !!get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ?", deviceId, userId);
}
