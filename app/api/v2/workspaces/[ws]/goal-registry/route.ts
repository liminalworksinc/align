import { goalRegistry, registryEnabled } from "@/lib/v2/goal-registry";
import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

const read = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await eitherAuth(req), idParam(params.ws, ID_RE));
  return Response.json(goalRegistry(pp), { headers: { "cache-control": "private, no-store" } });
});

// Refuse before initialization as well as behind the normal v2 proxy gate.
export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }) {
  if (!registryEnabled()) return Response.json({ error: "not_found", message: "Not found" }, { status: 404 });
  return read(req, ctx);
}
