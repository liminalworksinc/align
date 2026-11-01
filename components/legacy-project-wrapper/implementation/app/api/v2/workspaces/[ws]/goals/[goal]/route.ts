import { dependencyChoices } from "@/lib/v2/changes";
import { goalDetail } from "@/lib/v2/goals";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one goal, its versions and what contributes to it, and the goals a change request from the reader may
// add as a dependency (dependency_choices, null when they can't propose).
export const GET = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  const goal = idParam(params.goal, ID_RE);
  return { ...goalDetail(pp, goal), dependency_choices: dependencyChoices(pp, goal) };
});
