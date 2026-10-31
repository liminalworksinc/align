import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { createReallocation, listReallocations } from "@/lib/v2/reallocations";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): the proposals I am part of. POST { targets: [{ goal_id, target_share }], note }.
export const GET = route<{ ws: string }>(async (req, params) => listReallocations(enter(await webAuth(req), idParam(params.ws, ID_RE))));

export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await createReallocation(pp, await readJson(req, 16 * 1024)), { status: 201 });
});
