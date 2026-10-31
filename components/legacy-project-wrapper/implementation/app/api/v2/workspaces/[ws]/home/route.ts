import { idParam, route, webAuth } from "@/lib/v2/http";
import { workspaceHome } from "@/lib/v2/home";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie, members and viewers): the workspace Home in one read: change requests, asks and alignments waiting on
// me or on others (with waiting_on), the active goals, and the connected AI apps with when each last connected, when it
// last read the goals, and its evidence class (a goal read is a delivery receipt; a connection alone is not observed).
// A section Align couldn't read is null (the page says "unknown"). Reads only.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return Response.json(workspaceHome(pp), { headers: { "cache-control": "no-store" } });
});
