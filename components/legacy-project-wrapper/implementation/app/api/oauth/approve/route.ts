import { HttpError } from "@/lib/errors";
import { cappedJson, handle, requireJson } from "@/lib/http";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { checkAuthorize, issueCode, originOf, redirectWith } from "@/lib/oauth/server";
import { clientOf } from "@/lib/ratelimit";
import { audit, get, tx } from "@/lib/v2/db";
import { V2Error } from "@/lib/v2/errors";
import { requireRecentSignIn } from "@/lib/v2/http";
import { nowIso } from "@/lib/v2/ids";
import { ready } from "@/lib/v2/init";

// The consent step of /oauth/authorize. The page posts the app's authorization request back with the person's answer
// and the workspace they chose; everything is checked again here (the page is only a form). JSON only, with the exact
// https Origin when hosted, so another site can't approve on someone's behalf. Approving needs a Better Auth session
// from the last 15 minutes and a workspace where the person is an owner or member. The answer is where to send the
// browser next: the app's redirect URI with a code, or with access_denied.

interface Body {
  params?: Record<string, unknown>;
  decision?: unknown;
  workspace_id?: unknown;
}

const WS_ID = /^ws_[a-z2-7]{24}$/;

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
    await ready();
    let who;
    try {
      who = await requireRecentSignIn(req);
    } catch (e) {
      if (e instanceof V2Error && e.code === "reauth_required") throw new HttpError(403, "Sign in again to connect an app.", "reauth_required");
      if (e instanceof V2Error) throw new HttpError(401, "Sign in to Align first.");
      throw e;
    }
    if (b.workspace_id === undefined || b.workspace_id === null || b.workspace_id === "") throw new HttpError(400, "Choose a workspace");
    const ws = typeof b.workspace_id === "string" && WS_ID.test(b.workspace_id) ? b.workspace_id : null;
    const member = ws ? get<{ role: string }>("SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?", ws, who.user.id) : undefined;
    if (!ws || !member) throw new HttpError(404, "Workspace not found");
    if (member.role === "viewer") throw new HttpError(403, "Viewers can't connect apps");
    takeOAuthCall(ws, "approve_ws"); // an approve loop can't churn the workspace's audit
    const host = new URL(r.redirect_uri).host;
    await tx(() => audit(ws, who.user.id, "oauth.app_approved", `${r.client.client_name} (${host})`, nowIso()));
    return { redirect: redirectWith(r.redirect_uri, { code: issueCode(r, ws, who.user.id), state: r.state }, origin) };
  });
}
