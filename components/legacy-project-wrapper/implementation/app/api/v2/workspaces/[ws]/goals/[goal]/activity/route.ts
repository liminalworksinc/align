import { ACTIVITY_WINDOW_DAYS, goalActivity } from "@/lib/v2/goal-activity";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): agent activity toward the goal over the last 14 days, from bindings, usage times and work signals.
export const GET = route<{ ws: string; goal: string }>(async (req, params) => ({
  window_days: ACTIVITY_WINDOW_DAYS,
  ...goalActivity(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.goal, ID_RE)),
}));
