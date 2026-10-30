import { randomBytes, timingSafeEqual } from "node:crypto";
import { signPayload } from "../secret";
import { all, audit, get, run, tx } from "../v2/db";
import { notFound } from "../v2/errors";
import { nowIso } from "../v2/ids";
import type { PolicyPrincipal } from "../v2/policy";
import { pinClient } from "./clients";

// Connected AI apps, one grant per app sign-in, in the v2 database (v2_oauth_grants). A grant belongs to one person in
// one workspace: it reads as that person (lib/mcp/register.ts) and ends when their membership does (lib/v2/lifecycle.ts
// revokes it when they leave or are removed, or the workspace is deleted; the foreign key cascades as a backstop).
// A grant holds the app's name and redirect host as it introduced itself, the hash of its current refresh token (and
// the one before, to catch reuse) keyed with ALIGN_SECRET, and which ALIGN_SECRET it was made under (kid): after a
// rotation its tokens can never work again, so it is treated as gone and dropped on that person's next grant. The
// refresh expiry is set once, at creation, and rotation never extends it. A grant records the scopes the person
// allowed (`scope`, space-separated; lib/oauth/server.ts) and rotation never changes them. last_used_at is set by MCP
// calls, at most every 5 minutes.

export interface Grant {
  id: string;
  ws_id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  redirect_host: string;
  created_at: string;
  last_used_at: string | null;
  refresh_hash: string;
  prev_refresh_hash: string | null;
  refresh_exp: number;
  kid: string;
  /** The allowed scopes, space-separated: "goals:read", or "goals:read changes:evidence". */
  scope: string;
}

const MAX_GRANTS = 20; // per person per workspace
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USE_WRITE_MS = 5 * 60 * 1000;
export const GRANT_ID = /^gr_[A-Za-z0-9_-]{16}$/;

// Keyed with ALIGN_SECRET (domain-separated from access tokens): a refresh token only works under
// the secret it was issued with, so rotating ALIGN_SECRET ends every connected app (docs/HOSTING.md).
const refreshHash = (v: string) => signPayload(`alr.${v}`);
/** Names the current ALIGN_SECRET without revealing it. */
const grantKid = () => signPayload("align-grant-kid").slice(0, 16);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isMember = (ws: string, userId: string) => !!get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", ws, userId);

/** A grant that still works: under the current ALIGN_SECRET, before its refresh expiry, its person still a member. */
export function liveGrant(id: string): Grant | null {
  const g = get<Grant>("SELECT * FROM v2_oauth_grants WHERE id = ?", id);
  if (!g || g.kid !== grantKid() || g.refresh_exp <= Date.now() || !isMember(g.ws_id, g.user_id)) return null;
  return g;
}

/** The latest a refresh token may live: 7 days. */
function refreshExpiry(now: number): number {
  return now + REFRESH_TTL_MS;
}

/** A refresh token names its workspace and grant so the token endpoint can find it: alr.<ws>.<grant>.<secret>. */
const refreshToken = (ws: string, id: string, secret: string) => `alr.${ws}.${id}.${secret}`;

export function parseRefresh(token: unknown): { ws: string; id: string; secret: string } | null {
  if (typeof token !== "string") return null;
  const m = /^alr\.(ws_[a-z2-7]{24})\.(gr_[A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return m ? { ws: m[1], id: m[2], secret: m[3] } : null;
}

/** A new grant id: the token endpoint takes one before creating the grant, so a replayed code can name it at once. */
export const newGrantId = () => `gr_${randomBytes(12).toString("base64url")}`;

/** The scopes a grant holds, or null if there is no such grant. */
export const grantScope = (ws: string, id: string) => get<{ scope: string }>("SELECT scope FROM v2_oauth_grants WHERE id = ? AND ws_id = ?", id, ws)?.scope ?? null;

/** Create the grant when a code is exchanged. Null when the person is no longer a member (or the workspace is gone). */
export async function createGrant(
  a: { ws: string; user_id: string; client_id: string; client_name: string; redirect_host: string; scopes: string[] },
  id = newGrantId(),
): Promise<{ grant: Grant; refresh_token: string } | null> {
  const secret = randomBytes(32).toString("base64url");
  const now = Date.now();
  const grant: Grant = {
    id,
    ws_id: a.ws,
    user_id: a.user_id,
    client_id: a.client_id,
    client_name: a.client_name,
    redirect_host: a.redirect_host,
    created_at: new Date(now).toISOString(),
    last_used_at: null,
    refresh_hash: refreshHash(secret),
    prev_refresh_hash: null,
    refresh_exp: refreshExpiry(now),
    kid: grantKid(),
    scope: a.scopes.join(" "),
  };
  const ok = await tx(() => {
    if (!isMember(a.ws, a.user_id)) return false;
    // Connecting the same app as the same person again replaces the earlier connection: the app has dropped that
    // refresh token, and the workspace shouldn't list one app twice. Grants made under an older ALIGN_SECRET go too.
    run("DELETE FROM v2_oauth_grants WHERE ws_id = ? AND user_id = ? AND (client_id = ? OR kid <> ?)", a.ws, a.user_id, a.client_id, grant.kid);
    const keep = all<{ id: string }>("SELECT id FROM v2_oauth_grants WHERE ws_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC", a.ws, a.user_id);
    for (const old of keep.slice(MAX_GRANTS - 1)) run("DELETE FROM v2_oauth_grants WHERE id = ?", old.id);
    run(
      `INSERT INTO v2_oauth_grants (id, ws_id, user_id, client_id, client_name, redirect_host, created_at, last_used_at, refresh_hash, prev_refresh_hash, refresh_exp, kid, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)`,
      grant.id,
      grant.ws_id,
      grant.user_id,
      grant.client_id,
      grant.client_name,
      grant.redirect_host,
      grant.created_at,
      grant.refresh_hash,
      grant.refresh_exp,
      grant.kid,
      grant.scope,
    );
    return true;
  });
  if (!ok) return null;
  pinClient(grant.client_id, grant.refresh_exp);
  return { grant, refresh_token: refreshToken(grant.ws_id, grant.id, secret) };
}

/**
 * Rotate a refresh token. The presented secret must be the grant's current one, for the same client, before its
 * expiry, while the person is still a member. Presenting the previous secret again means it was copied: the grant is
 * removed, so neither copy works any more (OAuth 2.1 refresh token rotation).
 */
export async function rotateGrant(ws: string, id: string, secret: string, clientId: string): Promise<{ grant: Grant; refresh_token: string } | null> {
  const next = randomBytes(32).toString("base64url");
  return tx(() => {
    const gr = get<Grant>("SELECT * FROM v2_oauth_grants WHERE id = ? AND ws_id = ?", id, ws);
    if (!gr) return null;
    const h = refreshHash(secret);
    if (gr.prev_refresh_hash && same(gr.prev_refresh_hash, h)) {
      run("DELETE FROM v2_oauth_grants WHERE id = ?", id);
      return null;
    }
    if (!same(gr.refresh_hash, h) || gr.client_id !== clientId || gr.kid !== grantKid() || gr.refresh_exp <= Date.now() || !isMember(gr.ws_id, gr.user_id)) return null;
    const rotated: Grant = { ...gr, prev_refresh_hash: gr.refresh_hash, refresh_hash: refreshHash(next) };
    run("UPDATE v2_oauth_grants SET refresh_hash = ?, prev_refresh_hash = ? WHERE id = ?", rotated.refresh_hash, rotated.prev_refresh_hash, id);
    pinClient(rotated.client_id, rotated.refresh_exp);
    return { grant: rotated, refresh_token: refreshToken(ws, id, next) };
  });
}

/** Remove one grant (a replayed authorization code). */
export async function removeGrant(id: string): Promise<void> {
  await tx(() => run("DELETE FROM v2_oauth_grants WHERE id = ?", id));
}

/** Revoke every grant of this person in this workspace. Synchronous, so member removal (lib/v2/lifecycle.ts) calls it
 *  inside its own tx(). */
export function revokeGrantsFor(wsId: string, userId: string): number {
  return run("DELETE FROM v2_oauth_grants WHERE ws_id = ? AND user_id = ?", wsId, userId);
}

/** Revoke every grant in this workspace, inside workspace deletion's tx() (lib/v2/lifecycle.ts). */
export function revokeWorkspaceGrants(wsId: string): number {
  return run("DELETE FROM v2_oauth_grants WHERE ws_id = ?", wsId);
}

// ---- the workspace's Apps tab (GET/DELETE /api/v2/workspaces/{ws}/apps) ----

const visibleTo = (pp: PolicyPrincipal, g: Grant) => pp.wsRole === "owner" || g.user_id === pp.userId;

/** Live grants: every one for a workspace owner, a person's own for anyone else. Oldest first. */
export function listGrants(pp: PolicyPrincipal) {
  const kid = grantKid();
  const now = Date.now();
  return all<Grant & { user_name: string }>(
    "SELECT g.*, u.name AS user_name FROM v2_oauth_grants g JOIN ba_user u ON u.id = g.user_id WHERE g.ws_id = ? ORDER BY g.created_at, g.id",
    pp.wsId,
  )
    .filter((g) => g.kid === kid && g.refresh_exp > now && visibleTo(pp, g))
    .map((g) => ({ id: g.id, name: g.client_name, redirect_host: g.redirect_host, user: { id: g.user_id, name: g.user_name }, approved_at: g.created_at, last_used_at: g.last_used_at, scopes: g.scope.split(" ") }));
}

/** Disconnect one app: its person or a workspace owner. Anything else is not found. */
export async function revokeGrant(pp: PolicyPrincipal, grantId: string) {
  const at = nowIso();
  const n = await tx(() => {
    const g = get<Grant>("SELECT * FROM v2_oauth_grants WHERE id = ? AND ws_id = ?", grantId, pp.wsId);
    if (!g || !visibleTo(pp, g) || g.kid !== grantKid() || g.refresh_exp <= Date.now()) return 0;
    run("DELETE FROM v2_oauth_grants WHERE id = ?", grantId);
    audit(pp.wsId, pp.userId, "oauth.app_revoked", grantId, at);
    return 1;
  });
  if (!n) throw notFound();
}

const g = globalThis as unknown as { __alignGrantUse?: Map<string, number> };
const lastWrite = (g.__alignGrantUse ??= new Map());

/** Record a successful MCP call, off the request path: the first one at once, then at most every 5 minutes per
 *  grant. Failures (a busy database) are skipped, never thrown. */
export function noteGrantUse(id: string) {
  const now = Date.now();
  if (now - (lastWrite.get(id) ?? 0) < USE_WRITE_MS) return;
  lastWrite.delete(id);
  lastWrite.set(id, now);
  while (lastWrite.size > 10_000) lastWrite.delete(lastWrite.keys().next().value!);
  setImmediate(() => {
    try {
      run("UPDATE v2_oauth_grants SET last_used_at = ? WHERE id = ?", new Date(now).toISOString(), id);
    } catch {
      lastWrite.delete(id);
    }
  });
}
