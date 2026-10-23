import { activityFor, ingestActivity } from "@/lib/v2/activity";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer) { items: [...] }: this device's in-flight activity, at most 200 items and 128 KB.
export const POST = route<{ ws: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  return ingestActivity(pp, dev, await readJson(req, 128 * 1024));
});

// GET (Bearer) ?after=<seq>: unexpired activity on goals this user may read, oldest first, at most 500.
export const GET = route<{ ws: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  return activityFor(pp, Number.isSafeInteger(after) && after >= 0 ? after : 0);
});
