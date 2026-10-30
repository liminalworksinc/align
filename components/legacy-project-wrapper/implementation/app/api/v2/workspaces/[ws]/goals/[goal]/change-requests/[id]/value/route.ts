import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { recordValue, valueView } from "@/lib/v2/value";
import { enter } from "@/lib/v2/workspaces";

// The decision value card of an approved change request (lib/v2/value.ts), for every reader of the request.
// GET (cookie): the card -> ValueView; 404 when unreadable, 409 not_approved before approval.
// POST (cookie, same-site, body at most 4 KB) {action: "viewed" | "follow_up" | "reported", estimate?, note?}
//   -> {recorded, report}: the once-per-person product event, and for "reported" the reader's own value report
//   (created, or edited within 7 days). 409 not_approved, 409 edit_closed, 400, 429 (30 a minute per person).
type P = { ws: string; goal: string; id: string };
export const GET = route<P>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return Response.json(valueView(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE)), { headers: { "cache-control": "no-store" } });
});

export const POST = route<P>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return recordValue(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), await readJson(req, 4 * 1024));
});
