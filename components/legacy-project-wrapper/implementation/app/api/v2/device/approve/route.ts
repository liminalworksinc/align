import { decideRequest } from "@/lib/v2/devices";
import { readJson, route, webWrite } from "@/lib/v2/http";
import { str, strList } from "@/lib/v2/validate";

// POST /api/v2/device/approve (cookie) { user_code, workspace_ids }: grant this device the chosen workspaces.
export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 8192);
  return decideRequest(p.user.id, str(b, "user_code", 20), "approve", strList(b, "workspace_ids", { max: 50, itemMax: 64 }));
});
