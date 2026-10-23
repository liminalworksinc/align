import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { WS_ROLES } from "@/lib/v2/policy";
import { ID_RE, oneOf, str } from "@/lib/v2/validate";
import { createInvite, enter, listInvites } from "@/lib/v2/workspaces";

// GET (owners): open and accepted invites. POST { email, role } (owners): an invite link to send yourself.
export const GET = route<{ ws: string }>(async (req, params) => ({ invites: listInvites(enter(await webAuth(req), idParam(params.ws, ID_RE))) }));

export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return Response.json(await createInvite(pp, str(b, "email", 254), oneOf(b, "role", WS_ROLES)), { status: 201 });
});
