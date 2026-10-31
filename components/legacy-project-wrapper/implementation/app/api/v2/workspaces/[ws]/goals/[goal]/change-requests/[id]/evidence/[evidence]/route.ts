import { removeEvidence } from "@/lib/v2/changes";
import { eitherWrite, idParam, route } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// DELETE .../change-requests/:id/evidence/:evidence (cookie or device token): its author removes a link while its
// revision is current and the request open; responds with the request.
export const DELETE = route<{ ws: string; goal: string; id: string; evidence: string }>(async (req, params) => {
  const pp = enter(await eitherWrite(req), idParam(params.ws, ID_RE));
  return removeEvidence(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), idParam(params.evidence, ID_RE));
});
