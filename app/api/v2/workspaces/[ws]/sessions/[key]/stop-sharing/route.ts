import { eitherWrite, idParam, route } from "@/lib/v2/http";
import { stopSharing } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer or cookie, owner): stop sharing from now on; no more uploads are accepted.
export const POST = route<{ ws: string; key: string }>(async (req, params) => {
  const p = await eitherWrite(req);
  return stopSharing(enter(p, idParam(params.ws, ID_RE)), p, idParam(params.key, SESSION_KEY_RE));
});
