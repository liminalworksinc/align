import { changeRequestPrecedents } from "@/lib/v2/changes";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string; goal: string; id: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return { precedents: changeRequestPrecedents(pp, idParam(params.id, ID_RE), idParam(params.goal, ID_RE)) };
});
