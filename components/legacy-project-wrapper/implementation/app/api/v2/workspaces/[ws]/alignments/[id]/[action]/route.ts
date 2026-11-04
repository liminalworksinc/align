import { actOnAlignment, assertAction } from "@/lib/v2/alignments";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../alignments/:id/{approve|counter|accept_counter|reject|withdraw|revoke} (cookie). Each carries
// the revision the person read (400 without it, 409 stale_revision when the request moved on).
export const POST = route<{ ws: string; id: string; action: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return actOnAlignment(pp, idParam(params.id, ID_RE), assertAction(params.action), await readJson(req, 16 * 1024));
});
