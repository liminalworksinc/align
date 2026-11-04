import { suggestLimits } from "@/lib/v2/limit-suggest";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie, same-site) { notes, source: { title?, date }, prefer_goal_id? }: the rule-shaped sentences of pasted
// notes, grouped by the readable active goal each is about (lib/v2/limit-suggest.ts). Stores nothing.
export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return suggestLimits(pp, await readJson(req, 32 * 1024));
});
