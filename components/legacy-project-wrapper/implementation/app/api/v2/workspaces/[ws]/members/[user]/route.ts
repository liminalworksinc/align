import { idParam, noContent, readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { WS_ROLES } from "@/lib/v2/policy";
import { ID_RE, oneOf } from "@/lib/v2/validate";
import { enter, removeMember, setMemberRole } from "@/lib/v2/workspaces";

// POST (owners) { role: owner|member|viewer }: change a member's role (making someone an owner is how ownership passes
// on). 409 last_owner if no owner would remain. An owner needs a sign-in from the last 15 minutes (403
// reauth_required); anyone else gets the role refusal.
export const POST = route<{ ws: string; user: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  if (pp.wsRole === "owner") requireRecentSignIn(p, "change a role");
  const b = await readJson(req, 4096);
  return setMemberRole(pp, idParam(params.user, ID_RE), oneOf(b, "role", WS_ROLES));
});

// DELETE: an owner removes a member (with a sign-in from the last 15 minutes), or anyone leaves by naming their own
// id (no recent sign-in needed). 409 last_owner for the only owner. ?delete_sessions=1 also deletes the person's shared
// sessions in this workspace now.
export const DELETE = route<{ ws: string; user: string }>(async (req, params) => {
  const p = await webWrite(req);
  const pp = enter(p, idParam(params.ws, ID_RE));
  const user = idParam(params.user, ID_RE);
  if (user !== p.user.id && pp.wsRole === "owner") requireRecentSignIn(p, "remove a member");
  const deleteSessions = new URL(req.url).searchParams.get("delete_sessions") === "1";
  await removeMember(pp, user, { deleteSessions });
  return noContent();
});
