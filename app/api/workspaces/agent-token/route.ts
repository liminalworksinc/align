import { mintAgentToken, validRepo, type AgentHarness } from "@/lib/agent-token";
import { requireWsSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { captureConsents, HttpError, now, setCaptureConsents } from "@/lib/store";
import { readAuth } from "@/lib/workspace";

// Connect a coding agent to this workspace (Mode L only): leadership names the harness and repo, which records that
// repo's capture consent here, and gets an agent token, shown once. See lib/agent-token.ts.
export async function POST(req: Request) {
  return handle(async () => {
    if (config().hosted) throw new HttpError(404, "Not found");
    const who = requireWsSession(req);
    if (who.ws === "northstar") throw new HttpError(404, "Agent tokens are for workspaces; the demo uses ALIGN_MCP_TOKEN");
    if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can connect an agent to this workspace");
    const b = await bodyFor<{ harness?: unknown; repo?: unknown }>(req, who.ws); // JSON only, same origin
    const harness: AgentHarness | null = b.harness === "claude-code" || b.harness === "codex" ? b.harness : null;
    if (!harness) throw new HttpError(400, "harness must be claude-code or codex");
    if (!validRepo(b.repo)) throw new HttpError(400, "repo must be a repository folder name");
    const repo = b.repo;
    const auth = readAuth(who.ws);
    if (!auth) throw new HttpError(404, "This workspace no longer exists");
    await who.mutate((s) => {
      const list = captureConsents(s).filter((c) => !(c.harness === harness && c.repo === repo));
      setCaptureConsents(s, [...list, { harness, repo, granted_by: "leadership", granted_at: now() }]);
      audit(s, who, "agent_connected", `${harness}/${repo}`); // the harness and repo only, never the token
    });
    return Response.json(
      { token: mintAgentToken({ ws: who.ws, harness, repo }, auth.epoch), workspace: who.ws, harness, repo, shown_once: true },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
