import { bindWs, loginWorkspace, wsSessionFrom, type WsSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { audit } from "@/lib/flow";
import { cappedJson, handle, requireJson } from "@/lib/http";
import { checkAuthorize, issueCode, originOf, redirectWith } from "@/lib/oauth/server";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { checkLoginBackoff, clearLoginFailures, clientOf, recordLoginFailure, takeWorkspaceAction, withSigninSlot } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";
import { isRole, parseCustomWs, workspaceExists, type CustomWsId } from "@/lib/workspace";

// The consent step of /oauth/authorize. The page posts the app's authorization request back with the person's
// answer; everything is checked again here (the page is only a form). JSON only, with the exact https Origin when
// hosted, so another site can't approve on someone's behalf (login CSRF). The person proves the workspace either
// with the session this browser already has or with a role passcode, through the same backoff and scrypt slots as
// sign-in. The answer is where to send the browser next: the app's redirect URI with a code, or with access_denied.

const WS_IN = /w_[a-z2-7]{12}/;

interface Body {
  params?: Record<string, string>;
  decision?: string;
  workspace?: string;
  role?: string;
  passcode?: string;
  use_session?: boolean;
}

/** The custom workspace session this browser holds, or null. */
function currentSession(req: Request): (WsSession & { ws: CustomWsId }) | null {
  try {
    const s = wsSessionFrom(req);
    return s && s.ws !== "northstar" ? (s as WsSession & { ws: CustomWsId }) : null;
  } catch {
    return null; // ended: treated as signed out
  }
}

async function signIn(req: Request, b: Body): Promise<WsSession & { ws: CustomWsId }> {
  const ws = parseCustomWs(WS_IN.exec(String(b.workspace ?? ""))?.[0]);
  const client = clientOf(req);
  const key = ws && workspaceExists(ws) && isRole(b.role) ? `ws:${ws}:${b.role}:${client}` : null;
  if (key) {
    checkLoginBackoff(key);
    recordLoginFailure(key);
  }
  const go = () => loginWorkspace(ws, b.role, b.passcode);
  const out = config().hosted ? await withSigninSlot(client, go) : await go();
  if (key) clearLoginFailures(key);
  return out.session as WsSession & { ws: CustomWsId };
}

export async function POST(req: Request) {
  return handle(async () => {
    requireJson(req); // JSON only, this host, exact Origin when hosted
    takeOAuthCall(clientOf(req), "approve");
    const b = await cappedJson<Body>(req, 16 * 1024);
    const params = b.params && typeof b.params === "object" ? Object.fromEntries(Object.entries(b.params).map(([k, v]) => [k, String(v)])) : {};
    const origin = originOf(req);
    const check = await checkAuthorize(params, origin);
    if (!check.ok) {
      if ("fatal" in check) throw new HttpError(400, check.fatal);
      return { redirect: check.redirect };
    }
    const r = check.request;
    if (b.decision === "deny") return { redirect: redirectWith(r.redirect_uri, { error: "access_denied", error_description: "The person declined", state: r.state }, origin) };
    if (b.decision !== "approve") throw new HttpError(400, "Choose Allow or Cancel");
    const who = b.use_session ? currentSession(req) : await signIn(req, b);
    if (!who) throw new HttpError(401, "Your session ended. Sign in with a passcode.");
    takeWorkspaceAction(who.ws, "connect_app"); // an approve loop can't churn the audit archive
    await bindWs(who).mutate((s) => audit(s, who, "ai_app_approved", `${r.client.client_name} (${new URL(r.redirect_uri).host})`));
    return { redirect: redirectWith(r.redirect_uri, { code: issueCode(r, who.ws, who.actor), state: r.state }, origin) };
  });
}
