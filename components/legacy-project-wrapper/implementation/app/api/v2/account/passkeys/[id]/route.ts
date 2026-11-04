import { deletePasskey, renamePasskey } from "@/lib/v2/account";
import { idParam, noContent, readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import { str } from "@/lib/v2/validate";

const PASSKEY_ID = /^[a-z2-7]{32}$/;

// PATCH /api/v2/account/passkeys/:id (cookie) { name }: rename one of my passkeys (1 to 100 characters).
export const PATCH = route<{ id: string }>(async (req, params) => {
  const p = await webWrite(req);
  const id = idParam(params.id, PASSKEY_ID);
  const b = await readJson(req, 4096);
  return renamePasskey(p.user.id, id, str(b, "name", 100));
});

// DELETE (cookie): delete one of my passkeys. Needs a sign-in from the last 15 minutes (403 reauth_required).
export const DELETE = route<{ id: string }>(async (req, params) => {
  const p = await webWrite(req);
  const id = idParam(params.id, PASSKEY_ID);
  requireRecentSignIn(p, "delete a passkey");
  await deletePasskey(p.user.id, id);
  return noContent();
});
