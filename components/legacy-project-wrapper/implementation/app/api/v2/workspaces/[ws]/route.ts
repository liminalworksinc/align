import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter, workspaceDetail } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces/:ws (cookie): name, my role, members, pods.
export const GET = route<{ ws: string }>(async (req, params) => workspaceDetail(enter(await webAuth(req), idParam(params.ws, ID_RE))));
