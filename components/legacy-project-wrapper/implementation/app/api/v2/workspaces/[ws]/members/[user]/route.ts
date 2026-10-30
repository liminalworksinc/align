import { idParam, noContent, readJson, route, webWrite } from "@/lib/v2/http";
import { WS_ROLES } from "@/lib/v2/policy";
import { ID_RE, oneOf } from "@/lib/v2/validate";
import { enter, removeMember, setMemberRole } from "@/lib/v2/workspaces";

// POST (owners) { role: owner|member|viewer }: change a member's role. 409 last_owner if no owner would remain.
export const POST = route<{ ws: string; user: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return setMemberRole(pp, idParam(params.user, ID_RE), oneOf(b, "role", WS_ROLES));
});

// DELETE: an owner removes a member, or anyone leaves by naming their own id. 409 last_owner for the only owner.
export const DELETE = route<{ ws: string; user: string }>(async (req, params) => {
  await removeMember(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.user, ID_RE));
  return noContent();
});
