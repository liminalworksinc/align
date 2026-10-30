import { idParam, noContent, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE, str } from "@/lib/v2/validate";
import { deleteWorkspace, enter, renameWorkspace, workspaceDetail } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces/:ws (cookie): name, my role, members, teams.
export const GET = route<{ ws: string }>(async (req, params) => workspaceDetail(enter(await webAuth(req), idParam(params.ws, ID_RE))));

// PATCH (owners) { name }: rename the workspace.
export const PATCH = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return renameWorkspace(pp, str(b, "name", 100));
});

// DELETE (owners): delete the workspace and everything in it.
export const DELETE = route<{ ws: string }>(async (req, params) => {
  await deleteWorkspace(enter(await webWrite(req), idParam(params.ws, ID_RE)));
  return noContent();
});
