import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { auditTrail, enter } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces/:ws/audit (owners): the newest 200 audit rows, each naming its actor.
export const GET = route<{ ws: string }>(async (req, params) => ({ audit: auditTrail(enter(await webAuth(req), idParam(params.ws, ID_RE))) }));
