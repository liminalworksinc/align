import type { Core, Sql, EventName, EventProps } from './create_core.js';
export interface EventResources {
  secret: Core['serverSecret'];
  eventActor: Core['eventActor'];
  recordEvent: Core['recordEvent'];
  sql: Sql;
  get: Sql['get'];
  tx<T>(callback: () => T): Promise<T>;
}
export interface Events {
  actorOf(userId: string): string;
  event(name: EventName, o?: { ws?: string | null; user?: string | null; props?: EventProps; at?: string }): boolean;
  noteFirstMcpRead(wsId: string, userId: string, client: 'app' | 'device'): void;
}
export declare function create_events(resources: EventResources): Events;
