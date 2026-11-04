import { listGrants } from "@/lib/oauth/grants";
import { MCP_PATH, originOf } from "@/lib/oauth/server";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie, members): the AI apps connected to this workspace (live OAuth grants) and the MCP URL to connect one.
// A workspace owner sees every grant; anyone else sees their own.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return Response.json({ url: `${originOf(req)}${MCP_PATH}`, apps: listGrants(pp) }, { headers: { "cache-control": "no-store" } });
});
