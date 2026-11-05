"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ReviewChoice } from "../ds";
import type { ChangeRequest } from "../types";
import { nameList, waitsOn } from "./model";

// Concept B's entry points into a decision. The decisions themselves (the confirm, the re-read, the POST, the server's
// 403/404/409) are the shared ReviewActions (ds/review.tsx); the desk only picks which choice it opens with: a row's
// button or a live lane-map connector passes it as ReviewActions' initialChoice. Choices come only from `cr.can`.

export type Act = ReviewChoice;

export function actWords(a: Act, cr: ChangeRequest): string {
  const next = cr.version ?? cr.goal.version + 1;
  const w: Record<Act, string> = {
    approve_and_launch: "Approve and launch",
    approve: cr.can.approve_and_launch ? "Approve only" : "Approve",
    launch: `Launch v${next}`,
    not_yet: "Not yet",
    accept_if: "Accept if…",
    counter: "Suggest a change",
    reject: "Decline",
    accept_counter: "Accept the change",
    acknowledge: "Confirm the condition is met",
    rebase: `Update to version ${cr.goal.version}`,
    withdraw: "Withdraw",
  };
  return w[a];
}

/** The choices this person has, dominant first, in the order ReviewActions offers them. */
export function actsFor(cr: ChangeRequest): Act[] {
  const c = cr.can;
  const out: Act[] = [];
  if (c.approve_and_launch) out.push("approve_and_launch");
  if (c.launch) out.push("launch");
  if (c.accept_counter) out.push("accept_counter");
  if (c.acknowledge && cr.condition) out.push("acknowledge");
  if (c.rebase && cr.behind) out.push("rebase");
  if (c.approve) out.push("approve");
  if (c.not_yet && cr.launch !== "not_yet") out.push("not_yet");
  if (c.counter) out.push("counter");
  if (c.reject) out.push("reject");
  if (c.withdraw) out.push("withdraw");
  return out;
}

/** The choices that move a request forward get the pink primary; declining or withdrawing never does. */
export const DOMINANT: readonly Act[] = ["approve_and_launch", "launch", "accept_counter", "acknowledge", "rebase", "approve"];

/** Who may act when this person may not. */
export function notYours(cr: ChangeRequest, me: string): string {
  const w = waitsOn(cr);
  if (!w) return "Nobody can act on it now.";
  return `Waiting on ${nameList(w.people, me)} for the ${w.for}.`;
}

const base = "inline-flex min-h-[36px] shrink-0 items-center justify-center whitespace-nowrap rounded-(--radius-s) px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px]";

export function PrimaryBtn({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} bg-(--accent) text-(--text-on-accent) hover:bg-(--accent-hover)`}>
      {children}
    </button>
  );
}

export function QuietBtn({ children, onClick, disabled, danger }: { children: ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} border border-(--edge) bg-(--bg-raised) hover:bg-(--bg-overlay) ${danger ? "text-(--st-declined)" : "text-(--text-1)"}`}>
      {children}
    </button>
  );
}

export function QuietLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link href={href} className={`${base} border border-(--edge) bg-(--bg-raised) text-(--text-1) hover:bg-(--bg-overlay)`}>
      {children}
    </Link>
  );
}

/** The button for a choice. One filled pink per view (`filled`, for the view's first dominant choice); other dominant
 *  choices are outlined in pink text; declining and withdrawing are quiet. */
export function ActBtn({ a, cr, onClick, filled = false }: { a: Act; cr: ChangeRequest; onClick: () => void; filled?: boolean }) {
  if (DOMINANT.includes(a) && filled) return <PrimaryBtn onClick={onClick}>{actWords(a, cr)}</PrimaryBtn>;
  return DOMINANT.includes(a) ? (
    <button type="button" onClick={onClick} className={`${base} border border-(--accent-text) text-(--accent-text) hover:bg-(--accent-soft)`}>
      {actWords(a, cr)}
    </button>
  ) : (
    <QuietBtn danger={a === "reject"} onClick={onClick}>
      {actWords(a, cr)}
    </QuietBtn>
  );
}
