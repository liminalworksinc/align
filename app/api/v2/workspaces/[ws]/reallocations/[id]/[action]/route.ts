import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { actOnReallocation, assertAction } from "@/lib/v2/reallocations";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../reallocations/:id/{approve|counter|accept_counter|reject|withdraw} (cookie). approve carries revision;
// counter carries { targets, note }.
export const POST = route<{ ws: string; id: string; action: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return actOnReallocation(pp, idParam(params.id, ID_RE), assertAction(params.action), await readJson(req, 16 * 1024));
});
