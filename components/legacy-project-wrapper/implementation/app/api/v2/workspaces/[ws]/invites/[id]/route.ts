import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { deleteInvite, enter } from "@/lib/v2/workspaces";

// DELETE (owners): withdraw an invite that hasn't been accepted.
export const DELETE = route<{ ws: string; id: string }>(async (req, params) => {
  await deleteInvite(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.id, ID_RE));
  return noContent();
});
