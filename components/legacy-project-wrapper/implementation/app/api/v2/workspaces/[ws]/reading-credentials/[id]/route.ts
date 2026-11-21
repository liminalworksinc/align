import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { revokeReadingCredential } from "@/lib/v2/measure-sources";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const DELETE = route<{ ws: string; id: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  await revokeReadingCredential(pp, idParam(params.id, ID_RE));
  return noContent();
});
