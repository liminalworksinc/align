import { connection } from "next/server";
import { config, hostAllowed } from "../config";
import { HttpError } from "../errors";
import { clientNet } from "../ratelimit";
import { getAuth } from "./auth";
import { publicOrigin } from "./config";
import { deviceFromAccessToken, userById, type DevicePrincipal, type UserRef } from "./devices";
import { V2Error, badRequest } from "./errors";
import { ready } from "./init";
import type { Body } from "./validate";

// Route plumbing for /api/v2: one wrapper (errors as { error, message }), the two credential kinds, and JSON input.
// Device routes: Bearer alnd_ only; any Origin header (a browser) or Cookie header is refused.
// Web routes: the Better Auth session cookie only; any Authorization header is refused.

export interface WebPrincipal {
  kind: "web";
  user: UserRef;
  emailVerified: boolean;
}
export type Principal = DevicePrincipal | WebPrincipal;

type Params = Record<string, string>;
type Handler<P extends Params> = (req: Request, params: P) => Promise<unknown>;

/** Wrap a v2 route: waits for the database, maps errors, logs nothing about the request when hosted. */
export function route<P extends Params = Params>(fn: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    await connection();
    try {
      await ready();
      const out = await fn(req, await ctx.params);
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      if (e instanceof V2Error) return Response.json({ error: e.code, message: e.message }, { status: e.status });
      if (e instanceof HttpError) return Response.json({ error: "bad_request", message: e.message }, { status: e.status });
      if (config().hosted) console.error("Server error:", (e as Error)?.name ?? "unknown");
      else console.error(e);
      return Response.json({ error: "server_error", message: "Server error" }, { status: 500 });
    }
  };
}

export const noContent = () => new Response(null, { status: 204 });

const bearerOf = (req: Request) => {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : "";
};

/** Device routes refuse browsers: any Origin header, and any Cookie header. */
export function rejectBrowser(req: Request) {
  if (req.headers.get("origin") !== null) throw new V2Error(403, "browser_not_allowed", "Device routes do not accept browser requests");
  if (req.headers.get("cookie") !== null) throw new V2Error(403, "cookies_not_allowed", "Device routes do not accept cookies");
}

/** Device credential. 401 invalid_token for a missing, unknown, expired or revoked token. */
export function deviceAuth(req: Request): DevicePrincipal {
  rejectBrowser(req);
  const t = bearerOf(req);
  const p = t ? deviceFromAccessToken(t) : null;
  if (!p) throw new V2Error(401, "invalid_token", "Sign in again with align login");
  return p;
}

/** Browser credential (Better Auth session cookie). */
export async function webAuth(req: Request): Promise<WebPrincipal> {
  if (req.headers.get("authorization") !== null) throw new V2Error(403, "bearer_not_allowed", "Web routes do not accept device tokens");
  const s = await getAuth().api.getSession({ headers: req.headers });
  if (!s?.user) throw new V2Error(401, "unauthorized", "Sign in first");
  const u = userById(s.user.id);
  if (!u) throw new V2Error(401, "unauthorized", "Sign in first");
  return { kind: "web", user: { id: u.id, name: u.name, email: u.email }, emailVerified: u.emailVerified };
}

/** Routes open to both: an Authorization header means the device path (with its refusals), else the cookie. */
export async function eitherAuth(req: Request): Promise<Principal> {
  return req.headers.get("authorization") !== null ? deviceAuth(req) : webAuth(req);
}

/** CSRF for cookie writes: a browser always sends Origin on these, and it must be this server's own host.
 *  Hosted (as lib/http.ts since LIM-2437): Origin is required and must be exactly https://<Host>, so an http:// page or
 *  another port can't write. Local: an Origin, when sent, must match Host; scripts send none.
 *  Fetch metadata, when sent, must say same-origin. */
export function requireSameSite(req: Request) {
  const origin = req.headers.get("origin");
  if (config().hosted) {
    const host = req.headers.get("host")?.toLowerCase();
    if (!origin || !host || !hostAllowed(host) || origin.toLowerCase() !== `https://${host}`) throw new V2Error(403, "cross_site", "This request came from another site");
  } else if (origin !== null) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (!host || host !== req.headers.get("host")) throw new V2Error(403, "cross_site", "This request came from another site");
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new V2Error(403, "cross_site", "This request came from another site");
}

/** The cookie path for a write: same-site check, then session (a cross-site write is refused before any session read). */
export async function webWrite(req: Request): Promise<WebPrincipal> {
  requireSameSite(req);
  return webAuth(req);
}

/** A write open to both credentials. No Authorization header means the cookie path, so it gets the same-site check first. */
export async function eitherWrite(req: Request): Promise<Principal> {
  if (req.headers.get("authorization") === null) requireSameSite(req);
  return eitherAuth(req);
}

/** Path segments that can't be ids are simply not found. */
export function idParam(v: string | undefined, re: RegExp): string {
  if (!v || !re.test(v)) throw new V2Error(404, "not_found", "Not found");
  return v;
}

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
function rejectReserved(v: unknown): void {
  if (Array.isArray(v)) return v.forEach(rejectReserved);
  if (v && typeof v === "object")
    for (const k of Object.keys(v)) {
      if (RESERVED.has(k)) throw badRequest(`"${k}" is not allowed as a field name`);
      rejectReserved((v as Record<string, unknown>)[k]);
    }
}

/** JSON object body, at most `max` bytes (413), application/json only (415). An empty body is {}. */
export async function readJson(req: Request, max = 64 * 1024): Promise<Body> {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > max) throw new V2Error(413, "too_large", "This request is too large");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new V2Error(413, "too_large", "This request is too large");
      }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  if (type !== "application/json") throw new V2Error(415, "unsupported_media_type", "Send this as application/json");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("Send valid JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Send a JSON object");
  rejectReserved(raw);
  return raw as Body;
}

/** This server's origin for links shown to the user (the device verification URI). */
export function originOf(req: Request): string {
  const pub = publicOrigin();
  if (pub) return pub;
  return `http://${req.headers.get("host") || "127.0.0.1"}`;
}

/** The client key for limits: Fly-Client-IP when hosted (IPv6 keyed by its /64), else one local key (as lib/ratelimit.ts). */
export function clientKey(req: Request): string {
  return config().hosted ? `ip:${clientNet(req.headers.get("fly-client-ip") ?? "unknown")}` : "local";
}
