import { idParam, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { deletedWorkspaceOwnedBy, restoreWorkspace } from "@/lib/v2/workspaces";

// POST /api/v2/workspaces/:ws/restore (cookie, owners of the deleted workspace, a sign-in from the last 15 minutes):
// undo a deletion within 30 days -> { id, name, role }. 404 for anyone else or after the window, 409 not_deleted.
export const POST = route<{ ws: string }>(async (req, params) => {
  const p = await webWrite(req);
  const ws = idParam(params.ws, ID_RE);
  deletedWorkspaceOwnedBy(p.user.id, ws);
  requireRecentSignIn(p);
  return restoreWorkspace(p.user.id, ws);
});
