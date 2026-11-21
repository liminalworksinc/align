import { excerptReaders, shareExcerpt } from "@/lib/v2/excerpts";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

type Params = { ws: string; key: string };

function scope(req: Request, { ws, key }: Params) {
  const dev = deviceAuth(req);
  return [enter(dev, idParam(ws, ID_RE)), dev, idParam(key, SESSION_KEY_RE)] as const;
}

export const GET = route<Params>(async (req, params) =>
  Response.json(excerptReaders(...scope(req, params)), { headers: { "Cache-Control": "private, no-store" } }));
export const POST = route<Params>(async (req, params) =>
  shareExcerpt(...scope(req, params), await readJson(req, 32 * 1024)));
