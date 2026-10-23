import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter, removePodMember } from "@/lib/v2/workspaces";

// DELETE (workspace owners or the pod's lead): remove a pod member.
export const DELETE = route<{ ws: string; pod: string; user: string }>(async (req, params) => {
  await removePodMember(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.pod, ID_RE), idParam(params.user, ID_RE));
  return noContent();
});
