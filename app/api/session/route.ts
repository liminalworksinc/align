import { COOKIE, DISPLAY, login, sessionFrom } from "@/lib/auth";
import { body, handle } from "@/lib/http";


export async function GET(req: Request) {
  return handle(async () => {
    const s = sessionFrom(req);
    return { actor: s?.actor ?? null, name: s ? DISPLAY[s.actor] : null, sid: s?.sid ?? null };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<{ role?: string; passcode?: string }>(req);
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
