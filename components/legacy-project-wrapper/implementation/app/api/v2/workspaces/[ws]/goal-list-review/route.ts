import { goalListReview, recordGoalListReview } from "@/lib/v2/goal-list-review";
import { tx } from "@/lib/v2/db";
import { notFound } from "@/lib/v2/errors";
import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { canReviewGoalList, enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, params) => {
  const user = await webAuth(req);
  const ws = idParam(params.ws, ID_RE);
  const review = await tx(() => goalListReview(enter(user, ws)));
  return Response.json(review, { headers: { "cache-control": "no-store" } });
});

export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  if (!canReviewGoalList(pp)) throw notFound();
  return recordGoalListReview(pp, await readJson(req, 2048));
});
