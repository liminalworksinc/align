import { mintAgentToken, validRepo, type AgentHarness } from "@/lib/agent-token";
import { requireWsSession, type WsContext } from "@/lib/auth";
import { config } from "@/lib/config";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { captureConsents, HttpError, now, setCaptureConsents } from "@/lib/store";
import { agentEpochOf, bumpAgentEpoch, readAuth, type CustomWsId } from "@/lib/workspace";

// Connect a coding agent to this workspace (Mode L only): leadership names the harness and repo, which records that
// repo's capture consent here, and gets an agent token, shown once. DELETE disconnects agents. See lib/agent-token.ts.

function leadershipOfWorkspace(req: Request): WsContext & { ws: CustomWsId } {
  if (config().hosted) throw new HttpError(404, "Not found");
  const who = requireWsSession(req);
  if (who.ws === "northstar") throw new HttpError(404, "Agent tokens are for workspaces; the demo uses ALIGN_MCP_TOKEN");
  if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can connect or disconnect agents in this workspace");
  return who as WsContext & { ws: CustomWsId };
}

const harnessOf = (v: unknown): AgentHarness | null => (v === "claude-code" || v === "codex" ? v : null);

export async function POST(req: Request) {
  return handle(async () => {
    const who = leadershipOfWorkspace(req);
    const b = await bodyFor<{ harness?: unknown; repo?: unknown }>(req, who.ws); // JSON only, same origin
    const harness = harnessOf(b.harness);
    if (!harness) throw new HttpError(400, "harness must be claude-code or codex");
    if (!validRepo(b.repo)) throw new HttpError(400, "repo must be a repository folder name");
    const repo = b.repo;
    const auth = readAuth(who.ws);
    if (!auth) throw new HttpError(404, "This workspace no longer exists");
    takeWorkspaceAction(who.ws, "connect_agent"); // a mint loop can't churn the audit archive (review M5)
    await who.mutate((s) => {
      const list = captureConsents(s).filter((c) => !(c.harness === harness && c.repo === repo));
      setCaptureConsents(s, [...list, { harness, repo, granted_by: "leadership", granted_at: now() }]);
      audit(s, who, "agent_connected", `${harness}/${repo}`); // the harness and repo only, never the token
    });
    const { token, expires_at } = mintAgentToken({ ws: who.ws, harness, repo }, agentEpochOf(auth));
    return Response.json({ token, expires_at, workspace: who.ws, harness, repo, shown_once: true }, { headers: { "cache-control": "no-store" } });
  });
}

/**
 * Disconnect agents. With `{harness, repo}` that repo's consent and captured sessions are removed; with no body
 * (or `{}`) every consent and captured session goes. Either way every agent token for this workspace stops working
 * (agent epoch bump); connect the agents you keep again with POST. Human sign-ins are not affected.
 */
export async function DELETE(req: Request) {
  return handle(async () => {
    const who = leadershipOfWorkspace(req);
    const b = await bodyFor<{ harness?: unknown; repo?: unknown }>(req, who.ws); // JSON only, same origin
    const one = b.harness !== undefined || b.repo !== undefined;
    const harness = harnessOf(b.harness);
    if (one && (!harness || !validRepo(b.repo))) throw new HttpError(400, "Send harness and repo to disconnect one agent, or {} for all");
    const repo = one ? (b.repo as string) : null;
    takeWorkspaceAction(who.ws, "disconnect_agent"); // a disconnect loop can't churn the audit archive (review M5)
    // Revoke first. The epoch lives in auth.json under its own lock, so the two writes can't be one transaction:
    // bumping before the state write means a failure leaves either nothing changed or every token revoked, never
    // tokens that still work after their consent was removed (Sean's #6 review).
    const agent_epoch = await bumpAgentEpoch(who.ws);
    const removed = await who.mutate((s) => {
      const gone = captureConsents(s).filter((c) => !one || (c.harness === harness && c.repo === repo));
      setCaptureConsents(s, captureConsents(s).filter((c) => !gone.includes(c)));
      const before = s.sessions.length;
      s.sessions = s.sessions.filter((x) => !gone.some((c) => c.harness === x.harness && c.repo === x.repo));
      s.mappings = (s.mappings ?? []).filter((m) => s.sessions.some((x) => x.id === m.session_id));
      audit(s, who, "agents_disconnected", one ? `${harness}/${repo}` : "all");
      return { consents: gone.length, sessions: before - s.sessions.length };
    });
    return Response.json({ revoked: true, removed_consents: removed.consents, purged_sessions: removed.sessions, agent_epoch }, { headers: { "cache-control": "no-store" } });
  });
}
