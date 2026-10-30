import { confirmParent } from "@/lib/v2/goals";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE, str } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie, the goal's owner) { parent_id }: this goal still fits the parent's current version.
export const POST = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return confirmParent(pp, idParam(params.goal, ID_RE), idParam(str(b, "parent_id", 80), ID_RE));
});
