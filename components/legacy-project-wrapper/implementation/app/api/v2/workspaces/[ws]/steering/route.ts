import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ingestSteering } from "@/lib/v2/steering";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer) { events: [{ session_key, goal_id, suggested_goal_id, share, target, at }] } -> { accepted }: steering
// lines this device's shared sessions showed, at most 100 per batch. Goal ids and whole percents only.
export const POST = route<{ ws: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  return ingestSteering(enter(dev, idParam(params.ws, ID_RE)), dev, await readJson(req, 32 * 1024));
});
