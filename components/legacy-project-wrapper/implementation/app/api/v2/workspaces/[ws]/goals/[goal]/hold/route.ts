import { idParam, readJson, requireRecentSignIn, route, webAuth, webWrite } from "@/lib/v2/http";
import { getHold, holdGoal, releaseGoal, requireHolder } from "@/lib/v2/requests";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): { held, can_hold }. PUT { reason? }: hold every agent on the goal (201; 200 if already held).
// DELETE: release it. Holding and releasing are enforcement: the goal's approval set or a workspace owner, with a
// sign-in from the last 15 minutes.
export const GET = route<{ ws: string; goal: string }>(async (req, params) => getHold(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.goal, ID_RE)));

export const PUT = route<{ ws: string; goal: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  const goalId = idParam(params.goal, ID_RE);
  const b = await readJson(req, 4096);
  requireHolder(pp, goalId); // 404 or 403 before asking for a fresh sign-in
  requireRecentSignIn(p, "hold agents");
  const out = await holdGoal(pp, goalId, b);
  return Response.json(out.body, { status: out.status });
});

export const DELETE = route<{ ws: string; goal: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  const goalId = idParam(params.goal, ID_RE);
  requireHolder(pp, goalId);
  requireRecentSignIn(p, "release agents");
  return releaseGoal(pp, goalId);
});
