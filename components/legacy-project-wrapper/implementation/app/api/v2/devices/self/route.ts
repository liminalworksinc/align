import { revokeDevice } from "@/lib/v2/devices";
import { deviceAuth, noContent, route } from "@/lib/v2/http";

// DELETE /api/v2/devices/self[?replaced_by=<device id>] (Bearer): log this device out (revokes all its tokens). With
// replaced_by, the device of the same person that replaced it on this machine (`align login`) takes its name, whatever
// it is, when it got a later "<name> (n)" only because this one was still live (lib/v2/devices.ts passNameOn).
export const DELETE = route(async (req) => {
  const d = deviceAuth(req);
  const by = new URL(req.url).searchParams.get("replaced_by");
  await revokeDevice(d.deviceId, "logout", d.user.id, by && /^dv_[A-Za-z0-9_-]{1,80}$/.test(by) ? by : null);
  return noContent();
});
