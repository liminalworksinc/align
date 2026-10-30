import { badRequest } from "./errors";
import { rand32 } from "./ids";
import type { Body } from "./validate";

// Limits on a goal (PORT-002): what work toward it must do, must not do, or leaves out of scope. They are goal
// content, like measures: stored on each version (limits_json on v2_goals and v2_goal_versions), confirmed by the
// goal's approval set through a new version or an approved change request, and delivered to agents only inside a saved
// version's snapshot. A limit names no person: who confirmed it is the version's created_by. (The rate limiter is
// lib/v2/limits.ts; this module is the goal's limits.)

export type LimitType = "must" | "must_not" | "out_of_scope";
export const LIMIT_TYPES: readonly LimitType[] = ["must", "must_not", "out_of_scope"];
/** At most this many limits on one version: agents read them with the goal at every session start. */
export const LIMITS_MAX = 5;
export const LIMIT_TEXT_MAX = 160;
export const LIMIT_SOURCE_TITLE_MAX = 120;

/** Where a limit came from: a meeting (title and date) or written by hand. */
export interface LimitSource {
  kind: "meeting" | "manual";
  /** 0..120 characters ("" when written by hand). */
  title: string;
  /** YYYY-MM-DD. */
  date: string;
}

/** One limit of a goal version (at most 5 per version). */
export interface Limit {
  /** lim_<12 base32>, kept across versions while the limit is kept. */
  id: string;
  type: LimitType;
  /** 1..160 characters. */
  text: string;
  source: LimitSource | null;
}

/** People's text on one line: control characters (C0, DEL, C1) become spaces, runs of spaces one, trimmed. */
export const cleanText = (v: string) => v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day as YYYY-MM-DD. */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`); // NaN for a month or day out of range ("2026-13-01")
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** A new limit id, lim_<12 base32>. */
export const newLimitId = () => `lim_${rand32(8).slice(0, 12)}`;

/** The limits stored on a goal or goal version row (rows written before limits existed hold '[]'). */
export function limitsOf(row: { limits_json: string }): Limit[] {
  return JSON.parse(row.limits_json || "[]") as Limit[];
}

/** A limit's source as sent: null/absent, or {kind, title?, date}. 400 naming `field` otherwise. */
function sourceIn(v: unknown, field: string): LimitSource | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw badRequest(`${field} must be an object with kind, title and date`);
  const b = v as Body;
  if (b.kind !== "meeting" && b.kind !== "manual") throw badRequest(`${field}.kind must be meeting or manual`);
  if (b.title !== undefined && b.title !== null && typeof b.title !== "string") throw badRequest(`${field}.title must be a string`);
  const title = typeof b.title === "string" ? cleanText(b.title) : "";
  if (title.length > LIMIT_SOURCE_TITLE_MAX) throw badRequest(`${field}.title is too long (max ${LIMIT_SOURCE_TITLE_MAX} characters)`);
  if (!isDay(b.date)) throw badRequest(`${field}.date must be a day like 2026-10-22`);
  return { kind: b.kind, title, date: b.date };
}

const sameLimit = (a: Omit<Limit, "id">, b: Omit<Limit, "id">) => a.type === b.type && a.text === b.text && JSON.stringify(a.source) === JSON.stringify(b.source);

/** Validate a request's `limits` (the list a person sends) against the previous version's limits: a sent id is kept
 *  only when `prev` has it, else the limit gets a new one. A limit sent without an id that is word for word one of
 *  prev's keeps that one's id, so sending the same limits again changes nothing. `undefined` keeps prev. Throws a
 *  400 V2Error naming the bad field. */
export function limitsIn(v: unknown, prev: Limit[]): Limit[] {
  if (v === undefined) return prev;
  if (!Array.isArray(v)) throw badRequest("limits must be a list");
  if (v.length > LIMITS_MAX) throw badRequest(`limits: at most ${LIMITS_MAX}`);
  const parsed = v.map((x, i) => {
    const field = `limits[${i}]`;
    if (!x || typeof x !== "object" || Array.isArray(x)) throw badRequest(`${field} must be an object with type and text`);
    const b = x as Body;
    if (typeof b.type !== "string" || !(LIMIT_TYPES as readonly string[]).includes(b.type)) throw badRequest(`${field}.type must be one of ${LIMIT_TYPES.join(", ")}`);
    if (typeof b.text !== "string") throw badRequest(`${field}.text must be a string`);
    const text = cleanText(b.text);
    if (!text) throw badRequest(`${field}.text is required`);
    if (text.length > LIMIT_TEXT_MAX) throw badRequest(`${field}.text is too long (max ${LIMIT_TEXT_MAX} characters)`);
    return { sentId: typeof b.id === "string" ? b.id : null, type: b.type as LimitType, text, source: sourceIn(b.source, `${field}.source`) };
  });
  const used = new Set<string>();
  // Sent ids prev has come first, so a limit without an id can't take an id another sent limit names.
  for (const p of parsed) if (p.sentId && prev.some((l) => l.id === p.sentId) && !used.has(p.sentId)) used.add(p.sentId);
  const taken = new Set<string>();
  return parsed.map((p) => {
    let id: string | null = p.sentId && used.has(p.sentId) && !taken.has(p.sentId) ? p.sentId : null;
    if (!id) id = prev.find((l) => !used.has(l.id) && !taken.has(l.id) && sameLimit(l, p))?.id ?? null;
    if (!id) id = newLimitId();
    taken.add(id);
    return { id, type: p.type, text: p.text, source: p.source };
  });
}
