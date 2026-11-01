import { grantWorkspace } from "@/lib/v2/devices";
import { badRequest } from "@/lib/v2/errors";
import { idParam, readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { ID_RE, str } from "@/lib/v2/validate";

// POST /api/v2/devices/:id/workspaces (cookie, a sign-in from the last 15 minutes) { workspace_id }: give one of my
// live paired devices a workspace I am a member of, as accepting an invite with the device ticked does (audited
// device.workspace_added; ADR 0003 section 6). The device picks it up at its next sync. 404 for a device or a
// workspace that is not mine, 409 already_granted.
export const POST = route<{ id: string }>(async (req, params) => {
  const p = await webWrite(req);
  const id = idParam(params.id, ID_RE);
  const b = await readJson(req, 1024);
  const ws = str(b, "workspace_id", 80);
  if (!ID_RE.test(ws)) throw badRequest("workspace_id is not a workspace id");
  requireRecentSignIn(p, "give a device this workspace");
  return grantWorkspace(p.user.id, id, ws);
});
