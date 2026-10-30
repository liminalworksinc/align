import { readJson, route, webWrite } from "@/lib/v2/http";
import { createSampleWorkspace } from "@/lib/v2/sample";

// POST /api/v2/workspaces/sample (cookie, any signed-in person): a new "Northstar (sample)" workspace that I own,
// counted like any workspace I create.
export const POST = route(async (req) => {
  const p = await webWrite(req);
  await readJson(req, 4096);
  return Response.json(await createSampleWorkspace(p.user.id), { status: 201 });
});
