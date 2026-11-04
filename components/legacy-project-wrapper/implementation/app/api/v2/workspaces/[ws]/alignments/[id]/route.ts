import { getAlignment } from "@/lib/v2/alignments";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): one request I am part of.
export const GET = route<{ ws: string; id: string }>(async (req, params) => getAlignment(enter(await webAuth(req), idParam(params.ws, ID_RE)), idParam(params.id, ID_RE)));
