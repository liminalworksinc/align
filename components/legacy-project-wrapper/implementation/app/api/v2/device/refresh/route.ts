import { refresh } from "@/lib/v2/devices";
import { readJson, rejectBrowser, route } from "@/lib/v2/http";
import { b64url, str } from "@/lib/v2/validate";

// POST /api/v2/device/refresh: proof of possession (Ed25519 over the exact message), rotating refresh token.
export const POST = route(async (req) => {
  rejectBrowser(req);
  const b = await readJson(req, 4096);
  return refresh({ device_id: str(b, "device_id", 64), refresh_token: str(b, "refresh_token", 200), ts: str(b, "ts", 40), sig: b64url(b, "sig", 86, 88) });
});
