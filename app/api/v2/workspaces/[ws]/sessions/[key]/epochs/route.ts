import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { openBindingEpoch } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer): open a binding epoch (closes the previous one at starts_at).
export const POST = route<{ ws: string; key: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  return openBindingEpoch(pp, dev, idParam(params.key, SESSION_KEY_RE), await readJson(req, 4096));
});
