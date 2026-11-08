// Bind the qualified product-event wrapper to the app's actual providers.
import { create_events } from "../native/.bindings/server_core.js";
import { secret } from "../secret";
import { eventActor, recordEvent, type EventName, type EventProps } from "./core.mts";
import { get, sql, tx } from "./db";

interface EventRuntime {
    actorOf: (userId: string) => string;
    event: (name: EventName, o?: { ws?: string | null; user?: string | null; props?: EventProps; at?: string; }) => boolean;
    noteFirstMcpRead: (wsId: string, userId: string, client: "app" | "device") => void;
}

const events = create_events({ secret, eventActor, recordEvent, sql, get, tx }) as unknown as EventRuntime;

export const actorOf: EventRuntime["actorOf"] = events.actorOf;
export const event: EventRuntime["event"] = events.event;
export const noteFirstMcpRead: EventRuntime["noteFirstMcpRead"] = events.noteFirstMcpRead;
