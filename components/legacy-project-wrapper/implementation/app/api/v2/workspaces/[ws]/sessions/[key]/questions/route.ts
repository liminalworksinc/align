import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { askQuestion } from "@/lib/v2/questions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer; the device that shared the session) {client_id, goal_id, limit_id, files?, stretch_from, stretch_to}:
// ask the bound goal's owner one question about drift (LIM-2505). 201 with the new question, 200 with the open one.
export const POST = route<{ ws: string; key: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  const r = await askQuestion(pp, dev, idParam(params.key, SESSION_KEY_RE), await readJson(req, 16 * 1024));
  return Response.json(r, { status: r.fresh ? 201 : 200 });
});
