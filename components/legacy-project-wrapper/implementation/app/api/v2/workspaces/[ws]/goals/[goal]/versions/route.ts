import { newGoalVersion } from "@/lib/v2/goals";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie, the goal's owner) { version, title?, measures?, anchors?, status? }: a new immutable version.
export const POST = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await newGoalVersion(pp, idParam(params.goal, ID_RE), await readJson(req, 32 * 1024)), { status: 201 });
});
