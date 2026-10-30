import { decideRequest } from "@/lib/v2/devices";
import { readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { str, strList } from "@/lib/v2/validate";

// POST /api/v2/device/approve (cookie) { user_code, workspace_ids }: grant this device the chosen workspaces.
// Needs a sign-in from the last 15 minutes (403 reauth_required); looking a code up and denying it do not.
export const POST = route(async (req) => {
  const p = await webWrite(req);
  requireRecentSignIn(p);
  const b = await readJson(req, 8192);
  return decideRequest(p.user.id, str(b, "user_code", 20), "approve", strList(b, "workspace_ids", { max: 50, itemMax: 64 }));
});
