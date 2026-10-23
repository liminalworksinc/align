import { requireWsSession } from "@/lib/auth";
import { acknowledgeProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/acknowledge">) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { id } = await ctx.params;
    const b = await bodyFor(req, who.ws);
    void b;
    return who.mutate((s) => acknowledgeProposal(s, who, id));
  });
}
