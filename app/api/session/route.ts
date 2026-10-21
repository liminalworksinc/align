import { bindWs, COOKIE, DISPLAY, login, loginWorkspace, sessionFrom, wsSessionFrom, type WsSession } from "@/lib/auth";
import { body, handle, requireJson } from "@/lib/http";
import { slotOf } from "@/lib/labels";
import { checkLoginBackoff, clearLoginFailures, recordLoginFailure } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";

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
    if ("workspace" in b) {
      // Custom workspace login: JSON only (login CSRF), soft backoff per workspace, one uniform 401.
      requireJson(req);
      const key = `ws:${String(b.workspace).slice(0, 40)}`;
      checkLoginBackoff(key);
      let out: Awaited<ReturnType<typeof loginWorkspace>>;
      try {
        out = await loginWorkspace(b.workspace, b.role, b.passcode);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) recordLoginFailure(key);
        throw e;
      }
      clearLoginFailures(key);
      const res = Response.json({ actor: out.session.actor, name: await customName(out.session), sid: out.session.sid, workspace: out.session.ws });
      res.headers.append("set-cookie", `${COOKIE}=${encodeURIComponent(out.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
      return res;
    }
    const { token, session } = login(String(b.role), String(b.passcode ?? ""));
    const res = Response.json({ actor: session.actor, name: DISPLAY[session.actor], sid: session.sid });
    res.headers.append("set-cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
    return res;
  });
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  return res;
}
