import { readJson, route, webWrite } from "@/lib/v2/http";
import { createSampleWorkspace } from "@/lib/v2/sample";
import { optStr } from "@/lib/v2/validate";

// POST /api/v2/workspaces/sample { creation_code? } (cookie, any signed-in person): a new "Northstar (sample)"
// workspace that I own, counted and gated like any workspace I create.
export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  return Response.json(await createSampleWorkspace(req, p, optStr(b, "creation_code", 100)), { status: 201 });
});
