import { config } from "@/lib/config";
import { signOutEverywhere } from "@/lib/v2/account";
import { COOKIE_PREFIX } from "@/lib/v2/auth";
import { badRequest } from "@/lib/v2/errors";
import { readJson, requireRecentSignIn, route, webWrite } from "@/lib/v2/http";
import type { Body } from "@/lib/v2/validate";

const flag = (b: Body, k: string): boolean => {
  if (b[k] === undefined) return false;
  if (typeof b[k] !== "boolean") throw badRequest(`${k} must be true or false`);
  return b[k] as boolean;
};

// POST /api/v2/account/sign-out-everywhere (cookie) { devices?, apps? }: end every web session of mine, this one
// included; with devices also revoke every paired device, with apps also disconnect every AI app in every workspace.
// Needs a sign-in from the last 15 minutes (403 reauth_required). Answers {sessions, devices, apps} (how many ended)
// and clears this browser's session cookie.
export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 1024);
  const also = { devices: flag(b, "devices"), apps: flag(b, "apps") };
  requireRecentSignIn(p, "sign out everywhere");
  const out = await signOutEverywhere(p.user.id, also);
  const hosted = config().hosted;
  const cookie = `${hosted ? "__Secure-" : ""}${COOKIE_PREFIX}.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${hosted ? "; Secure" : ""}`;
  return Response.json(out, { headers: { "set-cookie": cookie } });
});
