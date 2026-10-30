// The decision value card's shared rules (issue #30 items 2–5, LIM-2445): funnel actions, the one feedback question,
// text cleaning and the next-step link checks. No imports, so the server, the page and Node tests all load it as is.

/** Funnel events recorded through POST /api/timer (custom workspaces, after a proposal is RATIFIED). */
export const FUNNEL_ACTIONS = ["value_card_viewed", "value_reported", "waitlist_clicked", "loi_cta_clicked"] as const;
export type FunnelAction = (typeof FUNNEL_ACTIONS)[number];
export const isFunnelAction = (x: unknown): x is FunnelAction => typeof x === "string" && (FUNNEL_ACTIONS as readonly string[]).includes(x);

/** "Before Align, how long would getting this decision usually take?" The tester's own estimate, never a measurement. */
export const ESTIMATES = [
  { id: "same_day", label: "Same day", said: "same day" },
  { id: "two_to_three_days", label: "2–3 days", said: "2–3 days" },
  { id: "about_a_week", label: "About a week", said: "about a week" },
  { id: "longer", label: "Longer", said: "longer than a week" },
  { id: "would_not_be_decided", label: "It wouldn’t get decided", said: "it wouldn’t get decided" },
] as const;
export type Estimate = (typeof ESTIMATES)[number]["id"];
export const isEstimate = (x: unknown): x is Estimate => typeof x === "string" && ESTIMATES.some((e) => e.id === x);
export const estimateSaid = (id: string) => ESTIMATES.find((e) => e.id === id)?.said ?? id;

export const VALUE_QUESTION = "Before Align, how long would getting this decision usually take?";
export const MAX_VALUE_TEXT = 500;

/** Plain text: C0 and C1 control, bidi (including U+061C) and zero-width characters removed (as lib/interview.ts cleans), whitespace collapsed, trimmed. */
export function cleanValueText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F؜​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The waitlist link: an https Google Form (docs.google.com/forms/...), no credentials, no other port. Otherwise null (hidden). */
export function waitlistUrlOk(v: string | undefined | null): string | null {
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com" || u.port || u.username || u.password) return null;
  if (!u.pathname.startsWith("/forms/")) return null;
  return u.toString();
}

/** The LOI link: an https URL on any host the operator chose (no credentials, no non-default port), or a mailto: with
 *  one plain address and at most a subject. Otherwise null (hidden). Never throws. */
export function loiUrlOk(v: string | undefined | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol === "https:") return u.username || u.password || u.port || !u.hostname ? null : u.toString();
    if (u.protocol !== "mailto:") return null;
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() !== "subject")) return null; // no bcc, cc, body, to
    return /^[^@\s,;<>"?&]+@[^@\s,;<>"?&]+\.[^@\s,;<>"?&]+$/.test(decodeURIComponent(u.pathname)) ? u.toString() : null;
  } catch {
    return null; // a malformed URL or percent-escape hides the link
  }
}

/** What a measured span reads as: "14 minutes", "2 hours 5 minutes", "3 days 4 hours". From real timestamps only. */
export function spanWords(fromIso: string | null | undefined, toIso: string | null | undefined): string | null {
  const a = Date.parse(fromIso ?? "");
  const b = Date.parse(toIso ?? "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const s = Math.round((b - a) / 1000);
  const n = (x: number, unit: string) => `${x} ${unit}${x === 1 ? "" : "s"}`;
  if (s < 60) return n(s, "second");
  const m = Math.floor(s / 60);
  if (m < 60) return n(m, "minute");
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${n(h, "hour")} ${n(m % 60, "minute")}` : n(h, "hour");
  const d = Math.floor(h / 24);
  return h % 24 ? `${n(d, "day")} ${n(h % 24, "hour")}` : n(d, "day");
}
