import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ingestUsage } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (Bearer): an idempotent usage batch, at most 500 rows and 256 KB.
export const POST = route<{ ws: string; key: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  return ingestUsage(pp, dev, idParam(params.key, SESSION_KEY_RE), await readJson(req, 256 * 1024));
});
