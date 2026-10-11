import { EventEmitter } from "node:events";

/** In-process bus for authority events (org push, owner ratification). Shared across route bundles. */
const g = globalThis as unknown as { __alignBus?: EventEmitter; __alignListening?: Map<string, string> };
export const bus: EventEmitter = (g.__alignBus ??= new EventEmitter().setMaxListeners(100));
export const listening: Map<string, string> = (g.__alignListening ??= new Map()); // session id → listening since (ISO)

export interface AuthorityEvent {
  event_id: string;
  kind: "push" | "ratify";
  at: string;
}

export function emitAuthority(e: AuthorityEvent) {
  bus.emit("authority", e);
}
