import { readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { str } from "@/lib/v2/validate";
import { createWorkspace, workspacesFor } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces (cookie): mine. POST { name }: create one (I am its owner).
export const GET = route(async (req) => ({ workspaces: workspacesFor(await webAuth(req)) }));

export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  return Response.json(await createWorkspace(p.user.id, str(b, "name", 100)), { status: 201 });
});
