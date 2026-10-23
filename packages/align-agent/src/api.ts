// Device API client for docs/v2/WIRE.md. Bearer access tokens (1 h), rotating refresh tokens bound to the device
// Ed25519 key. A file lock serializes refresh between concurrent CLI and sync processes, because reusing an old refresh token
// revokes the device.
import fs from "node:fs";
import type { Ctx } from "./context.ts";
import { loadDeviceKey, refreshMessage } from "./keys.ts";
import { layout } from "./shared/layout.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";

export interface Credentials {
  server_url: string;
  device_id: string;
  access_token: string | null;
  access_expires_at: string | null;
  refresh_token: string | null;
  user: { id: string; name: string; email: string } | null;
  signed_out?: boolean;
  signed_out_reason?: string;
}

export class SignedOut extends Error {}
export class NetworkError extends Error {}
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

export function signedIn(home: string): boolean {
  const c = loadCredentials(home);
  return !!(c && !c.signed_out && c.refresh_token);
}

export interface Resp {
  status: number;
  json: any;
  headers: Headers;
}

const TIMEOUT_MS = 15_000;

export async function rawRequest(base: string, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Resp> {
  let res: Response;
  try {
    res = await fetch(base.replace(/\/$/, "") + path, {
      method,
      headers: { ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), accept: "application/json", ...(opts.headers || {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
  const text = await res.text().catch(() => "");
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, headers: res.headers };
}

function withLock<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const file = layout.refreshLock(home);
  const deadline = Date.now() + 15_000;
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

export function markSignedOut(home: string, reason: string): void {
  const c = loadCredentials(home);
  if (!c) return;
  saveCredentials(home, { ...c, access_token: null, access_expires_at: null, refresh_token: null, signed_out: true, signed_out_reason: reason });
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
      markSignedOut(ctx.home, "device key missing");
      throw new SignedOut("device key missing");
    }
    const ts = new Date().toISOString();
    const sig = key.sign(refreshMessage(c.device_id, c.refresh_token, ts));
    const r = await rawRequest(c.server_url, "POST", "/api/v2/device/refresh", { body: { device_id: c.device_id, refresh_token: c.refresh_token, ts, sig } });
    if (r.status === 200 && r.json?.access_token && r.json?.refresh_token) {
      const next: Credentials = {
        ...c,
        access_token: r.json.access_token,
        access_expires_at: new Date(Date.now() + Number(r.json.expires_in || 3600) * 1000).toISOString(),
        refresh_token: r.json.refresh_token,
      };
      saveCredentials(ctx.home, next);
      return next;
    }
    if (r.status === 400 || r.status === 401) {
      markSignedOut(ctx.home, r.json?.error || `refresh ${r.status}`);
      throw new SignedOut("signed out by server");
    }
    throw new HttpError(r.status, r.json?.error ?? null, r.json);
  });
}

/** Authenticated device request. Retries once after a forced refresh on 401; a second 401 signs the device out. */
export async function api(ctx: Ctx, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Resp> {
  let c = await refreshIfNeeded(ctx);
  let r = await rawRequest(c.server_url, method, path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${c.access_token}` } });
  if (r.status === 401) {
    c = await refreshIfNeeded(ctx, true);
    r = await rawRequest(c.server_url, method, path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${c.access_token}` } });
    if (r.status === 401) {
      markSignedOut(ctx.home, "access rejected");
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
