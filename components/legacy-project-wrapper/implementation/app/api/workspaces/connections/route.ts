import { requireWsSession, type WsContext } from "@/lib/auth";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { MCP_PATH, originOf } from "@/lib/oauth/server";
import { planChangedAt } from "@/lib/plan-rev";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { HttpError, readState } from "@/lib/store";
import { bumpAgentEpoch, type CustomWsId } from "@/lib/workspace";

// v1 workspaces' connected-apps list. AI apps now connect to v2 workspaces only (grants live in the v2 database,
// lib/oauth/grants.ts, listed at /api/v2/workspaces/{ws}/apps), so a v1 workspace has none: the list is empty and
// "Disconnect all" only bumps the agent epoch, as Restart does. Removed with the rest of v1.

function workspaceOf(req: Request): WsContext & { ws: CustomWsId } {
  const who = requireWsSession(req);
  if (who.ws === "northstar") throw new HttpError(404, "Connected apps are for workspaces");
  return who as WsContext & { ws: CustomWsId };
}

export async function GET(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const state = await readState(who.ws);
    return Response.json({ url: `${originOf(req)}${MCP_PATH}`, plan: { changed_at: planChangedAt(state) }, apps: [] }, { headers: { "cache-control": "no-store" } });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const b = await bodyFor<{ id?: unknown }>(req, who.ws); // JSON only, same origin
    if (b.id === undefined) {
      if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can disconnect every app at once");
      takeWorkspaceAction(who.ws, "disconnect_apps");
      await bumpAgentEpoch(who.ws); // revoke first, as the agent-token DELETE does
      await who.mutate((s) => audit(s, who, "ai_apps_disconnected", "all"));
      return { disconnected: 0 };
    }
    if (typeof b.id !== "string") throw new HttpError(400, "Send the app's id, or {} to disconnect all");
    throw new HttpError(404, "That app isn’t connected");
  });
}
