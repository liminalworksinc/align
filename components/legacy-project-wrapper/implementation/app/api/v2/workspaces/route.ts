import { readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { str } from "@/lib/v2/validate";
import { createWorkspace, deletedWorkspacesFor, workspacesFor } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces (cookie): mine, and the deleted ones I own that can still be restored.
// POST { name }: create one (I am its owner).
export const GET = route(async (req) => {
  const p = await webAuth(req);
  return { workspaces: workspacesFor(p), deleted: deletedWorkspacesFor(p.user.id) };
});

export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  return Response.json(await createWorkspace(p.user.id, str(b, "name", 100)), { status: 201 });
});
