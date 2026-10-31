import { idParam, noContent, readJson, requireRecentSignIn, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { deleteWorkspace, enter, updateWorkspace, workspaceDetail } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces/:ws (cookie): name, steering, my role, members, teams.
export const GET = route<{ ws: string }>(async (req, params) => workspaceDetail(enter(await webAuth(req), idParam(params.ws, ID_RE))));

// PATCH (owners) { name?, steering?: "on" | "off" }: rename the workspace, turn steering on or off.
export const PATCH = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return updateWorkspace(pp, await readJson(req, 4096));
});

// DELETE (owners): delete the workspace and everything in it. An owner needs a sign-in from the last 15 minutes (403
// reauth_required).
export const DELETE = route<{ ws: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  if (pp.wsRole === "owner") requireRecentSignIn(p, "delete this workspace");
  await deleteWorkspace(pp);
  return noContent();
});
