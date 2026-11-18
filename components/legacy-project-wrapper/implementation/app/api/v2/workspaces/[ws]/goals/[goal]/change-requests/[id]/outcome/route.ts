import { reportChangeOutcome } from "@/lib/v2/changes";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const POST = route<{ ws: string; goal: string; id: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return reportChangeOutcome(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), await readJson(req, 8192));
});
