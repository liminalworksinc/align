import { excerptDispatch, excerptReaders, shareExcerpt } from "@/lib/v2/excerpts";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

type Params = { ws: string; key: string };

function scope(req: Request, { ws, key }: Params) {
  const dev = deviceAuth(req);
  return [enter(dev, idParam(ws, ID_RE)), dev, idParam(key, SESSION_KEY_RE)] as const;
}

export const GET = route<Params>(async (req, params) => {
  const args = scope(req, params);
  const query = new URL(req.url).searchParams;
  const phase = query.get("phase");
  const readers = phase === "dispatch" || phase === "answer"
    ? await excerptDispatch(...args, phase, query.get("revision")) : excerptReaders(...args);
  return Response.json(readers, { headers: { "Cache-Control": "private, no-store" } });
});
export const POST = route<Params>(async (req, params) =>
  shareExcerpt(...scope(req, params), await readJson(req, 32 * 1024), req.headers.get("if-match")));
