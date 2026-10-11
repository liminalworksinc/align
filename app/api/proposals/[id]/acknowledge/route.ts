import { requireSession } from "@/lib/auth";
import { acknowledgeProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/acknowledge">) {
  return handle(async () => {
    const who = requireSession(req);
    const { id } = await ctx.params;
    const b = await body(req);
    void b;
    return mutate((s) => acknowledgeProposal(s, who, id));
  });
}
