// Device API client for docs/v2/WIRE.md. Bearer access tokens (1 h), rotating refresh tokens bound to the device
// Ed25519 key. A file lock serializes refresh between concurrent CLI and sync processes, because reusing an old refresh token
// revokes the device.
import crypto from "node:crypto";
import fs from "node:fs";
import type { Ctx } from "./context.ts";
import { loadDeviceKey, refreshMessage } from "./keys.ts";
import { layout } from "./shared/layout.ts";
import { b64url, readJson, writeFileAtomic, writeJsonAtomic } from "./shared/fsx.ts";
import type { MeFile } from "./shared/types.ts";

export interface Credentials {
  server_url: string;
  device_id: string;
  access_token: string | null;
  access_expires_at: string | null;
  refresh_token: string | null;
  user: { id: string; name: string; email: string } | null;
  signed_out?: boolean;
  signed_out_reason?: string;
  /** How far the server's clock is ahead of this computer's (ms), learned from a `clock_skew` answer or measured from
   *  the `Date` header of the server's answers; refreshes sign their timestamp with it and every time the CLI sends is
   *  put on the server's clock with it. Absent when the clocks agree (within a minute). */
  clock_offset_ms?: number;
}

/** Offsets under a minute count as the clocks agreeing (the server allows 5 minutes either way). */
export const CLOCK_TOLERANCE_MS = 60_000;
/** A measured offset replaces the saved one only when they differ by more than this, so the offset stays stable. */
const CLOCK_DRIFT_MS = 30_000;

/** The saved offset of the server's clock from this computer's (0 when they agree). */
export function clockOffset(home: string): number {
  return Number(loadCredentials(home)?.clock_offset_ms) || 0;
}

/** A local time as the server's clock reads it (a time the CLI sends). Unchanged when the clocks agree. With `clamp`,
 *  never later than the server's now: a start or a turn is never in the future. */
export function serverIso(iso: string, offset: number, clamp = false): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || (!offset && !clamp)) return iso;
  const at = clamp ? Math.min(t + offset, Date.now() + offset) : t + offset;
  return at === t ? iso : new Date(at).toISOString();
}

export class SignedOut extends Error {}
export class NetworkError extends Error {}
/** The server refused a refresh because this computer's clock is off: the device stays signed in and retries later. */
export class ClockSkew extends NetworkError {}

/** "10 minutes ahead of" / "3 minutes behind" for an offset (server minus local, ms). */
export function clockWords(offsetMs: number): string {
  const min = Math.max(1, Math.round(Math.abs(offsetMs) / 60_000));
  return `${min} minute${min === 1 ? "" : "s"} ${offsetMs < 0 ? "ahead of" : "behind"}`;
}
export class HttpError extends Error {
  status: number;
  code: string | null;
  body: unknown;
  constructor(status: number, code: string | null, body: unknown) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function loadCredentials(home: string): Credentials | null {
  return readJson<Credentials>(layout.credentials(home));
}

export function saveCredentials(home: string, c: Credentials): void {
  writeJsonAtomic(layout.credentials(home), c, 0o600);
}

/** Why this machine is signed out, in words for `align status`. The stored reason is the refusal's `reason` when the
 *  server gave one (why it no longer knows or accepts this device), else its error code. */
export function signedOutWords(reason: string | undefined): string {
  if (!reason) return "signed out";
  if (reason === "logout") return "you ran `align logout`";
  if (reason === "unknown_device") return "the Align server no longer knows this device: its account was deleted (or the server's data was reset)";
  if (reason === "revoked_on_web") return "this device was revoked on the web (Devices page)";
  if (reason === "signed_out_everywhere") return "you signed out everywhere on the web and chose to unpair your devices too";
  if (reason === "refresh_reuse") return "the server revoked this device because one of its old sign-in tokens was used again (a copied or restored Align folder, say)";
  if (reason === "invalid_grant" || reason === "access rejected" || reason === "revoked") {
    return "this device was unpaired on the web (Devices page, or signing out everywhere), its account was deleted, or its sign-in expired";
  }
  if (reason === "device key missing") return "this machine's device key is missing";
  return reason;
}

export function signedIn(home: string): boolean {
  const c = loadCredentials(home);
  return !!(c && !c.signed_out && c.refresh_token);
}

export interface Resp {
  status: number;
  json: any;
  headers: Headers;
  /** The server's clock minus this computer's (ms), from the answer's `Date` header; null without one. */
  clockOffsetMs: number | null;
}

const TIMEOUT_MS = 15_000;

/** The first time, in this process since the last reset, the server could not be reached or answered 5xx. The sync
 *  pass reports it (`align sync`, `align status`, `logs/align.log`), so an unreachable server is never silent. */
let trouble: string | null = null;

export function resetServerTrouble(): void {
  trouble = null;
}

export function serverTrouble(): string | null {
  return trouble;
}

/** Why a fetch failed, in words: the error code under "fetch failed", or a timeout. */
function failureWords(e: unknown, timeoutMs: number): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err?.name === "TimeoutError" || /due to timeout/.test(String(err?.message))) return `no answer within ${Math.round(timeoutMs / 1000)} s`;
  const code = err?.cause?.code;
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host not found";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "connection reset";
  return code || err?.cause?.message || err?.message || "fetch failed";
}

export async function rawRequest(base: string, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Resp> {
  let res: Response;
  const server = base.replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const t0 = Date.now();
  try {
    res = await fetch(server + path, {
      method,
      headers: { ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), accept: "application/json", ...(opts.headers || {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = `could not reach the Align server at ${server} (${failureWords(e, timeoutMs)})`;
    trouble ??= msg;
    throw new NetworkError(msg);
  }
  if (res.status >= 500) trouble ??= `the Align server at ${server} answered HTTP ${res.status}`;
  // The Date header has whole seconds: the server's time lies within the second it names, read at mid-request.
  const date = Date.parse(res.headers.get("date") || "");
  const clockOffsetMs = Number.isNaN(date) ? null : date + 500 - Math.round((t0 + Date.now()) / 2);
  const text = await res.text().catch(() => "");
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, headers: res.headers, clockOffsetMs };
}

/** Run `fn` holding the refresh lock: every write of the credentials and the device key happens under it (a refresh, a
 *  clock offset, a new pairing from `align login`, `align logout`), so none of them is lost to another process. */
export function withLock<T>(home: string, fn: () => Promise<T>, waitMs = 15_000): Promise<T> {
  const file = layout.refreshLock(home);
  const deadline = Date.now() + waitMs;
  const attempt = async (): Promise<T> => {
    let fd: number | null = null;
    try {
      fd = fs.openSync(file, "wx", 0o600);
    } catch {
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > 20_000) fs.unlinkSync(file);
      } catch {
        /* raced */
      }
      if (Date.now() > deadline) throw new NetworkError("refresh lock busy");
      await new Promise((r) => setTimeout(r, 100));
      return attempt();
    }
    try {
      return await fn();
    } finally {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  };
  return attempt();
}

/** Mark this machine signed out, unless `deviceId` is given and the credentials are now another device's: a refresh or
 *  a request refused for the device it was made for never signs out a newer pairing (C3-1). */
export function markSignedOut(home: string, reason: string, deviceId?: string): void {
  const c = loadCredentials(home);
  if (!c || (deviceId && c.device_id !== deviceId)) return;
  saveCredentials(home, { ...c, access_token: null, access_expires_at: null, refresh_token: null, signed_out: true, signed_out_reason: reason });
  // The hooks read me.json, never credentials: it says so, so `::align share` is refused instead of claimed (N4). The
  // next `align login` writes a fresh one.
  const me = readJson<MeFile>(layout.me(home));
  if (me && !me.signed_out) writeJsonAtomic(layout.me(home), { ...me, signed_out: true });
}

/** Write `c` only while it is still the current device's credentials (under the refresh lock, which a new pairing
 *  also takes): a refresh never writes one device's tokens over another's (C3-1). */
function saveForDevice(home: string, c: Credentials): void {
  if (loadCredentials(home)?.device_id === c.device_id) saveCredentials(home, c);
}

/** Save (or, with 0, clear) the clock offset, under the refresh lock so it never races a token rotation. */
export async function saveClockOffset(ctx: Ctx, offset: number): Promise<void> {
  await withLock(ctx.home, async () => {
    const c = loadCredentials(ctx.home);
    if (!c || c.signed_out) return;
    const upd: Credentials = { ...c };
    if (offset) upd.clock_offset_ms = offset;
    else delete upd.clock_offset_ms;
    saveCredentials(ctx.home, upd);
  }).catch(() => undefined);
}

/** Items of a batch the server did not take (`refused: [{index, reason}]` on activity and steering, C3-4). */
export interface Refused {
  index: number;
  reason: string;
}

/**
 * POST a batch of items that carry times (`at`, this computer's own) on the server's clock, never later than its now.
 * Items the server refuses as `clock_skew` (this computer's clock runs ahead and Align did not know yet) are sent once
 * more on the offset the answer's `server_time` gives; whatever is still refused is logged with why, never dropped
 * silently (C3-4). Returns the answer (null when the server could not be reached) and the items still refused.
 */
export async function postTimed<T extends { at: string }>(ctx: Ctx, path: string, field: string, items: T[], what: string): Promise<{ r: Resp | null; refused: Refused[] }> {
  const send = (list: T[]) => {
    const offset = clockOffset(ctx.home);
    return api(ctx, "POST", path, { body: { [field]: list.map((i) => ({ ...i, at: serverIso(i.at, offset, true) })) } }).catch(() => null);
  };
  const r = await send(items);
  if (!r || r.status < 200 || r.status >= 300) return { r, refused: [] };
  let refused = (Array.isArray(r.json?.refused) ? r.json.refused : []) as Refused[];
  const skewed = refused.filter((x) => x.reason === "clock_skew" && items[x.index]);
  const server = Date.parse(String(r.json?.server_time ?? ""));
  if (skewed.length && !Number.isNaN(server)) {
    const offset = server - Date.now();
    if (Math.abs(offset) >= CLOCK_TOLERANCE_MS && Math.abs(offset - clockOffset(ctx.home)) >= CLOCK_TOLERANCE_MS) {
      await saveClockOffset(ctx, offset);
      ctx.log(`clock: the server refused ${what} as clock_skew; this computer's clock is ${clockWords(offset)} the server's`);
    }
    const again = skewed.map((x) => items[x.index]);
    const r2 = await send(again);
    const still = r2 && r2.status >= 200 && r2.status < 300 ? ((Array.isArray(r2.json?.refused) ? r2.json.refused : []) as Refused[]) : again.map((_, index) => ({ index, reason: "clock_skew" }));
    // Indexes back into `items`.
    refused = [...refused.filter((x) => x.reason !== "clock_skew"), ...still.map((x) => ({ index: skewed[x.index]?.index ?? x.index, reason: x.reason }))];
  }
  if (refused.length) {
    const why = [...new Set(refused.map((x) => x.reason))].join(", ");
    ctx.log(`${what}: the server refused ${refused.length} of ${items.length} (${why}); they are not sent again`);
  }
  return { r, refused };
}

/** Whether an answer in this process has measured the server's clock (its `Date` header) yet. */
let measuredHere = false;

export function clockMeasured(): boolean {
  return measuredHere;
}

/**
 * Keep the saved clock offset in step with what the server's answers say (their `Date` header): saved when it is a
 * minute or more, replaced when it moved by more than 30 s, and cleared without a warning once the clocks agree again.
 * Written under the refresh lock, so it never races a token rotation.
 */
async function noteClock(ctx: Ctx, measured: number | null): Promise<void> {
  if (measured === null || !Number.isFinite(measured)) return;
  measuredHere = true;
  const saved = clockOffset(ctx.home);
  const next = Math.abs(measured) < CLOCK_TOLERANCE_MS ? 0 : measured;
  if (next === 0 ? saved === 0 : Math.abs(next - saved) <= CLOCK_DRIFT_MS) return;
  await saveClockOffset(ctx, next);
  if (!next) return ctx.log("clock: this computer's clock agrees with the Align server's again; the saved offset is cleared");
  ctx.log(`clock: this computer's clock is ${clockWords(next)} the server's; Align sends times on the server's clock`);
  process.stderr.write(`align: this computer's clock is ${clockWords(next)} the Align server's. Align puts what it sends on the server's time; set the system clock to update automatically.\n`);
}

/** Refresh the access token if it is missing or within 2 minutes of expiry (or `force`). */
export async function refreshIfNeeded(ctx: Ctx, force = false): Promise<Credentials> {
  const initial = loadCredentials(ctx.home);
  if (!initial || initial.signed_out || !initial.refresh_token) throw new SignedOut("not signed in");
  const fresh = (c: Credentials) => c.access_token && c.access_expires_at && Date.parse(c.access_expires_at) - Date.now() > 120_000;
  if (!force && fresh(initial)) return initial;
  return withLock(ctx.home, async () => {
    const c = loadCredentials(ctx.home);
    if (!c || c.signed_out || !c.refresh_token) throw new SignedOut("not signed in");
    // Someone else refreshed while we waited.
    if (c.refresh_token !== initial.refresh_token && fresh(c)) return c;
    const key = loadDeviceKey(ctx.home);
    if (!key) {
      markSignedOut(ctx.home, "device key missing", c.device_id);
      throw new SignedOut("device key missing");
    }
    const attempt = (offset: number) => {
      const ts = new Date(Date.now() + offset).toISOString();
      const sig = key.sign(refreshMessage(c.device_id, c.refresh_token!, ts));
      return rawRequest(c.server_url, "POST", "/api/v2/device/refresh", { body: { device_id: c.device_id, refresh_token: c.refresh_token, ts, sig } });
    };
    let offset = Number(c.clock_offset_ms) || 0;
    let r = await attempt(offset);
    if (r.status === 400 && r.json?.error === "clock_skew") {
      // This computer's clock is off by more than the server allows. That is not a revocation: keep the tokens, say so,
      // and sign again with the server's time (the server still checks the timestamp against its own clock).
      const server = Date.parse(String(r.json?.server_time ?? ""));
      if (Number.isNaN(server)) throw new ClockSkew(`this computer's clock is off from the Align server's; fix the system clock (you are still signed in)`);
      offset = server - Date.now();
      const words = clockWords(offset);
      if (Math.abs(offset) < CLOCK_TOLERANCE_MS) {
        // The clock is right and the saved offset was stale (the clock was fixed since): drop it, no warning (N3).
        offset = 0;
        ctx.log("refresh: this computer's clock agrees with the server's again; the saved offset is cleared");
        const fixed: Credentials = { ...c };
        delete fixed.clock_offset_ms;
        saveCredentials(ctx.home, fixed);
      } else {
        ctx.log(`refresh: this computer's clock is ${words} the server's; signing with the server's time`);
        process.stderr.write(`align: this computer's clock is ${words} the Align server's. Align used the server's time and you stay signed in; set the system clock to update automatically.\n`);
        saveCredentials(ctx.home, { ...c, clock_offset_ms: offset });
      }
      r = await attempt(offset);
      if (r.status === 400 && r.json?.error === "clock_skew") throw new ClockSkew(`this computer's clock is ${words} the Align server's; fix the system clock (you are still signed in)`);
    }
    if (r.status === 200 && r.json?.access_token && r.json?.refresh_token) {
      const next: Credentials = {
        ...c,
        access_token: r.json.access_token,
        access_expires_at: new Date(Date.now() + Number(r.json.expires_in || 3600) * 1000).toISOString(),
        refresh_token: r.json.refresh_token,
      };
      // Within a minute counts as agreeing (the server allows 5); a bigger offset is kept for the next refresh. The
      // answer's own Date header says what the offset is now, so a stale one is replaced or cleared (N3).
      const now = r.clockOffsetMs ?? offset;
      if (Math.abs(now) >= CLOCK_TOLERANCE_MS) next.clock_offset_ms = Math.abs(now - offset) <= CLOCK_DRIFT_MS && offset ? offset : now;
      else delete next.clock_offset_ms;
      saveForDevice(ctx.home, next);
      return next;
    }
    if (r.status === 400 || r.status === 401) {
      markSignedOut(ctx.home, (typeof r.json?.reason === "string" && /^[a-z_]{1,40}$/.test(r.json.reason) ? r.json.reason : null) || r.json?.error || `refresh ${r.status}`, c.device_id);
      throw new SignedOut("signed out by server");
    }
    throw new HttpError(r.status, r.json?.error ?? null, r.json);
  });
}

/** Authenticated device request. Retries once after a forced refresh on 401; a second 401 signs the device out. */
export async function api(ctx: Ctx, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Resp> {
  let c = await refreshIfNeeded(ctx);
  let r = await rawRequest(c.server_url, method, path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${c.access_token}` } });
  await noteClock(ctx, r.clockOffsetMs);
  if (r.status === 401) {
    c = await refreshIfNeeded(ctx, true);
    r = await rawRequest(c.server_url, method, path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${c.access_token}` } });
    if (r.status === 401) {
      // A new pairing committed meanwhile (`align login`): this answer was for the device it replaced.
      if (loadCredentials(ctx.home)?.device_id !== c.device_id) return r;
      markSignedOut(ctx.home, "access rejected", c.device_id);
      throw new SignedOut("signed out by server");
    }
  }
  return r;
}

export async function apiOk(ctx: Ctx, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<any> {
  const r = await api(ctx, method, path, opts);
  if (r.status >= 200 && r.status < 300) return r.json;
  throw new HttpError(r.status, r.json?.error ?? null, r.json);
}

// ---------- a revoke that waits for the server (logout while it could not be reached) ----------
/** What `align logout` keeps when it could not reach the server, so the old device is still revoked later. */
export interface PendingRevoke {
  server_url: string;
  device_id: string;
  access_token: string | null;
  access_expires_at: string | null;
  refresh_token: string | null;
  /** The old device key (PKCS#8 PEM), to sign a refresh when the access token has expired. */
  key_pem: string | null;
  since: string;
}

export function loadPendingRevoke(home: string): PendingRevoke | null {
  return readJson<PendingRevoke>(layout.pendingRevoke(home));
}

export function savePendingRevoke(home: string, p: PendingRevoke): void {
  writeJsonAtomic(layout.pendingRevoke(home), p, 0o600);
}

/** What revokes the device of credentials `c` later: its tokens and the device key now on disk. */
export function pendingRevokeFor(home: string, c: Credentials): PendingRevoke {
  let keyPem: string | null = null;
  try {
    keyPem = fs.readFileSync(layout.deviceKey(home), "utf8");
  } catch {
    keyPem = null;
  }
  return {
    server_url: c.server_url,
    device_id: c.device_id,
    access_token: c.access_token,
    access_expires_at: c.access_expires_at,
    refresh_token: c.refresh_token,
    key_pem: keyPem,
    since: new Date().toISOString(),
  };
}

/** How long `align login` and `align logout` wait for a refresh in flight (longer than a refresh's own timeout). */
const PAIRING_LOCK_MS = 40_000;

/**
 * Commit a new pairing (`align login`, after the token answer): under the refresh lock, so a sync's refresh in flight
 * finishes first and can't write the old device's tokens over the new ones, keep what revokes the device it replaces
 * (its latest tokens and its key, in `revoke.json`, the same mechanism as an offline logout), then write the new key and
 * credentials together. Until then the old pairing, key included, is untouched: an aborted login changes nothing
 * (C3-1, C3-2, C3-3). The caller then revokes the old device with `revokePending`. Returns the replaced device's id.
 */
export async function commitPairing(ctx: Ctx, creds: Credentials, keyPem: string): Promise<string | null> {
  return withLock(
    ctx.home,
    async () => {
      const before = loadCredentials(ctx.home);
      const replaced = before && !before.signed_out && before.refresh_token && before.device_id !== creds.device_id ? before : null;
      if (replaced) savePendingRevoke(ctx.home, pendingRevokeFor(ctx.home, replaced));
      writeFileAtomic(layout.deviceKey(ctx.home), keyPem, 0o600);
      const next: Credentials = { ...creds };
      if (before?.clock_offset_ms) next.clock_offset_ms = before.clock_offset_ms;
      saveCredentials(ctx.home, next);
      return replaced?.device_id ?? null;
    },
    PAIRING_LOCK_MS,
  );
}

/**
 * `align logout`, locally, under the refresh lock (so a refresh in flight can't write tokens back afterwards): keep what
 * revokes the device when the server could not be told (`revoked` false), mark the credentials signed out and remove
 * the device key. Only for the device `deviceId` the caller signed out; a pairing that replaced it meanwhile is kept.
 */
export async function signOutLocally(ctx: Ctx, deviceId: string, revoked: boolean): Promise<boolean> {
  return withLock(
    ctx.home,
    async () => {
      const latest = loadCredentials(ctx.home);
      if (!latest || latest.device_id !== deviceId) return false;
      if (!revoked && !latest.signed_out) savePendingRevoke(ctx.home, pendingRevokeFor(ctx.home, latest));
      markSignedOut(ctx.home, "logout", deviceId);
      fs.rmSync(layout.deviceKey(ctx.home), { force: true });
      return true;
    },
    PAIRING_LOCK_MS,
  );
}

/**
 * Revoke a device this machine signed out of while the server could not be reached (`align logout` offline), so its
 * sessions end on the server instead of staying shared forever. Runs before anything else at the next contact: the
 * next `align login` and every sync pass. Uses the old access token, or, when it has expired, signs a refresh with
 * the old key first. "revoked" once the server has revoked it, "already" when the server no longer accepted it at all
 * (it was revoked on the web meanwhile), "pending" while the server can't be reached (it is kept for the next contact),
 * "none" when nothing waits.
 */
export async function revokePending(ctx: Ctx): Promise<"none" | "revoked" | "already" | "pending"> {
  const p = loadPendingRevoke(ctx.home);
  if (!p) return "none";
  const del = (token: string) => rawRequest(p.server_url, "DELETE", "/api/v2/devices/self", { headers: { authorization: `Bearer ${token}` } });
  const seen: string[] = [];
  try {
    let done = false;
    if (p.access_token && (!p.access_expires_at || Date.parse(p.access_expires_at) - Date.now() > 30_000)) {
      const r = await del(p.access_token);
      seen.push(`DELETE ${r.status}`);
      if (r.status >= 500) return "pending";
      done = r.status === 204 || r.status === 200;
    }
    if (!done && p.refresh_token && p.key_pem) {
      const priv = crypto.createPrivateKey(p.key_pem);
      const refresh = (offset: number) => {
        const ts = new Date(Date.now() + offset).toISOString();
        const sig = b64url(crypto.sign(null, Buffer.from(refreshMessage(p.device_id, p.refresh_token!, ts), "utf8"), priv));
        return rawRequest(p.server_url, "POST", "/api/v2/device/refresh", { body: { device_id: p.device_id, refresh_token: p.refresh_token, ts, sig } });
      };
      let r = await refresh(clockOffset(ctx.home));
      if (r.status === 400 && r.json?.error === "clock_skew" && !Number.isNaN(Date.parse(String(r.json?.server_time)))) r = await refresh(Date.parse(String(r.json.server_time)) - Date.now());
      seen.push(`refresh ${r.status}`);
      if (r.status >= 500) return "pending";
      if (r.status === 200 && r.json?.access_token) {
        const d = await del(r.json.access_token);
        seen.push(`DELETE ${d.status}`);
        if (d.status >= 500) return "pending";
        done = d.status === 204 || d.status === 200;
      }
      // Otherwise (400/401) the server no longer accepts this device. Revoked as `logout` means by a DELETE with its own
      // token, which only this machine held: this revoke got through, though its answer was lost (a dropped connection,
      // say). Any other reason: someone revoked it on the web meanwhile.
      if (r.status === 401 && r.json?.reason === "logout") done = true;
    }
    fs.rmSync(layout.pendingRevoke(ctx.home), { force: true });
    if (!done) {
      // An access token the server refuses and no refresh it accepts: someone revoked it already.
      ctx.log(`device ${p.device_id}, which this machine signed out of at ${p.since} while ${p.server_url} could not be reached, was already revoked (${seen.join(", ") || "no token left to use"})`);
      return "already";
    }
    ctx.log(`revoked device ${p.device_id}, which this machine signed out of at ${p.since} while ${p.server_url} could not be reached`);
    return "revoked";
  } catch (e) {
    if (e instanceof NetworkError) return "pending";
    throw e;
  }
}
