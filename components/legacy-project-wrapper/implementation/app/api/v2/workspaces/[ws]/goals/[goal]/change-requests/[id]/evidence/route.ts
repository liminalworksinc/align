import { addEvidence } from "@/lib/v2/changes";
import { eitherWrite, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../change-requests/:id/evidence { kind, url, label, revision? } (cookie or device token, body at most 8 KB):
// add an evidence link to the request's current revision. A web session adds it as a person (self-reported); a device
// token as an agent (agent-reported).
export const POST = route<{ ws: string; goal: string; id: string }>(async (req, params) => {
  const who = await eitherWrite(req);
  const pp = enter(who, idParam(params.ws, ID_RE));
  const body = await readJson(req, 8 * 1024);
  return Response.json(await addEvidence(pp, idParam(params.goal, ID_RE), idParam(params.id, ID_RE), body, who.kind === "web" ? "person" : "agent"), { status: 201 });
});
