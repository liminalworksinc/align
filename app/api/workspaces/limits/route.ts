import { requireWsSession, type WsContext } from "@/lib/auth";
import { audit } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { slotOf } from "@/lib/labels";
import { decideLimit, parseSource, sentences, suggestLimits } from "@/lib/limits";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { HttpError } from "@/lib/store";
import type { CustomWsId } from "@/lib/workspace";

// Limits (lib/limits.ts). POST { notes, source: { title, date } }: anyone signed in pastes meeting notes (or types a
// limit); the sentences that state a limit become suggestions for the goal they are about. PATCH { id, action }:
// that goal's owner confirms (optionally with edited text), dismisses, or clears an agent's work flagged against it.

const MAX_NOTES = 20000;

function workspaceOf(req: Request): WsContext & { ws: CustomWsId } {
  const who = requireWsSession(req);
  if (who.ws === "northstar") throw new HttpError(404, "Limits are for workspaces");
  return who as WsContext & { ws: CustomWsId };
}

const now = () => new Date().toISOString();

export async function POST(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const b = await bodyFor<{ notes?: unknown; source?: unknown }>(req, who.ws);
    if (typeof b.notes !== "string" || !b.notes.trim()) throw new HttpError(400, "Paste the notes, or type the limit");
    if (b.notes.length > MAX_NOTES) throw new HttpError(400, `Notes are too long (${MAX_NOTES} characters at most)`);
    const notes = b.notes;
    // One sentence is a person typing a limit; it goes to their own goal when it names no other.
    const typed = sentences(notes).length === 1;
    const source = parseSource(b.source, typed ? "manual" : "meeting");
    takeWorkspaceAction(who.ws, "limits");
    return who.mutate((s) => {
      const ids = suggestLimits(s, notes, source, now(), typed ? slotOf(who.actor) : null, slotOf(who.actor));
      audit(s, who, "limits_suggested", String(ids.length));
      return { touched: ids.length, ids };
    });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const who = workspaceOf(req);
    const b = await bodyFor<{ id?: unknown; action?: unknown; text?: unknown; session?: unknown }>(req, who.ws);
    if (typeof b.id !== "string") throw new HttpError(400, "Send { id, action: confirm | dismiss | clear }");
    const id = b.id;
    return who.mutate((s) => {
      const l = decideLimit(s, who.actor, id, b.action, now(), b.text, b.session);
      audit(s, who, `limit_${String(b.action)}`, l.id);
      return { id: l.id, state: l.state };
    });
  });
}
