import { listDevices } from "@/lib/v2/devices";
import { eitherAuth, route } from "@/lib/v2/http";

// GET /api/v2/devices (cookie, or Bearer): my paired devices. A device sees the same list, its own marked `current`,
// so `align login` can name the person's other devices that are still paired.
export const GET = route(async (req) => {
  const p = await eitherAuth(req);
  const devices = listDevices(p.user.id);
  return { devices: p.kind === "device" ? devices.map((d) => ({ ...d, current: d.id === p.deviceId })) : devices };
});
