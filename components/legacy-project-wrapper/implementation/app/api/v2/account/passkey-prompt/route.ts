import { dismissPasskeyPrompt } from "@/lib/v2/account";
import { noContent, route, webWrite } from "@/lib/v2/http";

// DELETE /api/v2/account/passkey-prompt (cookie): "Not now" on the "add a passkey" prompt, remembered for this person.
export const DELETE = route(async (req) => {
  const p = await webWrite(req);
  await dismissPasskeyPrompt(p.user.id);
  return noContent();
});
