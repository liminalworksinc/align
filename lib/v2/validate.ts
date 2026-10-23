import { badRequest } from "./errors";

// Small field validators for v2 request bodies. Every failure is 400 with the field's name.

export type Body = Record<string, unknown>;

export function str(b: Body, k: string, max = 300, { min = 1 }: { min?: number } = {}): string {
  const v = b[k];
  if (typeof v !== "string") throw badRequest(`${k} must be a string`);
  const t = v.trim();
  if (t.length < min) throw badRequest(`${k} is required`);
  if (t.length > max) throw badRequest(`${k} is too long (max ${max} characters)`);
  return t;
}

export function optStr(b: Body, k: string, max = 300): string | null {
  const v = b[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw badRequest(`${k} must be a string or null`);
  const t = v.trim();
  if (t.length > max) throw badRequest(`${k} is too long (max ${max} characters)`);
  return t || null;
}

export function oneOf<T extends string>(b: Body, k: string, allowed: readonly T[]): T {
  const v = b[k];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw badRequest(`${k} must be one of ${allowed.join(", ")}`);
  return v as T;
}

export function optOneOf<T extends string>(b: Body, k: string, allowed: readonly T[]): T | null {
  if (b[k] === undefined || b[k] === null) return null;
  return oneOf(b, k, allowed);
}

export function nonNegInt(b: Body, k: string): number {
  const v = b[k];
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw badRequest(`${k} must be a non-negative integer`);
  return v;
}

export function optInt(b: Body, k: string): number | null {
  if (b[k] === undefined || b[k] === null) return null;
  return nonNegInt(b, k);
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/** An ISO 8601 timestamp, normalized to UTC with milliseconds (so string order is time order). */
export function iso(b: Body, k: string): string {
  const v = b[k];
  if (typeof v !== "string" || !ISO.test(v) || Number.isNaN(Date.parse(v))) throw badRequest(`${k} must be an ISO 8601 time`);
  return new Date(v).toISOString();
}

export function optIso(b: Body, k: string): string | null {
  if (b[k] === undefined || b[k] === null || b[k] === "") return null;
  return iso(b, k);
}

export const B64URL = /^[A-Za-z0-9_-]+$/;
export function b64url(b: Body, k: string, minLen: number, maxLen: number): string {
  const v = b[k];
  if (typeof v !== "string" || !B64URL.test(v) || v.length < minLen || v.length > maxLen) throw badRequest(`${k} must be base64url (${minLen} to ${maxLen} characters)`);
  return v;
}

export function strList(b: Body, k: string, { max = 50, itemMax = 300 }: { max?: number; itemMax?: number } = {}): string[] {
  const v = b[k] ?? [];
  if (!Array.isArray(v)) throw badRequest(`${k} must be a list`);
  if (v.length > max) throw badRequest(`${k} has too many items (max ${max})`);
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") throw badRequest(`${k} must be a list of strings`);
    const t = x.trim();
    if (t.length > itemMax) throw badRequest(`${k} items are too long (max ${itemMax} characters)`);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Path ids: prefix + url-safe chars, bounded. Anything else is simply not found. */
export const ID_RE = /^[a-z]{1,4}_[A-Za-z0-9_-]{8,64}$/;
export const SESSION_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
