import { token } from "@/lib/v2/devices";
import { badRequest } from "@/lib/v2/errors";
import { readJson, rejectBrowser, route } from "@/lib/v2/http";
import { b64url } from "@/lib/v2/validate";

// POST /api/v2/device/token: the agent polls until the user approves; 200 exactly once.
export const POST = route(async (req) => {
  rejectBrowser(req);
  const b = await readJson(req, 4096);
  if (b.grant_type !== "urn:ietf:params:oauth:grant-type:device_code") throw badRequest("unsupported grant_type", "unsupported_grant_type");
  return token(b64url(b, "device_code", 43, 128));
});
