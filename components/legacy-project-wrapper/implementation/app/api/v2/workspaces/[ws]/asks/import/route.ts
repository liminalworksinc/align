import { importAsks } from "@/lib/v2/asks";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie, workspace owners) { asks: [...] } (at most 60): append and merge, never replace -> 201 {created, merged, unchanged}.
export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await importAsks(pp, await readJson(req, 512 * 1024)), { status: 201 });
});
