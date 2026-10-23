import { agentOrRefuse, assertSessionInGrant } from "@/lib/agent-token";
import { markDelivered } from "@/lib/directives";
import { bus } from "@/lib/events";
import { cappedJson, handle } from "@/lib/http";
import { assertLocal } from "@/lib/local-guard";
import { HttpError, mutate, mutateWs, now } from "@/lib/store";

const ID = /^[\w.:*-]{1,200}$/;

// The watcher confirms it handed a directive to the agent (and is about to wake it). The body is small and capped;
// only an authority event that exists is recorded (markDelivered), so an ack can't grow a workspace's state. With an
// agent token, the session must be the token's own harness and repo.
export async function POST(req: Request) {
  return handle(async () => {
    assertLocal(req);
    const b = await cappedJson<{ session?: unknown; event_id?: unknown }>(req, 4 * 1024);
    if (typeof b.session !== "string" || typeof b.event_id !== "string" || !ID.test(b.session) || !ID.test(b.event_id))
      throw new HttpError(400, "session and event_id are required");
    const session = b.session;
    const eventId = b.event_id;
    const agent = agentOrRefuse(req); // an agent token acknowledges in its own workspace
    const mark = (s: Parameters<typeof markDelivered>[0]) => {
      if (agent) assertSessionInGrant(s, agent, session);
      return markDelivered(s, session, eventId);
    };
    const fresh = agent ? await mutateWs(agent.ws, mark) : await mutate(mark);
    if (fresh && !agent) bus.emit("delivered", { session, event_id: eventId, at: now() }); // the wire view is the default store's
    return { ok: true, fresh };
  });
}
