import { authorize } from "@/lib/v2/devices";
import { clientKey, originOf, readJson, rejectBrowser, route } from "@/lib/v2/http";
import { b64url, str } from "@/lib/v2/validate";

// POST /api/v2/device/authorize (no auth; 10 per hour per client): start pairing a device key.
export const POST = route(async (req) => {
  rejectBrowser(req);
  const b = await readJson(req, 4096);
  return authorize({ device_name: str(b, "device_name", 100), public_key: b64url(b, "public_key", 43, 43) }, clientKey(req), originOf(req));
});
