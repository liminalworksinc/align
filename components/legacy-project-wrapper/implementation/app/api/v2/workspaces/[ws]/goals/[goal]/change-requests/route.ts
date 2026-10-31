import { createChangeRequest, listChangeRequests } from "@/lib/v2/changes";
import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie) ?state=: this goal's change requests. POST { base_version, changes, reason }: propose a change to a
// goal I can read but don't own.
export const GET = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return { change_requests: listChangeRequests(pp, { goalId: idParam(params.goal, ID_RE), state: new URL(req.url).searchParams.get("state") }) };
});

export const POST = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await createChangeRequest(pp, idParam(params.goal, ID_RE), await readJson(req, 32 * 1024)), { status: 201 });
});
