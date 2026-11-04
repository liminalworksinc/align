import { counterBase, dependencyChoices, dependencyLoops, versionLoops } from "@/lib/v2/changes";
import { goalDetail } from "@/lib/v2/goals";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one goal, its versions and what contributes to it, and the goals a change request from the reader may
// add as a dependency (dependency_choices, null when they can't propose). With ?counter=<request id>, dependency_choices
// are the goals the reader's counter on that request may add (null when they can't counter it). dependency_loops: the
// goals left out because they already depend on this goal (adding one would close a loop), for the same audience
// (null exactly when dependency_choices is). counter_base (with ?counter=): what that counter is compared with, the
// request's base version (null when dependency_choices is). version_loops: the same goals for the owner's New version form (null for
// anyone who can't save a version).
export const GET = route<{ ws: string; goal: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  const goal = idParam(params.goal, ID_RE);
  const c = new URL(req.url).searchParams.get("counter");
  const counter = c ? idParam(c, ID_RE) : undefined;
  const detail = goalDetail(pp, goal);
  return {
    ...detail,
    dependency_choices: dependencyChoices(pp, goal, counter),
    dependency_loops: dependencyLoops(pp, goal, counter),
    counter_base: counterBase(pp, goal, counter),
    version_loops: versionLoops(pp, goal, detail.can_edit),
  };
});
