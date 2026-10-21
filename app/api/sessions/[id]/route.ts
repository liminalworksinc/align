import { requireSession } from "@/lib/auth";
import { handle } from "@/lib/http";
import { HttpError, id as newId, mutate, now } from "@/lib/store";
import type { AppState } from "@/lib/types";

// B1-2: delete one captured agent session and every mapping for it. The audit records only the session id.

function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {}
  if (!host || host !== req.headers.get("host")) throw new HttpError(403, "This request came from another site");
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  return handle(async () => {
    const who = requireSession(req);
    assertSameOrigin(req);
    const { id } = await ctx.params;
    if (!/^(claude-code|codex):[\w.:-]{1,128}$/.test(id)) throw new HttpError(400, "Invalid session id");
    return mutate((s) => {
      if (!s.sessions.some((x) => x.id === id)) throw new HttpError(404, "No such session");
      s.sessions = s.sessions.filter((x) => x.id !== id);
      s.mappings = s.mappings.filter((m) => m.session_id !== id);
      s.audit.push({ id: newId("a"), actor: who.actor, session_id: who.sid, action: "delete_session", target: id, at: now() } as AppState["audit"][number]);
      return { ok: true, id };
    });
  });
}
