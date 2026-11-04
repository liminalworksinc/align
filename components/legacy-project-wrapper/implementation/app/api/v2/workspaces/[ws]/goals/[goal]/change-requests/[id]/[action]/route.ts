import { actOnChangeRequest, assertChangeRequestAction } from "@/lib/v2/changes";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../change-requests/:id/{approve|reject|counter|accept_counter|withdraw|rebase} (cookie, body at most 32 KB).
export const POST = route<{ ws: string; goal: string; id: string; action: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const action = assertChangeRequestAction(params.action);
  return actOnChangeRequest(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), action, await readJson(req, 32 * 1024));
});
