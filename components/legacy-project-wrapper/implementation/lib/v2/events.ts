import { secret } from "../secret";
import { eventActor, recordEvent, type EventName, type EventProps } from "./core.mts";
import { get, sql, tx } from "./db";

// Product events (PRESEED-007), bound to the app's database: lib/v2/core.mts recordEvent with the actor as the keyed
// hash of the person (eventActor). The code points call event() inside the transaction of the action they record, so
// an action that rolls back records nothing. The operator's report is `node scripts/align-admin.mjs report`
// (lib/v2/metrics-core.mts); Mode L records the same events, on its own machine only.

/** The keyed hash that stands for this person in v2_events. */
export const actorOf = (userId: string) => eventActor(secret(), userId);

/** Record one event inside the caller's tx(). `user` is the person whose action it is (null: nobody signed in). A
 *  first-time event already recorded for the workspace is skipped. True when a row was added. */
export function event(name: EventName, o: { ws?: string | null; user?: string | null; props?: EventProps; at?: string } = {}): boolean {
  return recordEvent(sql, name, { ws: o.ws ?? null, actor: o.user ? actorOf(o.user) : null, props: o.props, at: o.at });
}

/** A workspace's first MCP read, from a read-only tool call that has no transaction of its own: a read finds it already
 *  recorded almost always; otherwise one short transaction records it. Never fails the read. */
export function noteFirstMcpRead(wsId: string, userId: string, client: "app" | "device") {
  if (get("SELECT 1 AS x FROM v2_events WHERE name = 'first_mcp_read' AND ws_id = ?", wsId)) return;
  void tx(() => event("first_mcp_read", { ws: wsId, user: userId, props: { client } })).catch(() => undefined);
}
