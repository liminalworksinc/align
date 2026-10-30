import { signPayload } from "../secret";
import { get, run } from "./db";
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

/** Several limits at once: counts a call against every key only if all of them still allow it. False otherwise. */
export function takeAll(limits: { key: string; max: number; windowMs: number }[], now = Date.now()): boolean {
  const live = limits.map((l) => ({ ...l, list: (hits.get(l.key) ?? []).filter((t) => now - t < l.windowMs) }));
  if (live.some((l) => l.list.length >= l.max)) return false;
  for (const l of live) {
    hits.delete(l.key);
    while (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!);
    hits.set(l.key, [...l.list, now]);
  }
  return true;
}

// Durable sliding windows (v2_rate_hits: one row per counted call), for limits that must survive a restart: hosted
// email-code sends per address, access requests, and new shared sessions per device. Call inside tx().
export interface Limit {
  key: string;
  max: number;
  windowMs: number;
}

/** Durable limit keys that name an email address, by an HMAC of it (never the address): hosted email-code sends
 *  (lib/v2/auth.ts) and access requests (lib/v2/access.ts). Account deletion deletes both for the person's address. */
export const otpEmailKey = (email: string) => `otp-email-hour:${signPayload(`alo.${email}`)}`;
export const accessEmailKey = (email: string) => `access-email:${signPayload(`ala.${email}`)}`;

/** The longest durable window; older rows are pruned as calls are counted. */
const DURABLE_KEEP_MS = 24 * 3600 * 1000;

/** True when every durable limit still has room (nothing is counted). */
export function durableRoom(limits: Limit[], now = Date.now()): boolean {
  return limits.every((l) => (get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_rate_hits WHERE key = ? AND at > ?", l.key, now - l.windowMs)?.n ?? 0) < l.max);
}

/** Count one call against every durable limit. */
export function durableCount(limits: Limit[], now = Date.now()) {
  run("DELETE FROM v2_rate_hits WHERE at <= ?", now - DURABLE_KEEP_MS);
  for (const l of limits) run("INSERT INTO v2_rate_hits (key, at) VALUES (?, ?)", l.key, now);
}

/** durableRoom, then durableCount: false (nothing counted) when any limit is full. */
export function takeDurable(limits: Limit[], now = Date.now()): boolean {
  if (!durableRoom(limits, now)) return false;
  durableCount(limits, now);
  return true;
}
