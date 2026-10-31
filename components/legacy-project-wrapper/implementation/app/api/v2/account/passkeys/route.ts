import { listPasskeys, passkeyPromptDue } from "@/lib/v2/account";
import { route, webAuth } from "@/lib/v2/http";

// GET /api/v2/account/passkeys (cookie): my passkeys ({id, name, created_at, last_used_at}) and whether the "add a
// passkey" prompt is due. Adding one is Better Auth's ceremony at /api/v2/auth/passkey/* (a recent sign-in).
export const GET = route(async (req) => {
  const p = await webAuth(req);
  return { passkeys: listPasskeys(p.user.id), prompt: passkeyPromptDue(p.user.id) };
});
