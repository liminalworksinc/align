import { directivesFor, parseCursor } from "@/lib/v2/directives";
import { deviceAuth, route } from "@/lib/v2/http";

// GET /api/v2/directives?cursor=<seq> (Bearer): up to 100 directives for this device's sessions.
export const GET = route(async (req) => {
  const dev = deviceAuth(req);
  const cursor = parseCursor(new URL(req.url).searchParams.get("cursor"));
  const directives = directivesFor(dev, cursor, 100);
  return { directives, next_cursor: String(directives.length ? directives[directives.length - 1].seq : cursor) };
});
