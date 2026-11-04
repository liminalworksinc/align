import { badRequest } from "@/lib/v2/errors";
import { readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { ID_RE, strList } from "@/lib/v2/validate";
import { acceptInvite } from "@/lib/v2/workspaces";

// POST /api/v2/invites/:token/accept (cookie) { device_ids? }: join, if the signed-in email is the invited one. Each of
// `device_ids` (my own paired devices, not revoked) gets this workspace too; that needs a sign-in from the last 15
// minutes (403 reauth_required), and another person's, a revoked or an unknown device is 404, joining nothing.
export const POST = route<{ token: string }>(async (req, { token }) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  // A blank id is a malformed one (400), not "no device": it would otherwise be dropped and the person join without it.
  if (Array.isArray(b.device_ids) && b.device_ids.some((x) => typeof x === "string" && !x.trim())) throw badRequest("device_ids must be device ids");
  const deviceIds = strList(b, "device_ids", { max: 20, itemMax: 64 });
  if (deviceIds.some((id) => !ID_RE.test(id))) throw badRequest("device_ids must be device ids");
  return acceptInvite(token, p.user, p.emailVerified, deviceIds, () => requireRecentSignIn(p, "give a device this workspace"));
});
