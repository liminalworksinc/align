import { requireWsSession, type WsContext } from "@/lib/auth";
import { isStatus, parseAsks } from "@/lib/asks";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { slotOf } from "@/lib/labels";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";
import type { CustomWsId } from "@/lib/workspace";

// Asks (lib/asks.ts). PUT: leadership replaces the workspace's asks, usually imported from meeting notes.
// PATCH { id, status }: the team asked, or leadership, records where an ask stands.

function workspaceOf(req: Request): WsContext & { ws: CustomWsId } {
  const who = requireWsSession(req);
  if (who.ws === "northstar") throw new HttpError(404, "Asks are for workspaces");
  return who as WsContext & { ws: CustomWsId };
}

const now = () => new Date().toISOString();

export async function PUT(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    if (who.actor !== "leadership") throw new HttpError(403, "Only leadership imports asks");
    const b = await bodyFor<{ asks?: unknown }>(req, who.ws);
    const asks = parseAsks(b.asks, now());
    takeWorkspaceAction(who.ws, "asks");
    await who.mutate((s) => {
      s.asks = asks;
      audit(s, who, "asks_imported", String(asks.length));
    });
    return { asks: asks.length };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const b = await bodyFor<{ id?: unknown; status?: unknown }>(req, who.ws);
    if (typeof b.id !== "string" || !isStatus(b.status)) throw new HttpError(400, "Send { id, status: open | accepted | done | declined }");
    const status = b.status;
    return who.mutate((s) => {
      const a = s.asks?.find((x) => x.id === b.id);
      if (!a) throw new HttpError(404, "No ask with that id");
      if (a.to !== slotOf(who.actor) && who.actor !== "leadership") throw new HttpError(403, "Only the team it was asked of, or leadership, can change this");
      a.status = status;
      a.updated_at = now();
      audit(s, who, "ask_status", `${a.id} ${status}`);
      return { id: a.id, status };
    });
  });
}
