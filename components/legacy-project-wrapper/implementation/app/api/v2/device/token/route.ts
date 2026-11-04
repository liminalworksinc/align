import { token } from "@/lib/v2/devices";
import { badRequest } from "@/lib/v2/errors";
import { readJson, rejectBrowser, route } from "@/lib/v2/http";
import { b64url, ID_RE } from "@/lib/v2/validate";

// POST /api/v2/device/token: the agent polls until the user approves; 200 exactly once. `replaces` (optional): the
// device this pairing replaces on the same machine; it is left out when the new device's name is made unique, only when
// it is the approving person's own.
export const POST = route(async (req) => {
  rejectBrowser(req);
  const b = await readJson(req, 4096);
  if (b.grant_type !== "urn:ietf:params:oauth:grant-type:device_code") throw badRequest("unsupported grant_type", "unsupported_grant_type");
  if (b.replaces !== undefined && b.replaces !== null && (typeof b.replaces !== "string" || !ID_RE.test(b.replaces))) throw badRequest("replaces must be a device id");
  return token(b64url(b, "device_code", 43, 128), typeof b.replaces === "string" ? b.replaces : null);
});
