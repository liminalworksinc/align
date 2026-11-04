import { decideRequest, userCodeOf } from "@/lib/v2/devices";
import { readJson, route, webWrite } from "@/lib/v2/http";

// POST /api/v2/device/deny (cookie) { user_code }
export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  return decideRequest(p.user.id, userCodeOf(b), "deny", []);
});
