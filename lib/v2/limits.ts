import { V2Error } from "./errors";

// Fixed-window counters for v2 (in memory, on globalThis, capped at 10,000 keys; oldest evicted first).
const MAX_KEYS = 10_000;
const g = globalThis as unknown as { __alignV2Limits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__alignV2Limits ??= new Map());

/** Allow at most `max` calls per `windowMs` for `key`, else 429. */
export function take(key: string, max: number, windowMs: number, now = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new V2Error(429, "rate_limited", "Too many requests, try again later");
  hits.delete(key);
  while (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!);
  hits.set(key, [...list, now]);
}
