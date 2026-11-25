import { EXCERPT_ID, readExcerpt, revokeExcerpt } from "@/lib/v2/excerpts";
import { idParam, noContent, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

type Params = { ws: string; id: string };

export const GET = route<Params>(async (req, { ws, id }) =>
  Response.json(await readExcerpt(enter(await webAuth(req), idParam(ws, ID_RE)), idParam(id, EXCERPT_ID)), {
    headers: { "Cache-Control": "private, no-store" },
  }));
export const DELETE = route<Params>(async (req, { ws, id }) => {
  await revokeExcerpt(enter(await webWrite(req), idParam(ws, ID_RE)), idParam(id, EXCERPT_ID));
  return noContent();
});
