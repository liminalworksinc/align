import { agentFrom } from "@/lib/agent-token";
import { markDelivered } from "@/lib/directives";
import { bus } from "@/lib/events";
import { body, handle } from "@/lib/http";
import { assertLocal } from "@/lib/local-guard";
import { HttpError, mutate, mutateWs, now } from "@/lib/store";

// The watcher confirms it handed a directive to the agent (and is about to wake it).
export async function POST(req: Request) {
  return handle(async () => {
    assertLocal(req);
    const b = await body<{ session?: string; event_id?: string }>(req);
    if (!b.session || !b.event_id) throw new HttpError(400, "session and event_id are required");
    const agent = agentFrom(req); // an agent token acknowledges in its own workspace
    const mark = (s: Parameters<typeof markDelivered>[0]) => markDelivered(s, b.session!, b.event_id!);
    const fresh = agent ? await mutateWs(agent.ws, mark) : await mutate(mark);
    if (fresh && !agent) bus.emit("delivered", { session: b.session, event_id: b.event_id, at: now() }); // the wire view is the default store's
    return { ok: true, fresh };
  });
}
