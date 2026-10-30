import { createGoal, goalsFeed } from "@/lib/v2/goals";
import { eitherAuth, idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (Bearer or cookie): the goals feed, with ETag / If-None-Match -> 304.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await eitherAuth(req), idParam(params.ws, ID_RE));
  const feed = goalsFeed(pp);
  const etag = `"${feed.version}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  const inm = (req.headers.get("if-none-match") || "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (inm.includes(etag) || inm.includes("*")) return new Response(null, { status: 304, headers });
  return Response.json(feed, { headers });
});

// POST (cookie) { title, measures, visibility, pod_id, anchors }: a new goal owned by me.
export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await createGoal(pp, await readJson(req, 32 * 1024)), { status: 201 });
});
