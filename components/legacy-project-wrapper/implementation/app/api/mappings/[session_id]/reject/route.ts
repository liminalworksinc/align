import { requireSession } from "@/lib/auth";
import { handle, requireSameOrigin } from "@/lib/http";
import { decideMapping } from "@/lib/mapping-decision";
import { mutate } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/mappings/[session_id]/reject">) {
  return handle(async () => {
    const who = requireSession(req);
    requireSameOrigin(req); // no body to type-check, so the Origin check is the CSRF protection (Sean's #6 review, fix 2)
    const { session_id } = await ctx.params;
    return mutate((s) => decideMapping(s, who, session_id, "REJECTED"));
  });
}
