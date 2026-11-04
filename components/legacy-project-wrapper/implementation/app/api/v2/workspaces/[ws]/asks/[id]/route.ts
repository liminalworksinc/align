import { getAsk } from "@/lib/v2/asks";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one ask I can read.
export const GET = route<{ ws: string; id: string }>(async (req, params) => getAsk(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.id, ID_RE)));
