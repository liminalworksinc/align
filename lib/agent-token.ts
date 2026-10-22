import { timingSafeEqual } from "node:crypto";
import { signPayload } from "./auth";
import { config } from "./config";
import { HttpError } from "./errors";
import type { AgentSession, AppState } from "./types";
import { agentEpochOf, parseCustomWs, readAuth, type CustomWsId } from "./workspace";

// Agent tokens connect a coding agent to one custom workspace in Mode L: read-only MCP, capture for one harness and
// repo, and that workspace's wake-ups. A workspace's leadership mints one per repo (POST /api/workspaces/agent-token),
// which also records that repo's capture consent; capture still checks the consent record on every event, so the
// token alone is never consent. Shape: agt.<base64url payload>.<HMAC>, signed like sessions but with kind "agent"
// and no actor, so it never reads as a session cookie (readToken needs an actor) and a session cookie never reads as
// an agent token. It carries the workspace's agent epoch (bumped by Restart and by DELETE /api/workspaces/agent-token,
// which revokes every agent token without signing people out) and expires after AGENT_TOKEN_TTL_MS.
// Hosted mode has no agent routes (proxy.ts), and this returns null there too.

export type AgentHarness = "claude-code" | "codex";
export interface AgentGrant {
  ws: CustomWsId;
  harness: AgentHarness;
  repo: string;
}

export const AGENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const REPO = /^[\w.-]{1,120}$/;
const harnessOf = (v: unknown): AgentHarness | null => (v === "claude-code" || v === "codex" ? v : null);
export const validRepo = (v: unknown): v is string => typeof v === "string" && REPO.test(v) && v !== "." && v !== "..";

export function mintAgentToken(g: AgentGrant, agentEpoch: number, nowMs = Date.now()): { token: string; expires_at: string } {
  const exp = nowMs + AGENT_TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ kind: "agent", ws: g.ws, harness: g.harness, repo: g.repo, ep: agentEpoch, exp })).toString("base64url");
  return { token: `agt.${payload}.${signPayload(payload)}`, expires_at: new Date(exp).toISOString() };
}

export function readAgentToken(token: string | null | undefined): AgentGrant | null {
  if (config().hosted || !token?.startsWith("agt.")) return null;
  const [, payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const good = signPayload(payload);
  if (good.length !== mac.length || !timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return null;
  let p: { kind?: unknown; ws?: unknown; harness?: unknown; repo?: unknown; ep?: unknown; exp?: unknown };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const ws = parseCustomWs(p.ws);
  const harness = harnessOf(p.harness);
  if (p.kind !== "agent" || !ws || !harness || !validRepo(p.repo) || typeof p.ep !== "number") return null;
  if (typeof p.exp !== "number" || p.exp <= Date.now()) return null; // tokens minted before expiry existed are refused
  const auth = readAuth(ws); // null when the workspace was deleted
  if (!auth || agentEpochOf(auth) !== p.ep) return null;
  return { ws, harness, repo: p.repo };
}

/** The agent grant in `Authorization: Bearer agt....`, or null (no header, a different token, or not valid). */
export function agentFrom(req: Request): AgentGrant | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? readAgentToken(m[1]) : null;
}

/** True when the request carries an agent token at all, valid or not: such a request must never fall back to the
 *  default (Northstar) store, so routes answer 401 when `agentFrom` is null. */
export function hasAgentHeader(req: Request): boolean {
  return /^Bearer\s+agt\./i.test(req.headers.get("authorization") ?? "");
}

/** The grant from `agentFrom`, or a 401 when the request carries an agent token that no longer verifies, or null
 *  when it carries none (the default store's watcher and scripts). */
export function agentOrRefuse(req: Request): AgentGrant | null {
  const agent = agentFrom(req);
  if (!agent && hasAgentHeader(req)) throw new HttpError(401, "This agent token is no longer valid");
  return agent;
}

type GrantScope = Pick<AgentGrant, "harness" | "repo">;
const inGrant = (x: Pick<AgentSession, "harness" | "repo">, g: GrantScope) => x.harness === g.harness && x.repo === g.repo;

/** A token reads and acknowledges only its own harness and repo's sessions: 403 for a session another one started. */
export function assertSessionInGrant(s: AppState, g: GrantScope, sessionId: string) {
  const sess = (s.sessions ?? []).find((x) => x.id === sessionId || x.session_id === sessionId);
  if (sess && !inGrant(sess, g)) throw new HttpError(403, "This session belongs to another harness or repo");
}

/** A copy of the state whose sessions (and their mappings) are only the grant's own harness and repo. */
export function scopeToGrant(s: AppState, g: GrantScope): AppState {
  const sessions = (s.sessions ?? []).filter((x) => inGrant(x, g));
  const ids = new Set(sessions.map((x) => x.id));
  return { ...s, sessions, mappings: (s.mappings ?? []).filter((m) => ids.has(m.session_id)) };
}
