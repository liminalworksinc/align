import { bearerOf, idParam, readJson, rejectBrowser, route } from "@/lib/v2/http";
import { recordCiReading, requireReadingCredential } from "@/lib/v2/readings";
import { ID_RE } from "@/lib/v2/validate";

export const POST = route<{ ws: string; goal: string; measure: string }>(async (req, params) => {
  rejectBrowser(req);
  const ws = idParam(params.ws, ID_RE);
  const secret = bearerOf(req) ?? "";
  requireReadingCredential(secret, ws);
  const goal = idParam(params.goal, ID_RE);
  const measure = idParam(params.measure, ID_RE);
  const reading = await recordCiReading(secret, ws, goal, measure, await readJson(req, 4096));
  return Response.json({ id: reading.id }, { status: reading.created ? 201 : 200 });
});
