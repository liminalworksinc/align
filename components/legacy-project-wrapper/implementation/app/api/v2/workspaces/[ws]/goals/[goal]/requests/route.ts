import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { listRequests, sendRequest } from "@/lib/v2/requests";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): the goal's requests to its agents with per-session state, whether I may send one, and (for senders)
// the sessions on the goal. POST { type, note?, session_keys?, target_goal_id? }: send one (the goal's approval set or
// a workspace owner) -> 201 { request }.
export const GET = route<{ ws: string; goal: string }>(async (req, params) => listRequests(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.goal, ID_RE)));

export const POST = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await sendRequest(pp, idParam(params.goal, ID_RE), await readJson(req, 4096)), { status: 201 });
});
