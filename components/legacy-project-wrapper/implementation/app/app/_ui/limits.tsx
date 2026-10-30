"use client";
import type { Goal } from "./types";

// A goal's limits in the web app (PORT-002): the chips on the Goals tab, the Limits card on the goal page, the limit
// editor of the goal forms (re-exported by goalform.tsx with the other editors), and "Paste meeting notes", which
// suggests limits from notes and turns them into a new version (the goal's owner) or a change request (anyone else).
//
// PORT-001 declares these slots and their props; each renders nothing until PORT-002 fills it in.

export type LimitDraft = { id?: string; type: "must" | "must_not" | "out_of_scope"; text: string; source_title: string; source_date: string };

/** Up to 5 limit chips under a goal on the Goals tab. */
export function LimitChips(props: { goal: Goal }) {
  void props;
  return null;
}

/** The goal page's Limits card (the current version's limits, and "Suggest a limit"). */
export function GoalLimits(props: { ws: string; goal: Goal; canEdit: boolean; onDone: () => void }) {
  void props;
  return null;
}

/** Edits a version's limits (type, text, source), at most 5. */
export function LimitEditor(props: { value: LimitDraft[]; onChange: (v: LimitDraft[]) => void }) {
  void props;
  return null;
}

/** "Paste meeting notes" (members and owners): suggestions grouped by goal, each proposed or added to a new version.
 *  `preferGoalId` is the goal page it was opened from. */
export function NotesSuggest(props: { ws: string; preferGoalId?: string; onDone?: () => void }) {
  void props;
  return null;
}
