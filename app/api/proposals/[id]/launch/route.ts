import { requireWsSession } from "@/lib/auth";
import { decideLaunch } from "@/lib/flow";
import { cappedJson, handle, requireJson, requireSameOrigin } from "@/lib/http";
import { takeWorkspaceAction } from "@/lib/ratelimit";

// Leadership's launch decision on an agreed proposal. Custom scenarios only; workspace-scoped through the session.
export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/launch">) {
  return handle(async () => {
    const who = requireWsSession(req);
    requireSameOrigin(req); // explicit, as on every cookie write (Sean's #7 review); requireJson below checks it too
    requireJson(req);
    const { id } = await ctx.params;
    const b = await cappedJson(req, 4 * 1024);
    // A decision loop can't churn the audit archive (review M5): each written decision counts toward the per-workspace limit.
    return who.mutate((s) => decideLaunch(s, who, id, b, () => takeWorkspaceAction(who.ws, "launch")));
  });
}
