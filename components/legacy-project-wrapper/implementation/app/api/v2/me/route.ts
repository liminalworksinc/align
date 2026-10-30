import { eitherAuth, route } from "@/lib/v2/http";
import { workspacesFor } from "@/lib/v2/workspaces";

// GET /api/v2/me (Bearer or cookie): who this is, the device (Bearer only), and the workspaces in reach.
export const GET = route(async (req) => {
  const p = await eitherAuth(req);
  return {
    user: p.user,
    device: p.kind === "device" ? { id: p.deviceId, name: p.deviceName } : null,
    workspaces: workspacesFor(p),
  };
});
