import { setWorkSignals } from "@/lib/v2/data-sharing";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const PUT = route<{ ws: string; key: string }>(async (req, { ws, key }) => {
  const device = deviceAuth(req);
  const query = new URL(req.url).searchParams;
  const epochs = query.get("phase") === "dispatch" ? query.getAll("epoch").slice(0, 200) : null;
  return setWorkSignals(enter(device, idParam(ws, ID_RE)), device, idParam(key, SESSION_KEY_RE), await readJson(req, 1024), epochs);
});
