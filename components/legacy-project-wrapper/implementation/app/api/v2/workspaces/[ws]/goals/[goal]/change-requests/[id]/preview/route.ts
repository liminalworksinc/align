import { assertChangeRequestAction } from "@/lib/v2/changes";
import { badRequest } from "@/lib/v2/errors";
import { previewChangeRequest } from "@/lib/v2/foresight";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../change-requests/:id/preview { action, revision, … } (cookie, body at most 32 KB): what that decision would do,
// with nothing written and nothing sent (lib/v2/foresight.ts). The same checks as POST .../change-requests/:id/<action>,
// through the decision's own code: 404 outside the workspace or for a request the caller can't read, 403 for a viewer
// or someone who can't make the decision, and the decision's own refusals. A POST, so a page can't be made to read it
// cross-site, like every web write.
export const POST = route<{ ws: string; goal: string; id: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const body = await readJson(req, 32 * 1024);
  if (typeof body.action !== "string") throw badRequest("action is required: the decision to preview");
  const { action, ...rest } = body;
  return previewChangeRequest(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), assertChangeRequestAction(action), rest);
});
