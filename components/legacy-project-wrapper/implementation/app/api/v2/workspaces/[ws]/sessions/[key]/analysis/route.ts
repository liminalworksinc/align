import { notFound } from "@/lib/v2/errors";
import { deleteFindings, putFinding, readFindings, resultSendWindow } from "@/lib/v2/data-sharing";
import { deviceAuth, eitherAuth, idParam, noContent, readJson, route } from "@/lib/v2/http";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

type Params = { ws: string; key: string };

function scope(req: Request, { ws, key }: Params) {
  const device = deviceAuth(req);
  return [enter(device, idParam(ws, ID_RE)), device, idParam(key, SESSION_KEY_RE)] as const;
}

export const GET = route<Params>(async (req, { ws, key }) => {
  const p = await eitherAuth(req);
  if (p.kind !== "device") throw notFound();
  const pp = enter(p, idParam(ws, ID_RE));
  const query = new URL(req.url).searchParams;
  const session = idParam(key, SESSION_KEY_RE);
  const phase = query.get("phase");
  if (phase === "dispatch" || phase === "answer") {
    return Response.json(await resultSendWindow(pp, p, session, query.get("epoch"), phase, query.get("revision")),
      { headers: { "Cache-Control": "private, no-store" } });
  }
  return readFindings(pp, p, session, query.get("status") === "1", query.get("epoch"));
});
export const POST = route<Params>(async (req, params) => putFinding(...scope(req, params), await readJson(req, 1024)));
export const DELETE = route<Params>(async (req, params) => {
  await deleteFindings(...scope(req, params), new URL(req.url).searchParams.get("before"));
  return noContent();
});
