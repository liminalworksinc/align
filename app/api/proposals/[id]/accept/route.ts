import { requireSession } from "@/lib/auth";
import { ratifyProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";
import { emitAuthority } from "@/lib/events";


export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/accept">) {
  return handle(async () => {
    const who = requireSession(req);
    const { id } = await ctx.params;
    const b = await body(req);
    void b;
    const out = await mutate((s) => ratifyProposal(s, who, id, b));
    emitAuthority({ event_id: `accept:${id}`, kind: "ratify", at: new Date().toISOString() });
    return out;
  });
}
