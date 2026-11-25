import { listExcerpts } from "@/lib/v2/excerpts";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, { ws }) =>
  Response.json(await listExcerpts(enter(await webAuth(req), idParam(ws, ID_RE))), { headers: { "Cache-Control": "private, no-store" } }));
