import { HttpError } from "./errors";

// In-memory limits for custom workspaces only. Northstar login is never limited (its tests send wrong passcodes).
// Maps live on globalThis, capped at 10,000 keys; the oldest entries are evicted first.

const MAX_KEYS = 10_000;
const WINDOW_MS = 5 * 60 * 1000;
const FREE_FAILURES = 5;
const MAX_DELAY_MS = 10_000;

interface Failures {
  n: number;
  first: number;
  last: number;
}

const g = globalThis as unknown as { __alignLoginFails?: Map<string, Failures>; __alignCreates?: number[] };
const fails = (g.__alignLoginFails ??= new Map());
const creates = (g.__alignCreates ??= []);

function evict(now: number) {
  for (const [k, f] of fails) if (now - f.last > WINDOW_MS) fails.delete(k);
  while (fails.size >= MAX_KEYS) fails.delete(fails.keys().next().value!);
}

/** Soft backoff: after 5 failures in 5 minutes, each further try must wait a growing delay (1 s doubling, up to 10 s). */
export function checkLoginBackoff(key: string, now = Date.now()) {
  const f = fails.get(key);
  if (!f || now - f.last > WINDOW_MS || f.n < FREE_FAILURES) return;
  const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** (f.n - FREE_FAILURES));
  if (now - f.last < delay) throw new HttpError(429, "Too many attempts, try again shortly");
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const f = fails.get(key);
  if (f && now - f.last <= WINDOW_MS) {
    f.n++;
    f.last = now;
    fails.delete(key); // re-insert so eviction order follows recency
    fails.set(key, f);
    return;
  }
  evict(now);
  fails.set(key, { n: 1, first: now, last: now });
}

export function clearLoginFailures(key: string) {
  fails.delete(key);
}

export function loginLimiterSize() {
  return fails.size;
}

/** Global creation bucket: ALIGN_CREATE_PER_HOUR (default 5) workspaces per rolling hour. */
export function takeCreateToken(now = Date.now()) {
  const perHour = Number(process.env.ALIGN_CREATE_PER_HOUR || 5);
  while (creates.length && now - creates[0] > 60 * 60 * 1000) creates.shift();
  if (creates.length >= perHour) throw new HttpError(429, "Too many workspaces created recently, try again later");
  creates.push(now);
}
