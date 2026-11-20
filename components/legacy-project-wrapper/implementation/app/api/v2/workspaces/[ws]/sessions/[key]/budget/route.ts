import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { ownSession, currentSessionBudget } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string; key: string }>(async (req, p) => {
  const principal = await eitherAuth(req), pp = enter(principal, idParam(p.ws, ID_RE));
  const key = idParam(p.key, SESSION_KEY_RE);
  ownSession(pp, principal, key);
  return currentSessionBudget(pp, key, new URL(req.url).searchParams.get("attribution") === "1");
});
