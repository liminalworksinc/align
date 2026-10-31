import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { actOnReallocation, assertReallocationAction } from "@/lib/v2/reallocations";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../reallocations/:id/{approve|approve_and_launch|launch|not_yet|counter|accept_counter|reject|withdraw} (cookie).
// approve and approve_and_launch carry { revision }; counter { targets, note? }; reject { reason? }.
export const POST = route<{ ws: string; id: string; action: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return actOnReallocation(pp, idParam(params.id, ID_RE), assertReallocationAction(params.action), await readJson(req, 16 * 1024));
});
