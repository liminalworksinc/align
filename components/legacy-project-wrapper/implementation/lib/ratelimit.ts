import { config } from "./config";
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

const g = globalThis as unknown as { __alignLoginFails?: Map<string, Failures>; __alignCreates?: number[]; __alignCodeFails?: Map<string, number[]> };
const fails = (g.__alignLoginFails ??= new Map());
const creates = (g.__alignCreates ??= []);
const codeFails: Map<string, number[]> = (g.__alignCodeFails ??= new Map());

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

/** Global creation bucket: 5 workspaces per rolling hour (ALIGN_CREATE_PER_HOUR in Mode L only). Called inside the
 *  creation lock after the cap check, so a create refused for the cap spends no token. */
export function takeCreateToken(now = Date.now()) {
  const perHour = config().createPerHour;
  while (creates.length && now - creates[0] > 60 * 60 * 1000) creates.shift();
  if (creates.length >= perHour) throw new HttpError(429, "Too many workspaces created recently, try again later");
  creates.push(now);
}

// Wrong signup or invite codes: 10 per 10 minutes per client, then refused until the window passes. `client` is
// Fly-Client-IP when hosted (set by Fly's edge; proxy.ts refuses requests without it), "local" in Mode L.
const CODE_WINDOW_MS = 10 * 60 * 1000;
const FREE_CODE_FAILURES = 10;
function recent(client: string, now: number): number[] {
  const list = (codeFails.get(client) ?? []).filter((t) => now - t <= CODE_WINDOW_MS);
  if (list.length) codeFails.set(client, list);
  else codeFails.delete(client);
  return list;
}
export function checkCodeFailures(client: string, now = Date.now()) {
  if (recent(client, now).length >= FREE_CODE_FAILURES) throw new HttpError(429, "Too many wrong codes, try again in a few minutes");
}
export function recordCodeFailure(client: string, now = Date.now()) {
  while (codeFails.size >= MAX_KEYS) codeFails.delete(codeFails.keys().next().value!);
  codeFails.set(client, [...recent(client, now), now]);
}

/**
 * IPv6 addresses collapse to their /64 (one host can hold a whole /64, so per-address keys are free to rotate).
 * An IPv4-mapped address (::ffff:a.b.c.d, or its hex form ::ffff:xxxx:xxxx) is that IPv4 client: its /64 is
 * ::ffff:0:0 for every IPv4 address, so collapsing it would put all IPv4 clients in one bucket (Sean's #6 review).
 */
export function clientNet(ip: string): string {
  let v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!v.includes(":")) return v;
  // A dotted IPv4 tail is two hex groups.
  const dotted = v.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [, pre, ...oct] = dotted;
    const n = oct.map(Number);
    if (n.some((x) => x > 255)) return v;
    v = `${pre}${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [];
  const b = v.includes("::") && tail ? tail.split(":") : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b].map((x) => parseInt(x || "0", 16));
  if (groups.length === 8 && groups.slice(0, 5).every((x) => x === 0) && groups[5] === 0xffff)
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  return `${groups.slice(0, 4).map((x) => (Number.isNaN(x) ? "0" : x.toString(16))).join(":")}::/64`;
}

/** The client key for limits: Fly-Client-IP when hosted (trusted only there; IPv6 keyed by /64), else one local key. */
export function clientOf(req: Request): string {
  return config().hosted ? `ip:${clientNet(req.headers.get("fly-client-ip") ?? "unknown")}` : "local";
}

// State-replacing actions per workspace (Restart, connecting an agent): at most ACTIONS_PER_MINUTE each per minute,
// so a loop can't churn a workspace's audit log onto the shared volume (review M5).
const ACTIONS_PER_MINUTE = 10;
const g3 = globalThis as unknown as { __alignActions?: Map<string, number[]> };
const actions: Map<string, number[]> = (g3.__alignActions ??= new Map());
export function takeWorkspaceAction(ws: string, action: string, now = Date.now()) {
  const key = `${ws}:${action}`;
  const list = (actions.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= ACTIONS_PER_MINUTE) throw new HttpError(429, "Too many of these in a row, try again in a minute");
  while (actions.size >= MAX_KEYS) actions.delete(actions.keys().next().value!);
  actions.set(key, [...list, now]);
}

// Sign-ins in flight per client: the scrypt pool is shared by every workspace, so one client may hold at most
// SIGNINS_PER_CLIENT slots at a time; further parallel tries get 429 before they reach scrypt (review M1).
const SIGNINS_PER_CLIENT = 2;
const g2 = globalThis as unknown as { __alignSignins?: Map<string, number> };
const signins = (g2.__alignSignins ??= new Map());
export async function withSigninSlot<T>(client: string, fn: () => Promise<T>): Promise<T> {
  const n = signins.get(client) ?? 0;
  if (n >= SIGNINS_PER_CLIENT) throw new HttpError(429, "Too many sign-ins at once, try again in a moment");
  signins.set(client, n + 1);
  try {
    return await fn();
  } finally {
    const left = (signins.get(client) ?? 1) - 1;
    if (left > 0) signins.set(client, left);
    else signins.delete(client);
  }
}
