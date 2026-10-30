import { getChangeRequest } from "@/lib/v2/changes";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one change request with its revisions and diff (its decision record once decided).
export const GET = route<{ ws: string; goal: string; id: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return getChangeRequest(pp, idParam(params.id, ID_RE), idParam(params.goal, ID_RE));
});
