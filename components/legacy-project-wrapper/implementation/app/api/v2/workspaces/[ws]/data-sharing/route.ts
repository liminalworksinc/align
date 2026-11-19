import { dataRestrictions, setDataRestriction } from "@/lib/v2/data-sharing";
import { eitherAuth, idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, { ws }) =>
  dataRestrictions(enter(await eitherAuth(req), idParam(ws, ID_RE))));

export const PATCH = route<{ ws: string }>(async (req, { ws }) => {
  const pp = enter(await webWrite(req), idParam(ws, ID_RE));
  return setDataRestriction(pp, await readJson(req, 1024));
});
