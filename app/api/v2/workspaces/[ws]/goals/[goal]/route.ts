import { goalDetail } from "@/lib/v2/goals";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one goal, its versions and what contributes to it.
export const GET = route<{ ws: string; goal: string }>(async (req, params) => goalDetail(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.goal, ID_RE)));
