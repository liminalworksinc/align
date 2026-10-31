import { idParam, readJson, requireRecentSignIn, route, webAuth, webWrite } from "@/lib/v2/http";
import { POD_ROLES, WS_ROLES } from "@/lib/v2/policy";
import { ID_RE, oneOf, optOneOf, optStr, str } from "@/lib/v2/validate";
import { createInvite, enter, listInvites } from "@/lib/v2/workspaces";

// GET (owners): open and accepted invites. POST { email, role, team_id?, team_role? } (owners): an invite link to
// send yourself; accepting it also adds the person to the named team (team_role member by default). An invite with role
// owner hands out ownership, so it needs a sign-in from the last 15 minutes (403 reauth_required).
export const GET = route<{ ws: string }>(async (req, params) => ({ invites: listInvites(enter(await webAuth(req), idParam(params.ws, ID_RE))) }));

export const POST = route<{ ws: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  const team = { id: optStr(b, "team_id", 64), role: optOneOf(b, "team_role", POD_ROLES) };
  const role = oneOf(b, "role", WS_ROLES);
  if (role === "owner" && pp.wsRole === "owner") requireRecentSignIn(p, "invite an owner");
  return Response.json(await createInvite(pp, str(b, "email", 254), role, team), { status: 201 });
});
