import { requireSession } from "@/lib/auth";
import { rejectProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/reject">) {
  return handle(async () => {
    const who = requireSession(req);
    const { id } = await ctx.params;
    const b = await body(req);
    void b;
    return mutate((s) => rejectProposal(s, who, id));
  });
}
