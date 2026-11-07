import { createPublicKey, verify } from "node:crypto";
import { randomInt } from "node:crypto";
import { config } from "../config";
import { all, audit, get, LIVE_WS, run, tx } from "./db";
import { V2Error, badRequest, conflict } from "./errors";
import { event } from "./events";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { retryAfterMs, take, takeAll } from "./limits";
import { endSessions } from "./sessions";

// Device pairing (RFC 8628 style, key-bound) and device credentials. docs/v2/WIRE.md "Device pairing".
// Access tokens (alnd_) last 1 h; refresh tokens (alnr_) rotate on every use and last 30 days. Only SHA-256 hashes
// are stored. Presenting a refresh token that was already rotated revokes the whole device, except a retry of the latest
// rotation within REFRESH_GRACE_MS whose new pair is still unused (see `refresh`).

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
export const CODE_TTL_S = 600;
export const POLL_INTERVAL_S = 5;
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"; // no vowels (no words), no lookalikes
const REFRESH_SKEW_MS = 5 * 60 * 1000;
// Covers a refresh whose answer was lost: the agent's 15 s timeout and its one retry at once, with room for a slow link.
const REFRESH_GRACE_MS = 30 * 1000;

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
  approved_name: string | null;
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
    // The device it replaces on the same machine, kept when it is this person's live one (C11-5).
    const replaced = replaces && get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL", replaces, user.id) ? replaces : null;
    run(
      "INSERT INTO v2_devices (id, user_id, name, public_key, created_at, last_seen_at, replaces) VALUES (?, ?, ?, ?, ?, ?, ?)",
      deviceId,
      user.id,
      pairedName(user.id, r, replaces, nowMs),
      r.public_key,
      at,
      at,
      replaced,
    );
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

/** A name none of this person's live devices has, nor any of their other approved pairings still waiting for their
 *  token poll (`held`): a second "Milo's laptop" (another machine of that name, or a second login at once) becomes
 *  "Milo's laptop (2)", so the Devices page and `align login` never show two live devices of one name (E2E cycle 5). The
 *  device this pairing replaces on the same machine (`replaces`, counted only when it is this person's: the query reads
 *  only theirs) does not count, as it is revoked a moment later: a re-login keeps its name. */
function distinctName(userId: string, name: string, replaces: string | null, held: string[] = []): string {
  const taken = new Set([...all<{ name: string }>("SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?", userId, replaces ?? "").map((d) => d.name), ...held]);
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} (${n})`)) return `${name} (${n})`;
}

/** The names this person's other approved pairings hold until their token poll (or until they expire). */
const heldNames = (userId: string, exceptRequest: string, nowMs: number) =>
  all<{ approved_name: string }>(
    "SELECT approved_name FROM v2_device_requests WHERE user_id = ? AND state = 'approved' AND id <> ? AND approved_name IS NOT NULL AND expires_at > ?",
    userId,
    exceptRequest,
    new Date(nowMs).toISOString(),
  ).map((r) => r.approved_name);

/** The name a pairing's device is stored under at its token poll (W4): the one decided when it was approved, which the
 *  approval page showed, unless the poll names (`replaces`) this person's live device it replaces on the same machine,
 *  when the name is decided again without that device: the name asked for when that is free, so a re-login keeps its
 *  plain name, else the replaced device's own name when it is one of the asked name's family (`X (3)` stays `X (3)`),
 *  as the approval page promises; or unless the approved name has been taken since (by a device paired before this
 *  poll), when the next free one is used. */
function pairedName(userId: string, r: RequestRow, replaces: string | null, nowMs: number): string {
  const held = heldNames(userId, r.id, nowMs);
  const old = replaces ? get<{ name: string }>("SELECT name FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL", replaces, userId) : undefined;
  if (old) {
    const free = distinctName(userId, r.device_name, replaces, held);
    // The name asked for is free: the device gets it, as its approval page said (a request for "X (5)" keeps it, cycle
    // 9 C9-4). Taken by another machine: the page said a new login on one of the machines told apart from it keeps
    // that machine's name, so a re-login on "X (3)" stays "X (3)" even when "X (2)" is free (E2E-WEB cycle 9 C9-1),
    // unless another live device or approved pairing of theirs holds that name now.
    if (free === r.device_name || nameNumber(r.device_name, old.name) === null) return free;
    // A device paired a moment ago by another login on this same machine (its poll named the same device to replace:
    // two `align login`s approved together) is that machine too, and one of the two logins revokes it in a moment: it
    // does not hold the machine's name, so both keep it (E2E-AGENT cycle 11 C11-5).
    const taken =
      held.includes(old.name) ||
      !!get("SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ? AND (replaces IS NULL OR replaces <> ?)", userId, old.name, replaces, replaces);
    return taken ? free : old.name;
  }
  if (r.approved_name && !get("SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ?", userId, r.approved_name)) return r.approved_name;
  return distinctName(userId, r.device_name, null, held);
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
    const t = get<{ rotated_at: string | null; rotated_ts: string | null; expires_at: string }>(
      "SELECT rotated_at, rotated_ts, expires_at FROM v2_device_tokens WHERE token_hash = ? AND device_id = ? AND kind = 'refresh'",
      sha256hex(input.refresh_token),
      input.device_id,
    );
    if (!t) return null;
    if (t.rotated_at) {
      // A device whose answer was lost in transit retries with the token it still holds. That retry is let through once:
      // only for this device's latest rotation, within REFRESH_GRACE_MS of it, signed anew with a `ts` later than the
      // rotating request's (a replay of a captured request is not, so it still revokes), while the pair that rotation
      // issued is unused (its refresh token not rotated, its access token never presented). That pair is deleted and a
      // new one issued, so the device keeps exactly one live chain, and the retry is audited. Any other reuse revokes
      // the whole device.
      const rotatedMs = Date.parse(t.rotated_at);
      const next = all<{ token_hash: string; kind: string; rotated_at: string | null; used_at: string | null }>(
        "SELECT token_hash, kind, rotated_at, used_at FROM v2_device_tokens WHERE device_id = ? AND created_at = ?",
        input.device_id,
        t.rotated_at,
      );
      const nextRefresh = next.filter((r) => r.kind === "refresh");
      const signedLater = !!t.rotated_ts && tsMs > Date.parse(t.rotated_ts);
      const unused = nextRefresh.length === 1 && !nextRefresh[0].rotated_at && next.every((r) => !r.used_at);
      // Strictly after the rotation, so the new pair's created_at never matches it and a second retry revokes.
      const graced = nowMs > rotatedMs && nowMs - rotatedMs <= REFRESH_GRACE_MS && signedLater && unused;
      if (!graced) {
        revokeInTx(input.device_id, "refresh_reuse", null);
        return null;
      }
      for (const r of next) run("DELETE FROM v2_device_tokens WHERE token_hash = ?", r.token_hash);
      audit(null, null, "device.refresh_retried", input.device_id, new Date(nowMs).toISOString());
      run("UPDATE v2_devices SET last_seen_at = ? WHERE id = ?", new Date(nowMs).toISOString(), input.device_id);
      const n = issueTokens(input.device_id, nowMs);
      return { access_token: n.access, expires_in: ACCESS_TTL_S, refresh_token: n.refresh };
    }
    if (Date.parse(t.expires_at) <= nowMs) return null;
    run("UPDATE v2_device_tokens SET rotated_at = ?, rotated_ts = ? WHERE token_hash = ?", new Date(nowMs).toISOString(), input.ts, sha256hex(input.refresh_token));
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

export async function revokeDevice(deviceId: string, reason: string, actor: string, replacedBy: string | null = null) {
  await tx(() => {
    revokeInTx(deviceId, reason, actor);
    if (replacedBy) passNameOn(deviceId, replacedBy);
  });
}

/**
 * A device revoked because a newer pairing on the same machine replaced it (`align login`; the agent names that device
 * in its self-revoke) gives that pairing its name, whatever that name is, when the pairing got a later name of the same
 * kind only because this one was still live: two `align login`s approved together, where the first one's device is
 * replaced by the second's a moment later (E2E-AGENT cycles 6 and 8). So "X (2)" passes "X" on, and "X (2)" replaced by
 * "X (3)" (the plain name held by another machine) passes "X (2)" on, and the machine keeps the name it had. Only for the
 * same person's live device named `<base> (<n>)` whose base is this one's name without its own " (<m>)" and m < n (the
 * plain name counting as 1), and only while no other live device of theirs has the name, so two real machines of one
 * name keep telling apart; a pairing that asked for another name keeps it, and so does one whose " (<n>)" is part of the
 * name it asked for (`align login --name "X (5)"`), which its approval page showed (cycle 9).
 */
function passNameOn(revokedId: string, nextId: string) {
  const gone = get<{ user_id: string; name: string }>("SELECT user_id, name FROM v2_devices WHERE id = ?", revokedId);
  const next = get<{ user_id: string; name: string; revoked_at: string | null }>("SELECT user_id, name, revoked_at FROM v2_devices WHERE id = ?", nextId);
  if (!gone || !next || next.user_id !== gone.user_id || next.revoked_at) return;
  const m = /^(.*) \((\d+)\)$/.exec(next.name);
  if (!m) return;
  // The name the person asked for (`align login --name`, or the agent's default) is theirs: only a number added to tell
  // it apart from a live device is passed back, never one they asked for (E2E-AGENT cycle 9 C9-4), so the device keeps
  // the name its approval page showed.
  const asked = get<{ device_name: string }>("SELECT device_name FROM v2_device_requests WHERE device_id = ?", nextId)?.device_name;
  if (asked === next.name) return;
  const was = nameNumber(m[1], gone.name);
  if (was === null || was >= Number(m[2])) return;
  if (get("SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ?", gone.user_id, gone.name, nextId)) return;
  run("UPDATE v2_devices SET name = ? WHERE id = ?", gone.name, nextId);
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
  const row = get<{ device_id: string; expires_at: string; name: string; user_id: string; revoked_at: string | null; last_seen_at: string | null; used_at: string | null }>(
    `SELECT t.device_id, t.expires_at, d.name, d.user_id, d.revoked_at, d.last_seen_at, t.used_at FROM v2_device_tokens t JOIN v2_devices d ON d.id = t.device_id
     WHERE t.token_hash = ? AND t.kind = 'access'`,
    sha256hex(tokenValue),
  );
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;
  const user = userById(row.user_id);
  if (!user) return null;
  // Its first use, once: a pair whose access token was used is never replaced by a refresh retry (LIM-2441 H7a). Not
  // best effort: a use that can't be recorded is refused, so a retry can never kill a token already in use.
  if (!row.used_at) run("UPDATE v2_device_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL", nowIso(), sha256hex(tokenValue));
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

/** A code no device is waiting on: unknown, expired, or approved or denied already (in another tab, say). */
const CODE_NOT_WAITING = "No device is waiting for that code. Check it, or run align login again.";

/** The code an approval or denial names, from its body: an empty one, or one that is not text (`null`, a number), is
 *  refused in words the person can act on, never as a field name (E2E-WEB cycle 10 W4, cycle 11 W1). */
export function userCodeOf(b: Record<string, unknown>): string {
  const v = b.user_code;
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) throw badRequest(EMPTY_CODE);
  if (t.length > 20) throw badRequest(LONG_CODE);
  return t;
}

/** The workspaces an approval grants, from `workspace_ids`: a list of workspace ids, each kept once. A body that is
 *  not one is 400 in a person's words, never the field's name (E2E-WEB cycle 12 W3); an id that is no workspace of
 *  theirs is decided at approval (WORKSPACE_CHOSEN_NOT_YOURS). */
export function workspaceIdsOf(b: Record<string, unknown>): string[] {
  const v = b.workspace_ids ?? [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.trim().length > 64)) throw badRequest(WORKSPACES_UNREADABLE);
  if (v.length > WORKSPACES_PER_APPROVAL) throw badRequest(TOO_MANY_WORKSPACES);
  return [...new Set((v as string[]).map((x) => x.trim()).filter(Boolean))];
}

/** Workspaces one approval may grant. */
export const WORKSPACES_PER_APPROVAL = 50;

/** An approval whose workspaces are not a list of workspace ids. */
export const WORKSPACES_UNREADABLE = "This approval doesn't say which of your workspaces the device may use, so nothing was approved. Tick your workspaces again.";

/** An approval naming more workspaces than one may grant. */
export const TOO_MANY_WORKSPACES = `One approval can give a device at most ${WORKSPACES_PER_APPROVAL} workspaces, so nothing was approved. Tick fewer workspaces.`;

/** A code longer than any align login shows. */
export const LONG_CODE = "That code is too long. Enter the code shown by align login.";

/** An approval or denial with no code. */
export const EMPTY_CODE = "Enter the code shown by align login.";

function pendingByCode(code: string, nowMs = Date.now()): RequestRow {
  const norm = normalizeUserCode(code);
  const r = norm ? get<RequestRow>("SELECT * FROM v2_device_requests WHERE user_code = ?", norm) : undefined;
  if (!r || r.state !== "pending" || Date.parse(r.expires_at) <= nowMs) throw new V2Error(404, "not_found", CODE_NOT_WAITING);
  return r;
}

export function lookupRequest(userId: string, code: string) {
  take(`device-lookup:${userId}`, 20, 10 * 60 * 1000);
  const r = pendingByCode(code);
  return { device_name: r.device_name, requested_at: r.created_at, age_seconds: Math.max(0, Math.round((Date.now() - Date.parse(r.created_at)) / 1000)), expires_at: r.expires_at };
}

/** `name` and `name (n)`: the names a pairing that asked for `name` may get. Null when `other` is not one of them, else
 *  its number (1 for the plain name). */
function nameNumber(name: string, other: string): number | null {
  if (other === name) return 1;
  const m = /^(.*) \((\d+)\)$/.exec(other);
  return m && m[1] === name ? Number(m[2]) : null;
}

/** The names of this person's live devices a pairing that asked for `name` would be told apart from (`name`, `name (2)`,
 *  ...), plain first (C8-3): a new `align login` on one of those machines keeps that machine's name, so the approval
 *  page names them instead of a name the device may never get. */
function sameNameDevices(userId: string, name: string): string[] {
  return all<{ name: string }>("SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL", userId)
    .map((d) => ({ name: d.name, n: nameNumber(name, d.name) }))
    .filter((d): d is { name: string; n: number } => d.n !== null)
    .sort((a, b) => a.n - b.n)
    .map((d) => d.name);
}

/** Approve or deny a pairing. Approving decides the device's name now that the person is known (W4): the name it asked
 *  for, or "<name> (n)" when one of their live devices (or another approved pairing of theirs waiting for its poll) has
 *  it. The answer carries it as `device_name`, with `asked_as`, so the page names the device as it is stored. */
export async function decideRequest(userId: string, code: string, decision: "approve" | "deny", wsIds: string[]) {
  take(`device-decide:${userId}`, 20, 10 * 60 * 1000);
  return tx(() => {
    const r = pendingByCode(code);
    if (decision === "deny") {
      run("UPDATE v2_device_requests SET state = 'denied', user_id = ? WHERE id = ?", userId, r.id);
      return { state: "denied" as const };
    }
    if (!wsIds.length) throw badRequest("Choose at least one workspace for this device");
    for (const ws of wsIds) if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, ws, userId)) throw new V2Error(404, "not_found", WORKSPACE_CHOSEN_NOT_YOURS);
    const name = distinctName(userId, r.device_name, null, heldNames(userId, r.id, Date.now()));
    run("UPDATE v2_device_requests SET state = 'approved', user_id = ?, ws_ids_json = ?, approved_name = ? WHERE id = ?", userId, JSON.stringify(wsIds), name, r.id);
    return { state: "approved" as const, device_name: name, asked_as: r.device_name, same_name: sameNameDevices(userId, r.device_name) };
  });
}

/** The approval's refusal for a ticked workspace that is not the person's (any more): deleted, left or removed from in
 *  another tab, say. Nothing is approved. */
export const WORKSPACE_CHOSEN_NOT_YOURS = "A workspace you ticked is not one of yours any more (it was deleted, or you left it or were removed from it), so nothing was approved. Tick your workspaces again.";

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

/** The Devices page's refusal for a workspace that is not the person's (any more): deleted, left or removed from (in
 *  another tab, say), or never theirs. */
export const WORKSPACE_NOT_YOURS = "This workspace is not one of yours any more (it was deleted, or you left it or were removed from it), so the device was given nothing.";

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
    // A workspace deleted, left or removed from in another tab, and one never theirs, read alike: what happened (W1).
    if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, wsId, userId)) throw new V2Error(404, "not_found", WORKSPACE_NOT_YOURS);
    if (get("SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?", deviceId, wsId)) throw conflict("already_granted", "This device already has this workspace");
    // The invite path's grant and audit row, as it stands.
    addWorkspaceToDevices(userId, wsId, [deviceId], at);
  });
  return { device_id: deviceId, workspace_id: wsId };
}

export function deviceOwnedBy(deviceId: string, userId: string): boolean {
  return !!get("SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ?", deviceId, userId);
}
