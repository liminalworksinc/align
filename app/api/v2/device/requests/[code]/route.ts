import { lookupRequest } from "@/lib/v2/devices";
import { route, webAuth } from "@/lib/v2/http";

// GET /api/v2/device/requests/:user_code (cookie): the pending device behind a code, for /app/device.
export const GET = route<{ code: string }>(async (req, { code }) => {
  const p = await webAuth(req);
  return lookupRequest(p.user.id, code);
});
