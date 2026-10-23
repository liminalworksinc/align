import { badRequest } from "@/lib/v2/errors";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { spend, type SpendBy } from "@/lib/v2/spend";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

const time = (v: string | null, k: string) => {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw badRequest(`${k} must be an ISO 8601 time`);
  return new Date(t).toISOString();
};

// GET /api/v2/workspaces/:ws/spend?by=goal|pod|session&from&to (cookie)
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  const q = new URL(req.url).searchParams;
  const by = (q.get("by") || "goal") as SpendBy;
  if (!["goal", "pod", "session"].includes(by)) throw badRequest("by must be goal, pod or session");
  return spend(pp, by, time(q.get("from"), "from"), time(q.get("to"), "to"));
});
