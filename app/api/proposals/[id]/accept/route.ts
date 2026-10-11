import { requireSession } from "@/lib/auth";
import { ratifyProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/accept">) {
  return handle(async () => {
    const who = requireSession(req);
    const { id } = await ctx.params;
    const b = await body(req);
    void b;
    return mutate((s) => ratifyProposal(s, who, id, b));
  });
}
