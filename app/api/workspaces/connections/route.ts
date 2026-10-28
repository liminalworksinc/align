import { requireWsSession, type WsContext } from "@/lib/auth";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { clearGrants, liveGrants, removeGrant } from "@/lib/oauth/grants";
import { MCP_PATH, originOf } from "@/lib/oauth/server";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";
import { bumpAgentEpoch, type CustomWsId } from "@/lib/workspace";

// AI apps connected to this workspace through Align's OAuth flow (lib/oauth). Any signed-in team sees the list and
// the URL to connect another. A team disconnects an app it approved; leadership can disconnect any app, or all of
// them at once (which also bumps the agent epoch, as Restart does).

function workspaceOf(req: Request): WsContext & { ws: CustomWsId } {
  const who = requireWsSession(req);
  if (who.ws === "northstar") throw new HttpError(404, "Connected apps are for workspaces");
  return who as WsContext & { ws: CustomWsId };
}

export async function GET(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const apps = liveGrants(who.ws).map((g) => ({
      id: g.id,
      name: g.client_name,
      redirect_host: g.redirect_host,
      role: g.role,
      approved_at: g.created_at,
      last_used_at: g.last_used_at, // null until its first successful read: the app is not shown as connected before
    }));
    return Response.json({ url: `${originOf(req)}${MCP_PATH}`, apps }, { headers: { "cache-control": "no-store" } });
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
      const n = await clearGrants(who.ws);
      await who.mutate((s) => audit(s, who, "ai_apps_disconnected", "all"));
      return { disconnected: n };
    }
    if (typeof b.id !== "string") throw new HttpError(400, "Send the app's id, or {} to disconnect all");
    const grant = liveGrants(who.ws).find((g) => g.id === b.id);
    if (!grant) throw new HttpError(404, "That app isn’t connected");
    if (grant.role !== who.actor && who.actor !== "leadership") throw new HttpError(403, "Only the team that connected this app, or leadership, can disconnect it");
    takeWorkspaceAction(who.ws, "disconnect_apps");
    await removeGrant(who.ws, grant.id);
    await who.mutate((s) => audit(s, who, "ai_app_disconnected", `${grant.client_name} (${grant.redirect_host})`));
    return { disconnected: 1 };
  });
}
