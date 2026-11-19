import { idParam, route, webAuth } from "@/lib/v2/http";
import { outcomePeriods } from "@/lib/v2/outcome-periods";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  const q = new URL(req.url).searchParams;
  const goal = q.get("goal");
  const request = q.get("request");
  return { periods: outcomePeriods(pp, goal === null ? null : idParam(goal, ID_RE), request === null ? null : idParam(request, ID_RE)) };
});
