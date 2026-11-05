"use client";
import Link from "next/link";
import { DECISION_LINK } from "./decision-links";
import { NEXT_WORDS, pickNext, type NextItem } from "./next-core.mts";

// "Next" after a decision: shown under a recorded decision's notice (ReviewActions' `after`), never before one and never
// after a refusal. One outlined link to the next item in the person's ranked list, plus "Back to the list". It never
// decides and never pre-picks a choice. A next item of another kind (a team ask, an alignment) is a different page: the
// link navigates there (`onGo` lets the host close its drawer first), and its label names the kind.

const OUTLINE =
  "inline-flex min-h-[36px] max-w-full items-center rounded-(--radius-s) border border-(--edge) px-3 text-[14px] font-medium text-(--text-1) hover:bg-(--bg-overlay) max-sm:min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

export function NextAfterDecision({
  current,
  snapshot,
  fresh,
  onBack,
  onGo,
}: {
  current: string;
  snapshot: string[] | null;
  fresh: NextItem[] | null | undefined;
  /** Back to the list, at the place the review was opened from. */
  onBack: () => void;
  /** Called before following the link (e.g. close the drawer when the next item isn't a review). */
  onGo?: (item: NextItem) => void;
}) {
  const s = pickNext(current, snapshot, fresh);
  const changed = "changed" in s && s.changed;
  return (
    <div data-next={s.kind} className="flex flex-col gap-2 border-t border-(--line) pt-3">
      {changed && <p className="text-[13px] text-(--text-2)">{NEXT_WORDS.changed}</p>}
      {s.kind === "next" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={s.item.href} data-next-item={s.item.key} data-next-review={s.item.review ? "true" : "false"} className={OUTLINE} onClick={() => onGo?.(s.item)}>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Next: {s.item.kind} · {s.item.title}
              {s.item.waited && <span className="font-normal text-(--text-3)"> · waiting {s.item.waited}</span>}
            </span>
          </Link>
          <button type="button" className={DECISION_LINK} onClick={onBack}>
            Back to the list
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-[14px] text-(--text-2)">{NEXT_WORDS[s.kind]}</p>
          {s.kind !== "reading" && (
            <button type="button" className={DECISION_LINK} onClick={onBack}>
              Back to the list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
