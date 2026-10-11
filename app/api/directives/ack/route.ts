import { markDelivered } from "@/lib/directives";
import { bus } from "@/lib/events";
import { body, handle } from "@/lib/http";
import { assertLocal } from "@/lib/local-guard";
import { HttpError, mutate, now } from "@/lib/store";

// The watcher confirms it handed a directive to the agent (and is about to wake it).
export async function POST(req: Request) {
  return handle(async () => {
    assertLocal(req);
    const b = await body<{ session?: string; event_id?: string }>(req);
    if (!b.session || !b.event_id) throw new HttpError(400, "session and event_id are required");
    const fresh = await mutate((s) => markDelivered(s, b.session!, b.event_id!));
    if (fresh) bus.emit("delivered", { session: b.session, event_id: b.event_id, at: now() });
    return { ok: true, fresh };
  });
}
