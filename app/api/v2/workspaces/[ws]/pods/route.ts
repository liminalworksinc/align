import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE, str } from "@/lib/v2/validate";
import { createPod, enter } from "@/lib/v2/workspaces";

// POST /api/v2/workspaces/:ws/pods (owners) { name }
export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return Response.json(await createPod(pp, str(b, "name", 100)), { status: 201 });
});
