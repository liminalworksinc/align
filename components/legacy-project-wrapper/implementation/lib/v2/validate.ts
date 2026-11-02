import { badRequest } from "./errors";
import { BLANK_FILLERS, cleanProse, dropInvisible, isBlankText } from "./text-core.mts";

// Small field validators for v2 request bodies. Every failure is 400 with the field's name.

export type Body = Record<string, unknown>;

/** A string field, cleaned as people's text is (`cleanProse`: invisible characters dropped, blank fillers made spaces,
 *  trimmed; line breaks kept), so a reason, note, condition or title of only invisible characters or marks is missing
 *  (400 "<k> is required"), never recorded as empty text (E2E-WEB cycle 13 W3). */
export function str(b: Body, k: string, max = 300, { min = 1 }: { min?: number } = {}): string {
  const v = b[k];
  if (typeof v !== "string") throw badRequest(`${k} must be a string`);
  const t = cleanProse(v);
  if (t.length < min || (min > 0 && isBlankText(t))) throw badRequest(`${k} is required`);
  if (t.length > max) throw badRequest(`${k} is too long (max ${max} characters)`);
  return t;
}

/** Characters a one-line name never keeps (W3): controls (category Cc: C0, DEL, C1), Unicode line and paragraph
 *  separators and the blank fillers that render as nothing (lib/v2/text-core.mts) become a space, as runs of whitespace
 *  do; invisible format characters and lone surrogates are dropped as in all people's text (`dropInvisible`, which keeps
 *  emoji sequences whole), so a name reads the same wherever it is shown. */
const NAME_SPACE = new RegExp(`[\\p{Cc}\\s\\u2028\\u2029${BLANK_FILLERS}]+`, "gu");

/** `v` with the characters a one-line name never keeps dropped (or made spaces), keeping emoji sequences whole. */
export function cleanName(v: string): string {
  return dropInvisible(v).replace(NAME_SPACE, " ");
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** How many characters a person reads in `v` (grapheme clusters: `👩‍💻` and a flag are one each). */
export const charCount = (v: string): number => [...graphemes.segment(v)].length;

/** Combining marks one character of a one-line name may carry: enough for any script's real clusters (Vietnamese stacks
 *  two, Devanagari and Tibetan clusters up to five, an emoji's variation selectors and keycap three, a subdivision
 *  flag's six tags), never a tower of accents that draws over the page around it (E2E-WEB cycle 9 C9-3). Every
 *  grapheme extender counts, not only category M: half-width voiced sound marks (U+FF9E) and emoji skin-tone modifiers
 *  join the character before them too (E2E-WEB cycle 10 C10-3); the zero-width joiner of an emoji sequence does not. */
export const NAME_MARKS_PER_CHAR = 6;
const MARK = /(?!\u200D)[\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}]/gu;
/** Code points one character may be built of: the longest emoji (a kiss with two skin tones, 10) and the longest
 *  conjuncts fit; a chain of emoji joined into one "character" (`👩‍👩‍…`) does not (E2E-WEB cycle 10 C10-3). */
export const NAME_PARTS_PER_CHAR = 16;

/** A one-line name (a device name, Z4): cleaned (`cleanName`) and trimmed; nothing left, or nothing but combining marks,
 *  is 400 "<k> is required". At
 *  most `max` characters as a person reads them (grapheme clusters, W6: never UTF-16 units, so 100 emoji fit), each
 *  with at most `NAME_MARKS_PER_CHAR` combining marks (C9-3), and at most 16 bytes of UTF-8 per character allowed, which
 *  only long emoji sequences (families, flags) reach: refused in words the person can act on, never a byte count they
 *  can't see (E2E-WEB cycle 9 W5). */
export function oneLine(b: Body, k: string, max = 300): string {
  const v = b[k];
  if (typeof v !== "string") throw badRequest(`${k} must be a string`);
  const t = cleanName(v).trim();
  if (isBlankText(t)) throw badRequest(`${k} is required`);
  const chars = [...graphemes.segment(t)].map((g) => g.segment);
  if (chars.length > max) throw badRequest(`${k} is too long (max ${max} characters)`);
  if (chars.some((c) => (c.match(MARK)?.length ?? 0) > NAME_MARKS_PER_CHAR)) throw badRequest(`${k} has a character with too many accents or marks on it (at most ${NAME_MARKS_PER_CHAR} on one character)`);
  if (chars.some((c) => [...c].length > NAME_PARTS_PER_CHAR)) throw badRequest(`${k} has a character joined from too many parts (at most ${NAME_PARTS_PER_CHAR} in one character)`);
  if (Buffer.byteLength(t, "utf8") > max * 16) throw badRequest(`${k} is too long to store: emoji such as families and flags take much more room than letters, so use fewer of them`);
  return t;
}

/** An optional string field, cleaned as `str` cleans one; nothing a person can read left is null (W3). */
export function optStr(b: Body, k: string, max = 300): string | null {
  const v = b[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw badRequest(`${k} must be a string or null`);
  const t = cleanProse(v);
  if (isBlankText(t)) return null;
  if (t.length > max) throw badRequest(`${k} is too long (max ${max} characters)`);
  return t;
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

/** A decision sent without the revision its person read, or with one that is not a whole number: refused in a person's
 *  words, never a field name, though only API clients can send it (E2E-WEB cycle 11 W1). */
export const NO_REVISION = "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.";

/** The `revision` a decision was taken on (a whole number from 0; 400 NO_REVISION otherwise). With `optional`, a
 *  decision that leaves it out gives `undefined` (change requests and target changes); alignments always need it. */
export function revisionRead(b: Body, optional: true): number | undefined;
export function revisionRead(b: Body, optional?: false): number;
export function revisionRead(b: Body, optional = false): number | undefined {
  const v = b.revision;
  if (v === undefined && optional) return undefined;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw badRequest(NO_REVISION);
  return v;
}

/** A decision sent for a revision the request or proposal never reached: nothing about it changed since it was read, so
 *  this is 400 `unknown_revision`, not a stale refusal (E2E-WEB cycle 11 W3). `what` is "request" or "proposal". */
export function assertRevisionReached(what: "request" | "proposal", sent: number | undefined, current: number) {
  if (sent !== undefined && sent > current)
    throw badRequest(`This ${what} has no revision ${sent}: it is at revision ${current}, so nothing was recorded. Read it again and decide again.`, "unknown_revision");
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
