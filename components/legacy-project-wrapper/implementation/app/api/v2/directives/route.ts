import { directivesFor, endedSessionsFor, parseCursor } from "@/lib/v2/directives";
import { deviceAuth, route } from "@/lib/v2/http";

// GET /api/v2/directives?cursor=<seq> (Bearer): up to 100 directives for this device's sessions, and `workspaces`: the
// ids of the workspaces this device can reach now, so a device learns a workspace it gained (an invite accepted with
// this device ticked) or lost at its next pass, without re-reading /me every time; and `ended_sessions`: this device's
// sessions whose share the server ended (Stop sharing on the web, say), so the device ends its own share at its next
// pass instead of at the session's next usage upload.
export const GET = route(async (req) => {
  const dev = deviceAuth(req);
  const cursor = parseCursor(new URL(req.url).searchParams.get("cursor"));
  const directives = directivesFor(dev, cursor, 100);
  return { directives, next_cursor: String(directives.length ? directives[directives.length - 1].seq : cursor), workspaces: [...dev.grants].sort(), ended_sessions: endedSessionsFor(dev) };
});
