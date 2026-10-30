import { ESTIMATES } from "./core.mts";
import type { ChangeDiff } from "./changes-read";
import type { PolicyPrincipal } from "./policy";
import type { Body } from "./validate";

// The decision value card on an approved change request (PORT-004): what was decided, who approved it, which goals it
// touches, whether agents have the new version, how long the decision took as Align measured it, and the value reports
// of the people involved (an estimate of how long it would have taken without Align, with an optional note; one per
// person per request, editable by its author for 7 days, stored in v2_value_reports). The content-free product events
// (value_card_viewed, value_reported with the estimate only, follow_up_clicked) are recorded once per person per
// workspace. The follow-up link (ALIGN_FOLLOW_UP_URL) is validated and hidden when it is unsafe.
//
// PORT-001 declares the shapes and signatures; PORT-004 fills them in.

export { ESTIMATES };
export type Estimate = (typeof ESTIMATES)[number];

export const VALUE_NOTE_MAX = 500;
export const VALUE_EDIT_DAYS = 7;

/** One person's value report on an approved change request. */
export interface ValueReport {
  id: string;
  person: { id: string; name: string };
  estimate: Estimate;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** The reader wrote it and it is less than 7 days old. */
  can_edit: boolean;
}

/** GET .../goals/{goal}/change-requests/{id}/value. */
export interface ValueView {
  change_request_id: string;
  goal: { id: string; title: string; version: number; team: { id: string; name: string } | null };
  diff: ChangeDiff;
  approved_by: { id: string; name: string };
  decided_at: string;
  created_at: string;
  approved_without_evidence: boolean | null;
  /** Readable goals only. */
  affected: { parents: { id: string; title: string }[]; dependents: { id: string; title: string }[] };
  /** The goal_version directive of the approved version: its target sessions, and those with a received or applied
   *  receipt; null when there was none. */
  delivery: { sessions: number; received: number; applied: number } | null;
  measured: { proposal_to_decision: string; decision_to_first_applied: string | null };
  /** The reader's own report, if any. */
  my_report: ValueReport | null;
  /** Every report, for the request's requester and approvers and workspace owners; else only the reader's own. */
  reports: ValueReport[];
  follow_up_url: string | null;
}

/** A follow-up URL that is safe to show: https with no credentials and no non-default port, or mailto: with one
 *  address and only a subject. Never throws. */
export function loiUrlOk(url: string): boolean {
  void url;
  return false;
}

/** The value card's follow-up link: ALIGN_FOLLOW_UP_URL when it passes loiUrlOk; else, when hosted, the request-access
 *  page (interest evaluate, via value_card) on the public origin; else (Mode L) null. */
export function followUpUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  void env;
  return null;
}

/** A measured span in words ("2 days", "about 3 hours"). */
export function spanWords(ms: number): string {
  void ms;
  return "";
}

/** The value card of an approved change request, for a reader of it (404 when unreadable, 409 not_approved). */
export function valueView(pp: PolicyPrincipal, goalId: string, requestId: string): ValueView {
  void pp;
  void goalId;
  void requestId;
  throw new Error("valueView is not implemented yet (PORT-004)");
}

/** POST .../value {action: "viewed" | "reported" | "follow_up", estimate?, note?}: records the event (and, for
 *  "reported", saves or edits the reader's value report). `recorded` is false when the event was already there. */
export async function recordValue(pp: PolicyPrincipal, goalId: string, requestId: string, b: Body): Promise<{ recorded: boolean; report: ValueReport | null }> {
  void pp;
  void goalId;
  void requestId;
  void b;
  throw new Error("recordValue is not implemented yet (PORT-004)");
}
