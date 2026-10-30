// The decision value card's plain rules (PORT-004), with no imports so the web app's card, the server (lib/v2/value.ts)
// and Node tests all load this file as is: the one optional question and its five answers, how a note is cleaned, how
// a measured span reads, and which follow-up link may be shown.

/** "Before Align, how long would getting this decision usually take?" The person's own estimate, never a measurement.
 *  The ids are lib/v2/core.mts ESTIMATES, in the same order (lib/v2/value.ts checks that they agree). */
export const ESTIMATE_WORDS = [
  { id: "same_day", label: "Same day", said: "same day" },
  { id: "two_to_three_days", label: "2–3 days", said: "2–3 days" },
  { id: "about_a_week", label: "About a week", said: "about a week" },
  { id: "longer", label: "Longer", said: "longer than a week" },
  { id: "would_not_be_decided", label: "It wouldn’t get decided", said: "it wouldn’t get decided" },
] as const;
export type EstimateId = (typeof ESTIMATE_WORDS)[number]["id"];
export const estimateSaid = (id: string) => ESTIMATE_WORDS.find((e) => e.id === id)?.said ?? id;

export const VALUE_QUESTION = "Before Align, how long would getting this decision usually take?";
export const VALUE_NOTE_MAX = 500;
/** A value report can be edited by its author for this many days after it was first saved. */
export const VALUE_EDIT_DAYS = 7;

/** Plain text: C0 and C1 control, bidi (U+061C, U+200E/F, U+202A–E, U+2066–9) and zero-width characters removed,
 *  whitespace collapsed, trimmed. */
export function cleanValueText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F؜​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A follow-up link that is safe to show, normalized, or null: https with no credentials and no non-default port, or a
 *  mailto: with one plain address and at most a subject. Never throws (a malformed URL or percent-escape is null). */
export function safeFollowUpUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol === "https:") return u.username || u.password || u.port || !u.hostname ? null : u.toString();
    if (u.protocol !== "mailto:") return null;
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() !== "subject")) return null; // no bcc, cc, body, to
    return /^[^@\s,;<>"?&]+@[^@\s,;<>"?&]+\.[^@\s,;<>"?&]+$/.test(decodeURIComponent(u.pathname)) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** True when safeFollowUpUrl would show the link. */
export const loiUrlOk = (url: string): boolean => safeFollowUpUrl(url) !== null;

/** The value card's follow-up link. ALIGN_FOLLOW_UP_URL when it is set (null, hidden, when it fails safeFollowUpUrl:
 *  startup logs a warning); else, when hosted, the request-access page on the public origin with interest evaluate and
 *  via value_card; else (Mode L, where a request reaches no operator) null. */
export function followUpUrl(env: Record<string, string | undefined> = process.env): string | null {
  const set = (env.ALIGN_FOLLOW_UP_URL ?? "").trim();
  if (set) return safeFollowUpUrl(set);
  if (env.HOSTED !== "1") return null;
  try {
    const o = new URL(env.ALIGN_PUBLIC_ORIGIN ?? "");
    return o.protocol === "https:" ? `${o.origin}/app/request-access?interest=evaluate&via=value_card` : null;
  } catch {
    return null;
  }
}

/** The startup warning for an ALIGN_FOLLOW_UP_URL that is set but hidden, or null. */
export function followUpProblem(env: Record<string, string | undefined> = process.env): string | null {
  const set = (env.ALIGN_FOLLOW_UP_URL ?? "").trim();
  return set && !safeFollowUpUrl(set)
    ? "Warning: ALIGN_FOLLOW_UP_URL is not an https URL (no credentials, default port) or a mailto: with one address and only a subject, so the decision value card shows no follow-up link."
    : null;
}

/** A measured span in words, from a whole number of milliseconds: "45 seconds", "14 minutes", "2 hours 5 minutes",
 *  "3 days 4 hours". A negative or non-finite span is "". */
export function spanWords(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  const n = (x: number, unit: string) => `${x} ${unit}${x === 1 ? "" : "s"}`;
  if (s < 60) return n(s, "second");
  const m = Math.floor(s / 60);
  if (m < 60) return n(m, "minute");
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${n(h, "hour")} ${n(m % 60, "minute")}` : n(h, "hour");
  const d = Math.floor(h / 24);
  return h % 24 ? `${n(d, "day")} ${n(h % 24, "hour")}` : n(d, "day");
}
