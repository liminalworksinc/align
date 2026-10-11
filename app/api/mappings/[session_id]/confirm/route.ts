import { requireSession } from "@/lib/auth";
import { handle } from "@/lib/http";
import { decideMapping } from "@/lib/mapping-decision";
import { mutate } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/mappings/[session_id]/confirm">) {
  return handle(async () => {
    const who = requireSession(req);
    const { session_id } = await ctx.params;
    return mutate((s) => decideMapping(s, who, session_id, "CONFIRMED"));
  });
}
