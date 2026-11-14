import Link from "next/link";
import { Children, type ReactNode } from "react";
import { FRESH_WORD, type Fresh } from "../fresh";
import { StatusPill, type StatusKind } from "./status-pill";

// The rows of Home's "needs a human" list (LIM-2472 direction, 2026-11-05): judgment is the unit, agent work is its
// evidence. One anatomy for every kind: the kind, the goal, who asked or what caused it, how long it has waited, its
// evidence and one outlined action. The list has no table header, so one row reads as a row, not a hollow table; the
// columns line up through subgrid and stack by the list's own width (a container query), not the window's.

/** One row. The title is the row's link: its ::after stretches over the row, so the whole row is one target while
 *  `action` stays a separate control above it. Never a filled button: the one filled action in a view is the review's
 *  (use NeedAction). `tone` colours the kind with an existing pill; the kind's word is the caller's. */
/** A row's "New" or "Changed just now" (LIM-2516 S6, _ui/fresh.ts): what a live re-read added or changed, for a moment. */
export function FreshTag({ fresh }: { fresh: Fresh }) {
  return (
    <span data-fresh={fresh} className="al-fresh inline-flex items-center rounded-full border border-(--accent-text) px-1.5 font-mono text-[10px] uppercase leading-[16px] tracking-[0.08em] text-(--accent-text) whitespace-nowrap">
      {FRESH_WORD[fresh]}
    </span>
  );
}

export function NeedRow({
  kind,
  tone = "draft",
  fresh,
  title,
  sub,
  waited,
  evidence,
  action,
  href,
  selected = false,
}: {
  kind: string;
  tone?: StatusKind;
  /** Added or changed by a live re-read just now. */
  fresh?: Fresh;
  title: ReactNode;
  sub?: ReactNode;
  waited?: string;
  evidence?: ReactNode;
  action?: ReactNode;
  href?: string;
  selected?: boolean;
}) {
  const heading = "text-[14px] font-medium text-(--text-1) group-first/need:font-semibold @3xl:group-first/need:text-[15px]";
  return (
    <li
      aria-current={selected ? "true" : undefined}
      className={`group/need relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b border-(--line) px-3 py-3 last:border-b-0 @3xl:col-span-full @3xl:grid-cols-subgrid @3xl:items-center @3xl:gap-y-0 @3xl:py-1.5 ${selected ? "bg-(--accent-soft) shadow-[inset_2px_0_0_var(--accent-text)]" : href ? "hover:bg-(--bg-raised)" : ""}${fresh && !selected ? " al-fresh-row" : ""}`}
    >
      {/* Stacked, the top line (kind, time) and the bottom line (evidence, action) size apart, so a long action can never
          squeeze the kind. Wide, the bottom wrapper dissolves and `order` puts all five cells in the subgrid's columns. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 @3xl:order-1">
        <StatusPill kind={tone} label={kind} size="s" />
        {fresh && <FreshTag fresh={fresh} />}
      </div>
      <div className="whitespace-nowrap pt-0.5 text-right font-mono text-[12px] tabular-nums text-(--text-3) @3xl:order-4 @3xl:pt-0">
        {waited && (
          <>
            <span className="sr-only">Waiting </span>
            {waited}
          </>
        )}
      </div>
      <div className="col-span-2 min-w-0 @3xl:order-2 @3xl:col-span-1">
        {href ? (
          <Link href={href} className={`${heading} block underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline @3xl:truncate`}>
            {title}
          </Link>
        ) : (
          <p className={`${heading} @3xl:truncate`}>{title}</p>
        )}
        {sub && <p className="text-[13px] leading-[18px] text-(--text-2) @3xl:truncate">{sub}</p>}
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 empty:hidden @3xl:contents">
        <div className="flex min-h-[44px] max-w-full flex-[1_1_auto] flex-wrap items-center gap-1 empty:hidden @3xl:order-3 @3xl:min-h-0 @3xl:flex-none @3xl:empty:block">{evidence}</div>
        <div className="relative z-10 max-w-full empty:hidden @3xl:order-5 @3xl:self-center @3xl:text-right @3xl:empty:block">{action}</div>
      </div>
    </li>
  );
}

/** A row's action: a link or a button. Outlined by default. `quiet` is a shortcut beside it: underlined text with no
 *  outline, so it is plainly a control and the outlined action stays the row's main one. Its word must say what it does and doesn't do ("Approve only"), and
 *  `name` can say the rest to a screen reader. 44px when the row stacks. `dense` is for desktop-only places such as a
 *  LaneMap card, which is never shown on a phone; never use it where a phone can reach it. */
export function NeedAction({ children, href, onClick, disabled, quiet = false, dense = false, name }: { children: ReactNode; href?: string; onClick?: () => void; disabled?: boolean; quiet?: boolean; dense?: boolean; name?: string }) {
  const look = quiet ? "px-2 font-normal text-(--text-2) underline underline-offset-4 hover:text-(--text-1)" : "border border-(--edge) px-3 font-medium text-(--text-1) hover:bg-(--bg-overlay)";
  const cls = `inline-flex items-center justify-center whitespace-nowrap rounded-(--radius-s) text-[13px] transition-[color,background-color,border-color] disabled:cursor-not-allowed disabled:opacity-50 ${dense ? "min-h-[24px]" : "min-h-[36px] max-sm:min-h-[44px] @max-3xl:min-h-[44px]"} ${look}`;
  return href ? (
    <Link href={href} aria-label={name} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={name} className={cls}>
      {children}
    </button>
  );
}

/** The ranked list. `rankNote` states the ranking, as text or the caller's own disclosure; it shows once there is
 *  something to rank, and nothing renders when it is empty or omitted, so a caller can place it elsewhere. With no rows
 *  the list collapses to one line: `empty`, default "Nothing needs you."; `empty={null}` renders nothing at all, for a
 *  heading that already says so. */
export function NeedList({ rankNote, children, empty }: { rankNote?: ReactNode; children: ReactNode; empty?: ReactNode }) {
  const rows = Children.toArray(children);
  if (!rows.length) {
    if (empty === null) return null;
    return <p className="rounded-(--radius-m) border border-(--line) bg-(--bg-panel) px-3 py-2.5 text-[14px] text-(--text-2)">{empty ?? "Nothing needs you."}</p>;
  }
  return (
    <div className="@container min-w-0">
      {rows.length > 1 && rankNote ? <div className="mb-1.5 px-1 text-[12px] text-(--text-3)">{rankNote}</div> : null}
      <ol className="grid rounded-(--radius-m) border border-(--line) bg-(--bg-panel) @3xl:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] @3xl:gap-x-4">{rows}</ol>
    </div>
  );
}
