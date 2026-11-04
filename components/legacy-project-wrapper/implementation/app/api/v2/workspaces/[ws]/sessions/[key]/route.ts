import { deviceAuth, eitherWrite, idParam, noContent, readJson, route } from "@/lib/v2/http";
import { deleteSession, putSession } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// PUT (Bearer): share or update a session. DELETE (Bearer or cookie, owner): hard-delete its shared history.
export const PUT = route<{ ws: string; key: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const pp = enter(dev, idParam(params.ws, ID_RE));
  return putSession(pp, dev, idParam(params.key, SESSION_KEY_RE), await readJson(req, 8192));
});

export const DELETE = route<{ ws: string; key: string }>(async (req, params) => {
  const p = await eitherWrite(req);
  await deleteSession(enter(p, idParam(params.ws, ID_RE)), p, idParam(params.key, SESSION_KEY_RE));
  return noContent();
});
