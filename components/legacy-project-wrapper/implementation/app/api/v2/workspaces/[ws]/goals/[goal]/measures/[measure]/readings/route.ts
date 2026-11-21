import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { measureReadingHistory, recordMeasureReading } from "@/lib/v2/readings";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

type Params = { ws: string; goal: string; measure: string };

export const GET = route<Params>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  const readings = measureReadingHistory(pp, idParam(params.goal, ID_RE), idParam(params.measure, ID_RE));
  return { readings };
});

export const POST = route<Params>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const reading = await recordMeasureReading(pp, idParam(params.goal, ID_RE), idParam(params.measure, ID_RE), await readJson(req, 8192));
  return Response.json({ reading }, { status: 201 });
});
