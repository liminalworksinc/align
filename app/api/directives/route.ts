import { agentOrRefuse, assertSessionInGrant } from "@/lib/agent-token";
import { pendingFor } from "@/lib/directives";
import { handle } from "@/lib/http";
import { assertLocal } from "@/lib/local-guard";
import { HttpError, readState } from "@/lib/store";

// Pending authority directives for one agent session (polling fallback for the SSE stream). With an agent token,
// the session is looked up in that token's workspace and must be the token's own harness and repo; a token that no
// longer verifies is 401, never the default store. Without one, the default store, as before.
export async function GET(req: Request) {
  return handle(async () => {
    assertLocal(req);
    const session = new URL(req.url).searchParams.get("session");
    if (!session) throw new HttpError(400, "session is required");
    const agent = agentOrRefuse(req);
    const s = await readState(agent?.ws);
    if (agent) assertSessionInGrant(s, agent, session);
    return { session, pending: pendingFor(s, session) };
  });
}
