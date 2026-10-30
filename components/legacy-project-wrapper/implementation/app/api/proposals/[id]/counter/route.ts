import { requireWsSession } from "@/lib/auth";
import { counterProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/counter">) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { id } = await ctx.params;
    const b = await bodyFor(req, who.ws);
    void b;
    return who.mutate((s) => counterProposal(s, who, id, b));
  });
}
