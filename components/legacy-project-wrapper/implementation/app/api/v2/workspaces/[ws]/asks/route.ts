import { asksFeed, createAsk } from "@/lib/v2/asks";
import { eitherAuth, idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (Bearer or cookie) ?state=open,accepted&team_id=pod_…&limit=n: the asks this person can read, with ETag /
// If-None-Match -> 304 (the align agent keeps them in feeds/asks-<ws>.json).
// POST (cookie) { team_id, text, from_label?, goal_id?, source: {kind, title?, date} }: record an ask.
export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await eitherAuth(req), idParam(params.ws, ID_RE));
  const q = new URL(req.url).searchParams;
  const feed = asksFeed(pp, { state: q.get("state"), teamId: q.get("team_id"), limit: q.get("limit") });
  const etag = `"${feed.version}"`;
  const headers = { etag, "cache-control": "private, no-cache" };
  const inm = (req.headers.get("if-none-match") || "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (inm.includes(etag) || inm.includes("*")) return new Response(null, { status: 304, headers });
  return Response.json(feed, { headers });
});

export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await createAsk(pp, await readJson(req, 16 * 1024)), { status: 201 });
});
