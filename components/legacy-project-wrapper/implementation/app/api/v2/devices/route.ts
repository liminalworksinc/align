import { listDevices } from "@/lib/v2/devices";
import { route, webAuth } from "@/lib/v2/http";

// GET /api/v2/devices (cookie): my paired devices.
export const GET = route(async (req) => {
  const p = await webAuth(req);
  return { devices: listDevices(p.user.id) };
});
