import { deviceOwnedBy, revokeDevice } from "@/lib/v2/devices";
import { notFound } from "@/lib/v2/errors";
import { idParam, noContent, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";

// DELETE /api/v2/devices/:id (cookie): revoke one of my devices.
export const DELETE = route<{ id: string }>(async (req, params) => {
  const p = await webWrite(req);
  const id = idParam(params.id, ID_RE);
  if (!deviceOwnedBy(id, p.user.id)) throw notFound();
  await revokeDevice(id, "revoked_on_web");
  return noContent();
});
