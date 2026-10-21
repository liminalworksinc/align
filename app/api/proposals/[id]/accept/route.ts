import { requireWsSession } from "@/lib/auth";
import { ratifyProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { scenarioOf } from "@/lib/labels";
import { emitAuthority } from "@/lib/events";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/accept">) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { id } = await ctx.params;
    const b = await bodyFor(req, who.ws);
    void b;
    const { out, scenario } = await who.mutate((s) => ({ out: ratifyProposal(s, who, id, b), scenario: scenarioOf(s) }));
    // The authority stream is Northstar's (agent replan): a custom approval, in a workspace or a /setup scenario, emits nothing.
    if (who.ws === "northstar" && scenario !== "custom") emitAuthority({ event_id: `accept:${id}`, kind: "ratify", at: new Date().toISOString() });
    return out;
  });
}
