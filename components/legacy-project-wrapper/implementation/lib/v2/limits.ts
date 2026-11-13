// Typed public names for the independently qualified limiter service.
import * as native from "../native/.bindings/rate_limits.js";
import { signPayload } from "../secret";
import { all, get, run } from "./db";
import { V2Error } from "./errors";

export interface Limit {
  key: string;
  max: number;
  windowMs: number;
}

type Limiter = {
  take: (key: string, max: number, windowMs: number, now?: number) => void;
  takeAll: (limits: Limit[], now?: number) => boolean;
  retryAfterMs: (limits: Limit[], now?: number) => number;
  otpEmailKey: (email: string) => string;
  accessEmailKey: (email: string) => string;
  durableRoom: (limits: Limit[], now?: number) => boolean;
  durableCount: (limits: Limit[], now?: number) => void;
  durableRetryAfterMs: (limits: Limit[], now?: number) => number;
  takeDurable: (limits: Limit[], now?: number) => boolean;
};

const g = globalThis as unknown as { __alignV2Limits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__alignV2Limits ??= new Map());
const limiter = native.create_limiter({
  hits,
  now: () => Date.now(),
  signPayload,
  all,
  get,
  run,
  V2Error,
}) as Limiter;

export const take = limiter.take;
export const takeAll = limiter.takeAll;
export const retryAfterMs = limiter.retryAfterMs;
export const otpEmailKey = limiter.otpEmailKey;
export const accessEmailKey = limiter.accessEmailKey;
export const durableRoom = limiter.durableRoom;
export const durableCount = limiter.durableCount;
export const durableRetryAfterMs = limiter.durableRetryAfterMs;
export const takeDurable = limiter.takeDurable;
