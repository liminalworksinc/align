import { idParam, route, webAuth } from "@/lib/v2/http";
import { getReallocation } from "@/lib/v2/reallocations";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one reallocation, if I can read one of its goals.
export const GET = route<{ ws: string; id: string }>(async (req, params) => getReallocation(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.id, ID_RE)));
