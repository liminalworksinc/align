import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Actor, AppState } from "./types";
import { config } from "./config";
import { HttpError, mutate, mutateWs, readState } from "./store";
import { parseCustomWs, readAuth, verifyPasscode, type CustomWsId, type WsId } from "./workspace";

export const COOKIE = "align_session";

/** HOSTED=1 uses the __Host- name (Secure, Path=/, no Domain), so a sibling subdomain can't plant a session cookie. */
const cookieName = () => (config().hosted ? `__Host-${COOKIE}` : COOKIE);

/** The Set-Cookie value. Mode L: exactly as before. Hosted: __Host- name and Secure. */
export function sessionCookie(token: string | null): string {
  const secure = config().hosted ? "; Secure" : "";
  return token === null
    ? `${cookieName()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    : `${cookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`;
}

function secret(): string {
  if (process.env.ALIGN_SECRET) return process.env.ALIGN_SECRET;
  const file = path.join(process.cwd(), "data", ".secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

const PASSCODES: Record<Actor, string> = {
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
};

export const DISPLAY: Record<Actor, string> = {
  product: "Product Director",
  security: process.env.ALIGN_SECURITY_NAME || "Alex / Security Lead",
  leadership: process.env.ALIGN_LEADERSHIP_NAME || "CEO / Leadership",
};

export interface Session {
  actor: Actor;
  sid: string;
}

/** A custom workspace session. Northstar sessions keep the plain {actor, sid} shape and token. */
export interface WsSession extends Session {
  ws: WsId;
}

/** Scoped access for workspace-aware routes: state reads and writes are bound to the session's workspace. */
export interface WsContext extends WsSession {
  mutate<T>(fn: (s: AppState) => T | Promise<T>): Promise<T>;
  read(): Promise<AppState>;
}

const SESSION_MS = 12 * 60 * 60 * 1000;
const ACTORS = new Set(["product", "security", "leadership"]);

// Custom token payload: {actor, sid, ws, ep, exp}. ep is the workspace epoch (bumped to revoke), exp is ms since epoch.
interface CustomPayload extends Session {
  ws: string;
  ep: number;
  exp: number;
}

type TokenRead =
  | { kind: "none" } // no token, or one that fails the HMAC: anonymous, exactly as before
  | { kind: "northstar"; session: Session }
  | { kind: "custom"; session: WsSession }
  | { kind: "ended" }; // signed by us, but expired, revoked or for a workspace that is gone

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function login(role: string, passcode: string): { token: string; session: Session } {
  // Hosted has no Northstar: its shared passcodes sign nobody in there (go-C condition 1).
  if (config().hosted) throw new HttpError(404, "Not found");
  if (role !== "product" && role !== "security" && role !== "leadership") throw new HttpError(400, "Unknown role");
  const expected = Buffer.from(PASSCODES[role]);
  const given = Buffer.from(String(passcode ?? ""));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new HttpError(401, "Wrong passcode for this role");
  }
  const session: Session = { actor: role, sid: randomUUID().slice(0, 8) };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, session };
}

const WRONG = "Wrong passcode for this role";

/**
 * Sign in to a custom workspace. Invalid id, unknown workspace, unknown role and wrong passcode all get the same 401.
 * Compares with async scrypt and timingSafeEqual.
 */
export async function loginWorkspace(workspace: unknown, role: unknown, passcode: unknown): Promise<{ token: string; session: WsSession }> {
  const ws = parseCustomWs(workspace);
  if (!ws || typeof role !== "string" || !ACTORS.has(role) || typeof passcode !== "string") throw new HttpError(401, WRONG);
  const auth = readAuth(ws);
  if (!auth || !(await verifyPasscode(auth.roles[role as Actor], passcode))) throw new HttpError(401, WRONG);
  const body: CustomPayload = { actor: role as Actor, sid: randomUUID().slice(0, 8), ws, ep: auth.epoch, exp: Date.now() + SESSION_MS };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, session: { actor: body.actor, sid: body.sid, ws } };
}

function readToken(token: string | undefined): TokenRead {
  if (!token) return { kind: "none" };
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return { kind: "none" };
  const good = sign(payload);
  if (good.length !== mac.length || !timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return { kind: "none" };
  let p: Partial<CustomPayload>;
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CustomPayload>;
  } catch {
    return { kind: "none" };
  }
  if (!p || typeof p.actor !== "string" || !ACTORS.has(p.actor)) return { kind: "none" };
  // A Northstar token (no expiry, no mode binding) is never honoured when hosted, even one minted elsewhere with
  // the same secret: hosted serves custom workspaces only.
  if (p.ws === undefined) return config().hosted ? { kind: "none" } : { kind: "northstar", session: p as Session };
  const ws = parseCustomWs(p.ws);
  if (!ws || typeof p.exp !== "number" || p.exp <= Date.now()) return { kind: "ended" };
  const auth = readAuth(ws);
  if (!auth || auth.epoch !== p.ep) return { kind: "ended" };
  return { kind: "custom", session: { actor: p.actor as Actor, sid: String(p.sid), ws } };
}

export function readSession(token: string | undefined): Session | null {
  const t = readToken(token);
  return t.kind === "northstar" ? t.session : null;
}

function tokenFrom(req: Request): TokenRead {
  const cookie = req.headers.get("cookie") || "";
  const name = cookieName();
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return readToken(match ? decodeURIComponent(match.slice(name.length + 1)) : undefined);
}

/** Northstar session or null. A custom token is not a Northstar session. */
export function sessionFrom(req: Request): Session | null {
  const t = tokenFrom(req);
  return t.kind === "northstar" ? t.session : null;
}

export const SESSION_ENDED = "Your session ended. Sign in again.";

/** Any session, with its workspace. Throws 401 Session ended for a signed custom token that no longer verifies. */
export function wsSessionFrom(req: Request): WsSession | null {
  const t = tokenFrom(req);
  if (t.kind === "ended") throw new HttpError(401, SESSION_ENDED);
  if (t.kind === "northstar") return { ...t.session, ws: "northstar" };
  return t.kind === "custom" ? t.session : null;
}

/** For Northstar-only routes. A custom workspace session gets 403; it can never reach Northstar state here. */
export function requireSession(req: Request): Session {
  const t = tokenFrom(req);
  if (t.kind === "ended") throw new HttpError(401, SESSION_ENDED);
  if (t.kind === "custom") throw new HttpError(403, "This isn’t available in a custom workspace");
  if (t.kind !== "northstar") throw new HttpError(401, "Sign in as Product or Security first");
  return t.session;
}

/** For workspace-aware routes: the only way a route reaches custom state. ctx.mutate and ctx.read are bound to ctx.ws. */
export function requireWsSession(req: Request): WsContext {
  const s = wsSessionFrom(req);
  if (!s) throw new HttpError(401, "Sign in as Product or Security first");
  return bindWs(s);
}

/** For GET /api/state: the caller's workspace, or Northstar when anonymous (as before). */
export function stateContext(req: Request): { who: WsSession | null } & Pick<WsContext, "mutate" | "read"> {
  const who = wsSessionFrom(req);
  if (who) return { ...bindWs(who), who };
  return { who: null, mutate: (fn) => mutate(fn), read: () => readState() };
}

export function bindWs(s: WsSession): WsContext {
  if (s.ws === "northstar") {
    // Flow functions read only actor and sid, so the extra fields never reach Northstar state.
    return { ...s, mutate: (fn) => mutate(fn), read: () => readState() };
  }
  const ws: CustomWsId = s.ws;
  return { ...s, mutate: (fn) => mutateWs(ws, fn), read: () => readState(ws) };
}
