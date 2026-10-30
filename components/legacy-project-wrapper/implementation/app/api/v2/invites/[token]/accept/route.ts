import { route, webWrite } from "@/lib/v2/http";
import { acceptInvite } from "@/lib/v2/workspaces";

// POST /api/v2/invites/:token/accept (cookie): join, if the signed-in email is the invited one.
export const POST = route<{ token: string }>(async (req, { token }) => {
  const p = await webWrite(req);
  return acceptInvite(token, p.user, p.emailVerified);
});
