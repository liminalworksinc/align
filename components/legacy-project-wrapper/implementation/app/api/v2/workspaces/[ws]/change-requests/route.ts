import { changeRequestGroups } from "@/lib/v2/changes";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie) ?state=: change requests on goals I can read, as { waiting_on_me, mine, others }.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return changeRequestGroups(pp, new URL(req.url).searchParams.get("state"));
});
