import { requireWsSession } from "@/lib/auth";
import { decideLaunch } from "@/lib/flow";
import { cappedJson, handle, requireJson } from "@/lib/http";

// Leadership's launch decision on an agreed proposal. Custom scenarios only; workspace-scoped through the session.
export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/launch">) {
  return handle(async () => {
    const who = requireWsSession(req);
    requireJson(req);
    const { id } = await ctx.params;
    const b = await cappedJson(req, 4 * 1024);
    return who.mutate((s) => decideLaunch(s, who, id, b));
  });
}
