import { requireWsSession } from "@/lib/auth";
import { rejectProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/reject">) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { id } = await ctx.params;
    const b = await bodyFor(req, who.ws);
    void b;
    return who.mutate((s) => rejectProposal(s, who, id));
  });
}
