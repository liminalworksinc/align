import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { POD_ROLES } from "@/lib/v2/policy";
import { ID_RE, oneOf, str } from "@/lib/v2/validate";
import { enter, setTeamMember } from "@/lib/v2/workspaces";

// POST (workspace owners or the team's lead) { user_id, role: lead|member }: add or change a team member.
// Also served at /pods/:pod/members (alias), so the team id comes from either path segment.
export const POST = route<{ ws: string; team?: string; pod?: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  const b = await readJson(req, 4096);
  return setTeamMember(pp, idParam(params.team ?? params.pod, ID_RE), str(b, "user_id", 64), oneOf(b, "role", POD_ROLES));
});
