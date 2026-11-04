import { idParam, route, webAuth } from "@/lib/v2/http";
import { listSessions } from "@/lib/v2/sessions";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): my shared sessions; for workspace owners also every shared session's alias and state.
export const GET = route<{ ws: string }>(async (req, params) => listSessions(enter(await webAuth(req), idParam(params.ws, ID_RE))));
