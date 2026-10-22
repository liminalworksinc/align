import { bindWs, DISPLAY, login, loginWorkspace, sessionCookie, sessionFrom, wsSessionFrom, type WsSession } from "@/lib/auth";
import { body, handle, requireJson } from "@/lib/http";
import { slotOf } from "@/lib/labels";
import { checkLoginBackoff, clearLoginFailures, clientOf, recordLoginFailure } from "@/lib/ratelimit";
import { parseCustomWs, workspaceExists } from "@/lib/workspace";

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
    const b = await body<{ role?: string; passcode?: string; workspace?: unknown }>(req);
    // A primitive JSON body (42, "x", null) has no keys: it falls through to Northstar's 400, as before L0.
    if (b && typeof b === "object" && "workspace" in b) {
      // Custom workspace login: JSON only (login CSRF), soft backoff, one uniform 401.
      // Backoff is per workspace, role and client, so one person's wrong tries never lock the others out, and only
      // for a workspace that exists, so junk ids can't evict real entries. The attempt counts before the scrypt
      // await, so parallel tries can't all pass the check; success clears it.
      requireJson(req);
      const ws = parseCustomWs(b.workspace);
      const key = ws && workspaceExists(ws) ? `ws:${ws}:${String(b.role).slice(0, 20)}:${clientOf(req)}` : null;
      if (key) {
        checkLoginBackoff(key);
        recordLoginFailure(key);
      }
      const out = await loginWorkspace(b.workspace, b.role, b.passcode);
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
