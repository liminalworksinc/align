import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { commandForReading, recordCommandReading } from "@/lib/v2/readings";
import { ID_RE } from "@/lib/v2/validate";

type Params = { ws: string; goal: string; measure: string };
const ids = (params: Params) => [idParam(params.ws, ID_RE), idParam(params.goal, ID_RE), idParam(params.measure, ID_RE)] as const;

export const GET = route<Params>(async (req, params) => {
  const source = commandForReading(deviceAuth(req), ...ids(params));
  return Response.json(source, { headers: { "cache-control": "private, no-store" } });
});

export const POST = route<Params>(async (req, params) => {
  const device = deviceAuth(req);
  const target = ids(params);
  commandForReading(device, ...target);
  const { id, created } = await recordCommandReading(device, ...target, await readJson(req, 4096));
  return Response.json({ id }, { status: created ? 201 : 200 });
});
