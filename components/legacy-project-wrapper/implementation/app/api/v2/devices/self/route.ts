import { revokeDevice } from "@/lib/v2/devices";
import { deviceAuth, noContent, route } from "@/lib/v2/http";

// DELETE /api/v2/devices/self (Bearer): log this device out (revokes all its tokens).
export const DELETE = route(async (req) => {
  const d = deviceAuth(req);
  await revokeDevice(d.deviceId, "logout", d.user.id);
  return noContent();
});
