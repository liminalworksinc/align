import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { signPayload } from "../secret";
import { config } from "../config";
import { ClientUnreachable, redirectAllowed, resolveClient, type OAuthClient } from "./clients";
import { createGrant, liveGrant, newGrantId, parseRefresh, removeGrant, rotateGrant } from "./grants";

// The OAuth 2.1 authorization server for Align's MCP endpoint (MCP authorization spec 2026-07-28): authorization code
// with PKCE S256 only, public clients (CIMD or DCR, lib/oauth/clients.ts), refresh token rotation, RFC 8707 resource
// binding and RFC 9207 iss. A person approves an app while recently signed in to Align (Better Auth) and picks one of
// their v2 workspaces, so an app reads exactly one workspace, as that person. Everything it can read is read-only
// (lib/mcp/register.ts). Access tokens are stateless, alm.<payload>.<HMAC>, 1 hour, checked against the grant and the
// membership on every call so that "Disconnect", leaving and removal work at once. Codes live in memory for 60 s: a
// restart drops them and the app simply asks again.

export const MCP_PATH = "/api/mcp";
export const PRM_PATH = "/.well-known/oauth-protected-resource/api/mcp";
export const SCOPE = "goals:read";
const ACCESS_TTL_S = 60 * 60;
const CODE_TTL_MS = 60 * 1000;

/** This server's public origin from the Host the request used (proxy.ts has already checked it): https when hosted. */
export function originFromHost(host: string | null): string {
  return `${config().hosted ? "https" : "http"}://${(host ?? "").toLowerCase()}`;
}
export const originOf = (req: Request) => originFromHost(req.headers.get("host"));
export const resourceFor = (origin: string) => `${origin}${MCP_PATH}`;
/** RFC 8707 resource as a client sent it: the MCP URL, with or without a trailing slash. */
const isResource = (asked: string, origin: string) => asked.replace(/\/$/, "") === resourceFor(origin);

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceFor(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Align",
  };
}

// ---- access tokens ----

export interface McpGrant {
  ws: string;
  uid: string;
  grant: string;
  client_id: string;
  exp: number; // seconds
}

const macOf = (payload: string) => signPayload(`alm.${payload}`); // domain-separated from refresh-token hashes (alr.)
const WS_ID = /^ws_[a-z2-7]{24}$/;

function mintAccess(ws: string, uid: string, grant: string, clientId: string, aud: string) {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TTL_S;
  const payload = Buffer.from(JSON.stringify({ kind: "mcp", ws, uid, gid: grant, cid: clientId, aud, exp })).toString("base64url");
  return `alm.${payload}.${macOf(payload)}`;
}

/** The grant behind an `alm.` access token for this resource, or null (bad MAC, expired, other audience, revoked,
 *  or its person is no longer a member of the workspace). Needs the v2 database open (lib/v2/init.ts ready()). */
export function readMcpToken(token: string | undefined, aud: string): McpGrant | null {
  if (!token?.startsWith("alm.")) return null;
  const [, payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const good = macOf(payload);
  if (good.length !== mac.length || !timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return null;
  let p: { kind?: unknown; ws?: unknown; uid?: unknown; gid?: unknown; cid?: unknown; aud?: unknown; exp?: unknown };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (p.kind !== "mcp" || typeof p.ws !== "string" || !WS_ID.test(p.ws) || typeof p.uid !== "string" || typeof p.gid !== "string") return null;
  if (p.aud !== aud || typeof p.exp !== "number" || p.exp <= Date.now() / 1000) return null;
  const grant = liveGrant(p.gid);
  if (!grant || grant.client_id !== p.cid || grant.user_id !== p.uid || grant.ws_id !== p.ws) return null;
  return { ws: grant.ws_id, uid: grant.user_id, grant: grant.id, client_id: grant.client_id, exp: p.exp };
}

// ---- authorization requests ----

export interface AuthorizeRequest {
  client: OAuthClient;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
  resource: string;
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; fatal: string } // shown on Align's page: the redirect itself can't be trusted
  | { ok: false; redirect: string }; // sent back to the app as an OAuth error

/** RFC 9207: every response to the redirect URI names the issuer, so an app can't be fooled by another server. */
export function redirectWith(uri: string, params: Record<string, string | null>, origin: string): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries({ ...params, iss: origin })) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

const CHALLENGE = /^[A-Za-z0-9._~-]{43,128}$/;

export async function checkAuthorize(q: Record<string, string | undefined>, origin: string): Promise<AuthorizeCheck> {
  let client: OAuthClient | null;
  try {
    client = await resolveClient(q.client_id);
  } catch (e) {
    if (e instanceof ClientUnreachable) return { ok: false, fatal: `Align couldn’t reach ${e.message} to check this app. Reload this page in a minute.` };
    throw e;
  }
  if (!client) return { ok: false, fatal: "Align doesn’t recognize this app. Remove it and add Align again." };
  const redirect = q.redirect_uri;
  if (!redirect || !redirectAllowed(client, redirect)) return { ok: false, fatal: "This app asked Align to send you somewhere it didn’t register. Nothing was shared." };
  const state = q.state && q.state.length <= 500 ? q.state : null;
  const fail = (error: string, description: string): AuthorizeCheck => ({ ok: false, redirect: redirectWith(redirect, { error, error_description: description, state }, origin) });
  if (q.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  if (!q.code_challenge || !CHALLENGE.test(q.code_challenge) || q.code_challenge_method !== "S256") return fail("invalid_request", "PKCE with S256 is required");
  const resource = resourceFor(origin);
  if (q.resource && !isResource(q.resource, origin)) return fail("invalid_target", `The only resource here is ${resource}`);
  return { ok: true, request: { client, redirect_uri: redirect, state, code_challenge: q.code_challenge, resource } };
}

// ---- codes ----

interface CodeEntry {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  challenge: string;
  resource: string;
  ws: string;
  user_id: string;
  exp: number;
  used: { grant: string } | null;
}

const g = globalThis as unknown as { __alignOAuthCodes?: Map<string, CodeEntry> };
const codes = (g.__alignOAuthCodes ??= new Map());

/** After the person approves: a single-use code for the app, bound to its client, redirect, PKCE challenge, resource,
 *  person and workspace. */
export function issueCode(r: AuthorizeRequest, ws: string, userId: string): string {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp + CODE_TTL_MS < now) codes.delete(k); // kept a while past expiry to catch reuse
  while (codes.size >= 1000) codes.delete(codes.keys().next().value!);
  const code = randomBytes(32).toString("base64url");
  codes.set(code, {
    client_id: r.client.client_id,
    client_name: r.client.client_name,
    redirect_uri: r.redirect_uri,
    challenge: r.code_challenge,
    resource: r.resource,
    ws,
    user_id: userId,
    exp: now + CODE_TTL_MS,
    used: null,
  });
  return code;
}

// ---- token endpoint ----

export class TokenError extends Error {
  constructor(public error: string, description: string, public status = 400) {
    super(description);
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export async function exchange(form: URLSearchParams, origin: string): Promise<TokenResponse> {
  const type = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const resource = resourceFor(origin);
  const asked = form.get("resource");
  if (asked && !isResource(asked, origin)) throw new TokenError("invalid_target", `The only resource here is ${resource}`);
  if (type === "authorization_code") {
    const code = form.get("code") ?? "";
    const entry = codes.get(code);
    if (!entry) throw new TokenError("invalid_grant", "Unknown or expired code");
    if (entry.used) {
      // A code presented twice was intercepted or replayed: revoke what the first use got (OAuth 2.1 section 4.1.3).
      codes.delete(code);
      await removeGrant(entry.used.grant).catch(() => undefined);
      throw new TokenError("invalid_grant", "This code was already used");
    }
    if (entry.exp <= Date.now()) throw new TokenError("invalid_grant", "Unknown or expired code");
    if (entry.client_id !== clientId) throw new TokenError("invalid_grant", "The code was issued to another app");
    if (entry.redirect_uri !== form.get("redirect_uri")) throw new TokenError("invalid_grant", "redirect_uri doesn't match the authorization request");
    const verifier = form.get("code_verifier") ?? "";
    if (!CHALLENGE.test(verifier) || s256(verifier) !== entry.challenge) throw new TokenError("invalid_grant", "PKCE verification failed");
    if (entry.resource !== resource) throw new TokenError("invalid_target", "The code was issued for another resource");
    // The grant id is fixed before the await, so a replay that arrives while the grant is being written still
    // revokes it (removeGrant's transaction queues behind createGrant's).
    entry.used = { grant: newGrantId() };
    const created = await createGrant(
      { ws: entry.ws, user_id: entry.user_id, client_id: entry.client_id, client_name: entry.client_name, redirect_host: new URL(entry.redirect_uri).host },
      entry.used.grant,
    );
    // The workspace was deleted, or the person left or was removed, while the code was outstanding: it is worth nothing.
    if (!created) throw new TokenError("invalid_grant", "You are no longer a member of this workspace");
    const { grant, refresh_token } = created;
    return {
      access_token: mintAccess(grant.ws_id, grant.user_id, grant.id, grant.client_id, resource),
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token,
      scope: SCOPE,
    };
  }
  if (type === "refresh_token") {
    const r = parseRefresh(form.get("refresh_token"));
    const out = r ? await rotateGrant(r.ws, r.id, r.secret, clientId).catch(() => null) : null;
    if (!out) throw new TokenError("invalid_grant", "This sign-in has ended. Connect Align again.");
    return {
      access_token: mintAccess(out.grant.ws_id, out.grant.user_id, out.grant.id, out.grant.client_id, resource),
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: out.refresh_token,
      scope: SCOPE,
    };
  }
  throw new TokenError("unsupported_grant_type", "Use authorization_code or refresh_token");
}
