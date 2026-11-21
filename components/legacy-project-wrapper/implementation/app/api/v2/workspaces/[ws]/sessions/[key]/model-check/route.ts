import { modelSendWindow } from "@/lib/v2/data-sharing";
import { deviceAuth, idParam, route } from "@/lib/v2/http";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const POST = route<{ ws: string; key: string }>(async (req, { ws, key }) => {
  const dev = deviceAuth(req);
  return Response.json(await modelSendWindow(enter(dev, idParam(ws, ID_RE)), dev, idParam(key, SESSION_KEY_RE)), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
