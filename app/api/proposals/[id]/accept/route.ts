import { requireWsSession } from "@/lib/auth";
import { ratifyProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { emitAuthority } from "@/lib/events";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/accept">) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { id } = await ctx.params;
    const b = await bodyFor(req, who.ws);
    void b;
    const out = await who.mutate((s) => ratifyProposal(s, who, id, b));
    // The authority stream serves the default store, the one agents read over MCP: Northstar, or a /setup scenario,
    // whose directive names no command (lib/directives.ts). A workspace approval emits nothing: no agent can reach it.
    if (who.ws === "northstar") emitAuthority({ event_id: `accept:${id}`, kind: "ratify", at: new Date().toISOString() });
    return out;
  });
}
