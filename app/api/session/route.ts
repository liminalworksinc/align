import { bindWs, DISPLAY, login, loginWorkspace, sessionCookie, sessionFrom, wsSessionFrom, type WsSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { body, handle, requireJson, requireSameOrigin } from "@/lib/http";
import { slotOf } from "@/lib/labels";
import { checkLoginBackoff, clearLoginFailures, clientOf, recordLoginFailure, withSigninSlot } from "@/lib/ratelimit";
import { isRole, parseCustomWs, workspaceExists } from "@/lib/workspace";

/** A custom workspace shows the person named for the role's team at setup. */
async function customName(w: WsSession) {
  const s = await bindWs(w).read();
  return s.teams?.[slotOf(w.actor)]?.lead ?? w.actor;
}

export async function GET(req: Request) {
  return handle(async () => {
    const w = wsSessionFrom(req);
    if (w && w.ws !== "northstar") return { actor: w.actor, name: await customName(w), sid: w.sid, workspace: w.ws };
    const s = sessionFrom(req);
    return { actor: s?.actor ?? null, name: s ? DISPLAY[s.actor] : null, sid: s?.sid ?? null };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    requireSameOrigin(req); // cross-port CSRF (review M4)
    const b = await body<{ role?: string; passcode?: string; workspace?: unknown }>(req);
    // A primitive JSON body (42, "x", null) has no keys: it falls through to Northstar's 400, as before L0.
    if (b && typeof b === "object" && "workspace" in b) {
      // Custom workspace login: JSON only (login CSRF), soft backoff, one uniform 401.
      // Backoff is per workspace, role and client, so one person's wrong tries never lock the others out, and only
      // for a workspace that exists, so junk ids can't evict real entries. The attempt counts before the scrypt
      // await, so parallel tries can't all pass the check; success clears it.
      requireJson(req);
      const ws = parseCustomWs(b.workspace);
      const client = clientOf(req);
      // Keys exist only for a real workspace and a real role, so junk ids and junk role strings can't evict entries.
      const key = ws && workspaceExists(ws) && isRole(b.role) ? `ws:${ws}:${b.role}:${client}` : null;
      if (key) {
        checkLoginBackoff(key);
        recordLoginFailure(key);
      }
      // Hosted: one client may hold only a couple of scrypt slots at once, correct passcodes included (review M1).
      // Mode L has one client key ("local") for everyone on the machine, so it isn't capped there.
      const signIn = () => loginWorkspace(b.workspace, b.role, b.passcode);
      const out = config().hosted ? await withSigninSlot(client, signIn) : await signIn();
      if (key) clearLoginFailures(key);
      const res = Response.json({ actor: out.session.actor, name: await customName(out.session), sid: out.session.sid, workspace: out.session.ws });
      res.headers.append("set-cookie", sessionCookie(out.token));
      return res;
    }
    const { token, session } = login(String(b.role), String(b.passcode ?? ""));
    const res = Response.json({ actor: session.actor, name: DISPLAY[session.actor], sid: session.sid });
    res.headers.append("set-cookie", sessionCookie(token));
    return res;
  });
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", sessionCookie(null));
  return res;
}
