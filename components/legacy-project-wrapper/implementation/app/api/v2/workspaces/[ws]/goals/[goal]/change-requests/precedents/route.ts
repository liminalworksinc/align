import { draftChangeRequestPrecedents } from "@/lib/v2/changes";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const POST = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return { precedents: draftChangeRequestPrecedents(pp, idParam(params.goal, ID_RE), await readJson(req, 32 * 1024)) };
});
