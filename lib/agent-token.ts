import { timingSafeEqual } from "node:crypto";
import { signPayload } from "./auth";
import { config } from "./config";
import { parseCustomWs, readAuth, type CustomWsId } from "./workspace";

// Agent tokens connect a coding agent to one custom workspace in Mode L: read-only MCP, capture for one harness and
// repo, and that workspace's wake-ups. A workspace's leadership mints one per repo (POST /api/workspaces/agent-token),
// which is also that repo's capture consent. Shape: agt.<base64url payload>.<HMAC>, signed like sessions but with
// kind "agent" and no actor, so it never reads as a session cookie (readToken needs an actor) and a session cookie
// never reads as an agent token. It carries the workspace's passcode epoch: bumping the epoch revokes it.
// Hosted mode has no agent routes (proxy.ts), and this returns null there too.

export type AgentHarness = "claude-code" | "codex";
export interface AgentGrant {
  ws: CustomWsId;
  harness: AgentHarness;
  repo: string;
}

const REPO = /^[\w.-]{1,120}$/;
const harnessOf = (v: unknown): AgentHarness | null => (v === "claude-code" || v === "codex" ? v : null);
export const validRepo = (v: unknown): v is string => typeof v === "string" && REPO.test(v) && v !== "." && v !== "..";

export function mintAgentToken(g: AgentGrant, epoch: number): string {
  const payload = Buffer.from(JSON.stringify({ kind: "agent", ws: g.ws, harness: g.harness, repo: g.repo, ep: epoch })).toString("base64url");
  return `agt.${payload}.${signPayload(payload)}`;
}

export function readAgentToken(token: string | null | undefined): AgentGrant | null {
  if (config().hosted || !token?.startsWith("agt.")) return null;
  const [, payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const good = signPayload(payload);
  if (good.length !== mac.length || !timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return null;
  let p: { kind?: unknown; ws?: unknown; harness?: unknown; repo?: unknown; ep?: unknown };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const ws = parseCustomWs(p.ws);
  const harness = harnessOf(p.harness);
  if (p.kind !== "agent" || !ws || !harness || !validRepo(p.repo) || typeof p.ep !== "number") return null;
  const auth = readAuth(ws); // null when the workspace was deleted
  if (!auth || auth.epoch !== p.ep) return null;
  return { ws, harness, repo: p.repo };
}

/** The agent grant in `Authorization: Bearer agt....`, or null (no header, a different token, or not valid). */
export function agentFrom(req: Request): AgentGrant | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? readAgentToken(m[1]) : null;
}
