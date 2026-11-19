import { dataRestrictions, setDataRestriction, suggestionSendWindow } from "@/lib/v2/data-sharing";
import { eitherAuth, idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter, need } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, { ws }) => {
  const principal = await eitherAuth(req);
  const pp = enter(principal, idParam(ws, ID_RE));
  const query = new URL(req.url).searchParams;
  if (query.get("for") === "model-suggestion") {
    if (principal.kind === "device") {
      return Response.json(await suggestionSendWindow(pp, principal, query.get("phase"), query.get("revision"), query.get("recipient") === "workspace"), { headers: { "Cache-Control": "private, no-store" } });
    }
    need(pp, "session.share");
  }
  return dataRestrictions(pp);
});

export const PATCH = route<{ ws: string }>(async (req, { ws }) => {
  const pp = enter(await webWrite(req), idParam(ws, ID_RE));
  return setDataRestriction(pp, await readJson(req, 4096));
});
