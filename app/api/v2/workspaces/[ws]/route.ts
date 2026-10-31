import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { setSteering } from "@/lib/v2/steering";
import { ID_RE } from "@/lib/v2/validate";
import { enter, workspaceDetail } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces/:ws (cookie): name, steering, my role, members, pods.
export const GET = route<{ ws: string }>(async (req, params) => workspaceDetail(enter(await webAuth(req), idParam(params.ws, ID_RE))));

// PATCH (cookie, a workspace owner) { steering: "on" | "off" }.
export const PATCH = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return setSteering(pp, await readJson(req, 1024));
});
