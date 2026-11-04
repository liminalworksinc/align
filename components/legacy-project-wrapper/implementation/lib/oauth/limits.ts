import { HttpError } from "../errors";

// Per-client limits for the unauthenticated OAuth endpoints (in memory): registrations 20 an
// hour, token calls 120 a minute, consent page views 30 a minute (each can fetch an app's client document). `client` is clientOf(req): Fly-Client-IP when hosted, "local" in Mode L.
// approve_ws is keyed by workspace id instead: at most 10 app approvals a minute per workspace.
const LIMITS = {
  register: { n: 20, ms: 60 * 60 * 1000 },
  token: { n: 120, ms: 60 * 1000 },
  approve: { n: 30, ms: 60 * 1000 },
  authorize: { n: 30, ms: 60 * 1000 },
  approve_ws: { n: 10, ms: 60 * 1000 },
} as const;
const g = globalThis as unknown as { __alignOAuthCalls?: Map<string, number[]> };
const calls: Map<string, number[]> = (g.__alignOAuthCalls ??= new Map());

export function takeOAuthCall(client: string, kind: keyof typeof LIMITS, now = Date.now()) {
  const { n, ms } = LIMITS[kind];
  const key = `${kind}:${client}`;
  const list = (calls.get(key) ?? []).filter((t) => now - t < ms);
  if (list.length >= n) throw new HttpError(429, "Too many requests, try again later");
  while (calls.size >= 10_000) calls.delete(calls.keys().next().value!);
  calls.set(key, [...list, now]);
}
