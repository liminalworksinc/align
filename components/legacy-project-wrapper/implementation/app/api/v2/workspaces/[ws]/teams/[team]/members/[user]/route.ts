import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter, removeTeamMember } from "@/lib/v2/workspaces";

// DELETE (workspace owners or the team's lead; a lead may remove themselves): remove a team member.
// Also served at /pods/:pod/members/:user (alias).
export const DELETE = route<{ ws: string; team?: string; pod?: string; user: string }>(async (req, params) => {
  await removeTeamMember(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.team ?? params.pod, ID_RE), idParam(params.user, ID_RE));
  return noContent();
});
