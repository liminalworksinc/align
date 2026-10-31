import { allocation, weeklyAllocation } from "@/lib/v2/allocation";
import { badRequest } from "@/lib/v2/errors";
import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { steeringCounts } from "@/lib/v2/steering";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

const time = (v: string | null, k: string) => {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw badRequest(`${k} must be an ISO 8601 time`);
  return new Date(t).toISOString();
};

// GET /api/v2/workspaces/:ws/allocation?from&to&weeks (Bearer or cookie): the share of shared agent time per goal
// against its target for [from, to) (default: the last 7 days), the last `weeks` calendar weeks (default 6, 1 to 26),
// and how many steering lines were shown in the window.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await eitherAuth(req), idParam(params.ws, ID_RE));
  const q = new URL(req.url).searchParams;
  const to = time(q.get("to"), "to");
  const from = time(q.get("from"), "from") ?? new Date((to ? Date.parse(to) : Date.now()) - 7 * 86_400_000).toISOString();
  const weeks = q.get("weeks") === null ? 6 : Number(q.get("weeks"));
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) throw badRequest("weeks must be 1 to 26");
  return { window: allocation(pp, from, to), weekly: weeklyAllocation(pp, weeks), steering: steeringCounts(pp, from, to) };
});
