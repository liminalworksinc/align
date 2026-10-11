import { requireSession } from "@/lib/auth";
import { counterProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/counter">) {
  return handle(async () => {
    const who = requireSession(req);
    const { id } = await ctx.params;
    const b = await body(req);
    void b;
    return mutate((s) => counterProposal(s, who, id, b));
  });
}
