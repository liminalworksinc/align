// "Next" after a decision (LIM-2472 round 2, founder ruling: the next item in the person's ranked list, every kind).
// Pure: which item comes next and what to say, from the list's rows in its own order (Mini S1's rankNeeds, passed in,
// never re-derived here). NextAfterDecision renders it; design/prototypes/lim-2472/s/next-core.check.mjs runs it.
//   - The fresh read after the decision decides; the order the list had when the review opened (`snapshot`) only tells
//     whether the list changed meanwhile, said in one line.
//   - Items with no destination the person can act on are skipped.
//   - A failed fresh read gives no Next at all: never a guess from the stale order.

export interface NextItem {
  /** The row's key in the list (e.g. "cr:<id>"). */
  key: string;
  /** The row's kind word, as the list shows it ("Decision", "Team ask"). */
  kind: string;
  title: string;
  /** How long it has waited, as the list shows it ("2h"). */
  waited?: string;
  /** Where its own action lives. */
  href: string;
  /** It opens a review (so the drawer may carry on); anything else is a different page. */
  review: boolean;
  /** The person can act on it there (false: waiting on someone else, or a decision they can't take). */
  actionable: boolean;
}

export type NextState =
  | { kind: "reading" }
  | { kind: "unread" }
  | { kind: "next"; item: NextItem; changed: boolean }
  | { kind: "none_actionable"; changed: boolean }
  | { kind: "last"; changed: boolean };

/** `fresh`: the list's rows after the decision, in its order; undefined while reading, null when the read failed.
 *  `snapshot`: the row keys in order when the review opened (null when not known). `current`: the decided row's key. */
export function pickNext(current: string, snapshot: string[] | null, fresh: NextItem[] | null | undefined): NextState {
  if (fresh === undefined) return { kind: "reading" };
  if (fresh === null) return { kind: "unread" };
  const after = fresh.filter((i) => i.key !== current);
  const before = (snapshot ?? []).filter((k) => k !== current);
  const changed = !!snapshot && (after.length !== before.length || after.some((i, n) => i.key !== before[n]));
  const item = after.find((i) => i.actionable);
  if (item) return { kind: "next", item, changed };
  return after.length ? { kind: "none_actionable", changed } : { kind: "last", changed };
}

export const NEXT_WORDS = {
  reading: "Checking what else waits on you…",
  unread: "Align couldn't read what else waits on you.",
  none_actionable: "Nothing else waits on a decision from you.",
  last: "That was the last thing waiting on you.",
  changed: "The list changed while you were here.",
} as const;
