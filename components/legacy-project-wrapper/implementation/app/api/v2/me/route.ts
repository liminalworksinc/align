import { deleteAccount } from "@/lib/v2/account";
import { eitherAuth, noContent, readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { str } from "@/lib/v2/validate";
import { workspacesFor } from "@/lib/v2/workspaces";

// GET /api/v2/me (Bearer or cookie): who this is, the device (Bearer only), and the workspaces in reach.
export const GET = route(async (req) => {
  const p = await eitherAuth(req);
  return {
    user: p.user,
    device: p.kind === "device" ? { id: p.deviceId, name: p.deviceName } : null,
    workspaces: workspacesFor(p),
  };
});

// DELETE /api/v2/me (cookie, a sign-in from the last 15 minutes) { email }: delete my account (lib/v2/account.ts).
// 400 when the typed email doesn't match, 403 reauth_required, 409 last_owner.
export const DELETE = route(async (req) => {
  const p = await webWrite(req);
  requireRecentSignIn(p);
  const b = await readJson(req, 4096);
  await deleteAccount(p, str(b, "email", 320));
  return noContent();
});
