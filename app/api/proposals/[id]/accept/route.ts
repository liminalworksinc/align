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
    // Every approval wakes the agents that read the same store: the default one (Northstar, or a /setup scenario)
    // or, tagged with its id, a workspace whose agents connect with an agent token (Mode L). The default store's
    // event keeps its shape; the wire view (?session=*) never shows a workspace's events.
    const at = new Date().toISOString();
    emitAuthority({ event_id: `accept:${id}`, kind: "ratify", at, ...(who.ws !== "northstar" ? { ws: who.ws } : {}) });
    return out;
  });
}
