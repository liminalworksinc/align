import { randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { signPayload } from "../auth";
import { config, testServerClosesAt } from "../config";
import { HttpError } from "../errors";
import { withLock } from "../locks";
import type { Actor } from "../types";
import { agentEpochOf, readAuth, wsDir, type CustomWsId } from "../workspace";

// Connected AI apps, one grant per app sign-in, in <workspace>/oauth.json (deleted with the workspace). A grant holds
// the app's name and redirect host as it introduced itself, the role that approved it, the hash of its current
// refresh token (and the one before, to catch reuse) keyed with ALIGN_SECRET, so rotating the secret ends every
// connected app, and the agent epoch it was approved under: Restart and
// "Disconnect all" bump that epoch, so every grant from before stops at once. last_used_at is set by the first
// successful MCP call, and the workspace shows an app as connected only from then on.

export interface Grant {
  id: string;
  client_id: string;
  client_name: string;
  redirect_host: string;
  role: Actor;
  ep: number;
  created_at: string;
  last_used_at: string | null;
  refresh_hash: string;
  prev_refresh_hash: string | null;
  refresh_exp: number;
}

const MAX_GRANTS = 20;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USE_WRITE_MS = 5 * 60 * 1000;

const file = (ws: CustomWsId) => path.join(wsDir(ws), "oauth.json");
// Keyed with ALIGN_SECRET (domain-separated from session, agent and access tokens): a refresh token only works under
// the secret it was issued with, so rotating ALIGN_SECRET ends every connected app (docs/HOSTING.md).
const refreshHash = (v: string) => signPayload(`alr.${v}`);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Every MCP call checks its grant, so the file is read synchronously and cached by mtime, as auth.json is.
const g = globalThis as unknown as { __alignGrants?: Map<string, { mtimeMs: number; grants: Grant[] }>; __alignGrantUse?: Map<string, number> };
const cache = (g.__alignGrants ??= new Map());
const lastWrite = (g.__alignGrantUse ??= new Map());

export function readGrants(ws: CustomWsId): Grant[] {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file(ws)).mtimeMs;
  } catch (e) {
    cache.delete(ws);
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new HttpError(500, "This workspace could not be read");
  }
  const hit = cache.get(ws);
  if (hit && hit.mtimeMs === mtimeMs) return hit.grants;
  let grants: Grant[];
  try {
    const v = JSON.parse(readFileSync(file(ws), "utf8"));
    grants = Array.isArray(v?.grants) ? v.grants : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new HttpError(500, "This workspace could not be read");
  }
  cache.set(ws, { mtimeMs, grants });
  return grants;
}

/** Grants still valid under the workspace's current agent epoch. */
export function liveGrants(ws: CustomWsId): Grant[] {
  const auth = readAuth(ws);
  if (!auth) return [];
  const ep = agentEpochOf(auth);
  return readGrants(ws).filter((x) => x.ep === ep && x.refresh_exp > Date.now());
}

async function update<T>(ws: CustomWsId, fn: (grants: Grant[]) => { grants: Grant[]; out: T }): Promise<T> {
  return withLock(`oauth:${ws}`, async () => {
    if (!readAuth(ws)) throw new HttpError(404, "This workspace no longer exists");
    const { grants, out } = fn(readGrants(ws).map((x) => ({ ...x })));
    const tmp = `${file(ws)}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ grants }, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file(ws));
    cache.delete(ws);
    return out;
  });
}

/** The latest a refresh token may live: 7 days, and never past the end of the deletion date. */
function refreshExpiry(now: number): number {
  const del = config().deleteBy;
  const closes = del ? testServerClosesAt(del) : Infinity;
  return Math.min(now + REFRESH_TTL_MS, closes);
}

/** A refresh token names its workspace and grant so the token endpoint can find it: alr.<ws>.<grant>.<secret>. */
const refreshToken = (ws: CustomWsId, id: string, secret: string) => `alr.${ws}.${id}.${secret}`;

export function parseRefresh(token: unknown): { ws: string; id: string; secret: string } | null {
  if (typeof token !== "string") return null;
  const m = /^alr\.(w_[a-z2-7]{12})\.(gr_[A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return m ? { ws: m[1], id: m[2], secret: m[3] } : null;
}

/** A new grant id: the token endpoint takes one before creating the grant, so a replayed code can name it at once. */
export const newGrantId = () => `gr_${randomBytes(12).toString("base64url")}`;

export async function createGrant(ws: CustomWsId, a: { client_id: string; client_name: string; redirect_host: string; role: Actor }, id = newGrantId()): Promise<{ grant: Grant; refresh_token: string }> {
  const auth = readAuth(ws);
  if (!auth) throw new HttpError(404, "This workspace no longer exists");
  const secret = randomBytes(32).toString("base64url");
  const now = Date.now();
  const grant: Grant = {
    id,
    ...a,
    ep: agentEpochOf(auth),
    created_at: new Date(now).toISOString(),
    last_used_at: null,
    refresh_hash: refreshHash(secret),
    prev_refresh_hash: null,
    refresh_exp: refreshExpiry(now),
  };
  // Connecting the same app as the same team again replaces its earlier connection: the app has dropped that refresh
  // token, and the workspace shouldn't list one app twice.
  const kept = (list: Grant[]) => list.filter((x) => x.ep === grant.ep && !(x.client_id === grant.client_id && x.role === grant.role));
  await update(ws, (list) => ({ grants: [...kept(list).slice(-(MAX_GRANTS - 1)), grant], out: null }));
  return { grant, refresh_token: refreshToken(ws, grant.id, secret) };
}

/**
 * Rotate a refresh token. The presented secret must be the grant's current one, for the same client, under the
 * current epoch and before its expiry. Presenting the previous secret again means it was copied: the grant is
 * removed, so neither copy works any more (OAuth 2.1 refresh token rotation).
 */
export async function rotateGrant(ws: CustomWsId, id: string, secret: string, clientId: string): Promise<{ grant: Grant; refresh_token: string } | null> {
  const auth = readAuth(ws);
  if (!auth) return null;
  const ep = agentEpochOf(auth);
  const next = randomBytes(32).toString("base64url");
  return update(ws, (list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return { grants: list, out: null };
    const gr = list[i];
    const h = refreshHash(secret);
    if (gr.prev_refresh_hash && same(gr.prev_refresh_hash, h)) return { grants: list.filter((x) => x.id !== id), out: null };
    if (!same(gr.refresh_hash, h) || gr.client_id !== clientId || gr.ep !== ep || gr.refresh_exp <= Date.now()) return { grants: list, out: null };
    const rotated: Grant = { ...gr, prev_refresh_hash: gr.refresh_hash, refresh_hash: refreshHash(next) };
    list[i] = rotated;
    return { grants: list, out: { grant: rotated, refresh_token: refreshToken(ws, id, next) } };
  });
}

export async function removeGrant(ws: CustomWsId, id: string): Promise<Grant | null> {
  return update(ws, (list) => ({ grants: list.filter((x) => x.id !== id), out: list.find((x) => x.id === id) ?? null }));
}

export async function clearGrants(ws: CustomWsId): Promise<number> {
  return update(ws, (list) => ({ grants: [], out: list.length }));
}

/** Record a successful MCP call: the first one at once (that is what makes an app show as connected), then at most
 *  every 5 minutes per grant, so the file isn't rewritten on every tool call. Failures are logged, never thrown. */
export function noteGrantUse(ws: CustomWsId, id: string) {
  const now = Date.now();
  if (now - (lastWrite.get(id) ?? 0) < USE_WRITE_MS) return;
  lastWrite.set(id, now);
  while (lastWrite.size > 10_000) lastWrite.delete(lastWrite.keys().next().value!);
  void update(ws, (list) => ({ grants: list.map((x) => (x.id === id ? { ...x, last_used_at: new Date(now).toISOString() } : x)), out: null })).catch((e) =>
    console.error("grant use not recorded", (e as Error)?.name),
  );
}
