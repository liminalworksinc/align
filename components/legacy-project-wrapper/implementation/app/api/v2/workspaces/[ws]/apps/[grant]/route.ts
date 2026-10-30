import { GRANT_ID, revokeGrant } from "@/lib/oauth/grants";
import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// DELETE (cookie): disconnect one AI app. Its person or a workspace owner; any other grant is not found. Its access and
// refresh tokens stop at once (they are checked against the grant on every use).
export const DELETE = route<{ ws: string; grant: string }>(async (req, params) => {
  await revokeGrant(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.grant, GRANT_ID));
  return noContent();
});
