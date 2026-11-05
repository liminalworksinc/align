"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api, ApiError, sentence } from "../kit";
import type { ChangeRequest } from "../types";
import { nameList, proposedVersion, waitsOn } from "./model";

// The decisions the signed-in person may take on a change request, straight from its `can` flags, and the one POST each
// sends (lib/v2/changes.ts actOnChangeRequest). Before sending, the request is read again: if its revision, state or
// launch changed, nothing is sent and the person is told (as decide.tsx does). A 403/404/409 shows the server's own
// words. Suggesting a change and updating a request need the full form, so they link to the goal page that has it.

export type Act = "approve_and_launch" | "approve" | "launch" | "not_yet" | "reject" | "accept_counter" | "withdraw";

export const ACT_WORDS: Record<Act, string> = {
  approve_and_launch: "Approve and launch",
  approve: "Approve only",
  launch: "Launch",
  not_yet: "Not yet",
  reject: "Decline",
  accept_counter: "Accept the change",
  withdraw: "Withdraw",
};

/** What each decision does, in one line, for the confirmation. */
export function actMeaning(a: Act, cr: ChangeRequest): string {
  const v = proposedVersion(cr);
  switch (a) {
    case "approve_and_launch":
      return `Records your approval and launches v${v}. Align serves v${v} to any connected app that reads the goal from then on.`;
    case "approve":
      return `Records your approval. Nothing is launched: Align keeps serving v${cr.goal.version} until someone who can launch it does.`;
    case "launch":
      return `Launches the approved change as v${v}. Align serves it to any connected app that reads the goal from then on.`;
    case "not_yet":
      return `Records that it isn't launched yet. Align keeps serving v${cr.goal.version}; it can still be launched later.`;
    case "reject":
      return "Declines the request with your reason. The goal doesn't change.";
    case "accept_counter":
      return "Accepts the approver's suggested change. The request goes back to them for a decision.";
    case "withdraw":
      return "Withdraws your request. The goal doesn't change.";
  }
}

/** The decisions this person may take now, the dominant one first. */
export function actsFor(cr: ChangeRequest): Act[] {
  const c = cr.can;
  const out: Act[] = [];
  if (c.approve_and_launch) out.push("approve_and_launch");
  if (c.launch) out.push("launch");
  if (c.accept_counter) out.push("accept_counter");
  if (c.approve) out.push("approve");
  if (c.not_yet) out.push("not_yet");
  if (c.reject) out.push("reject");
  if (c.withdraw) out.push("withdraw");
  return out;
}

/** The decisions that move a request forward get the pink primary; withdrawing or declining never does. */
export const DOMINANT: readonly Act[] = ["approve_and_launch", "launch", "accept_counter", "approve"];

/** Decisions that need the goal page's full form. */
export function formLinks(ws: string, cr: ChangeRequest): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const href = `/app/w/${ws}/goals/${cr.goal.id}#change-requests`;
  if (cr.can.counter) out.push({ label: "Suggest a change", href });
  if (cr.can.rebase && cr.behind) out.push({ label: `Update to v${cr.goal.version}`, href });
  return out;
}

export type Outcome = { kind: "done" | "stale" | "refused"; text: string };

const DONE: Record<Act, string> = {
  approve_and_launch: "Approved and launched.",
  approve: "Approved. Not launched yet.",
  launch: "Launched.",
  not_yet: "Recorded: not launched yet.",
  reject: "Declined.",
  accept_counter: "You accepted the suggested change.",
  withdraw: "Withdrawn.",
};

/** Send one decision, re-reading the request first. */
export async function sendAct(ws: string, cr: ChangeRequest, a: Act, text: string): Promise<Outcome> {
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  const now = await api<ChangeRequest>(path).catch(() => null);
  if (!now) return { kind: "refused", text: "Not recorded. Align couldn't read this request again just now, so nothing was sent. Try again." };
  if (now.revision !== cr.revision || now.state !== cr.state || now.launch !== cr.launch) {
    return { kind: "stale", text: `Not recorded. This request changed after you opened it: ${sentence(now.state_note)} Read it again before you decide.` };
  }
  const body: Record<string, unknown> =
    a === "reject" ? { revision: cr.revision, reason: text.trim() } : a === "approve" || a === "approve_and_launch" ? { revision: cr.revision, note: text.trim() || null } : { revision: cr.revision };
  try {
    await api(`${path}/${a}`, { body });
    return { kind: "done", text: DONE[a] };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    const msg = sentence((e as Error).message);
    return { kind: status === 409 ? "stale" : "refused", text: `Not recorded. ${msg}` };
  }
}

/** Who may take the decisions this person can't, for an inert action or connector. */
export function notYours(cr: ChangeRequest, me: string): string {
  const w = waitsOn(cr);
  if (!w) return "Nobody can act on it now.";
  return `Waiting on ${nameList(w.people, me)} for the ${w.for}.`;
}

export function OutcomeLine({ o }: { o: Outcome }) {
  const tone = o.kind === "done" ? "border-(--st-approved)/40 text-(--st-approved)" : o.kind === "stale" ? "border-(--st-retry)/50 text-(--st-retry)" : "border-(--st-declined)/50 text-(--st-declined)";
  return (
    <p role={o.kind === "done" ? "status" : "alert"} tabIndex={-1} data-outcome={o.kind} className={`rounded-(--radius-s) border bg-(--bg-inset) px-3 py-2 text-[14px] ${tone}`}>
      {o.text}
    </p>
  );
}

const base = "inline-flex min-h-[36px] items-center justify-center rounded-(--radius-s) px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px]";

export function PrimaryBtn({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} bg-(--accent) text-(--text-on-accent) hover:bg-(--accent-hover)`}>
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

/** Confirm one decision: who acts, what it does, the reason a decline needs, then the one POST. */
export function Confirm({ ws, cr, act, meName, onDone, onCancel }: { ws: string; cr: ChangeRequest; act: Act; meName: string; onDone: (o: Outcome) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const needsReason = act === "reject";
  const takesNote = act === "approve" || act === "approve_and_launch";
  return (
    <form
      data-confirm={act}
      className="flex flex-col gap-3 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-raised) p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (needsReason && !text.trim()) return;
        setBusy(true);
        const o = await sendAct(ws, cr, act, text);
        setBusy(false);
        onDone(o);
      }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">Confirm</p>
      <p className="text-[15px] text-(--text-1)">
        <b className="font-semibold">{ACT_WORDS[act]}</b>, as {meName}, on revision {cr.revision} of {cr.requester.name}&apos;s request.
      </p>
      <p className="text-[14px] text-(--text-2)">{actMeaning(act, cr)}</p>
      {(needsReason || takesNote) && (
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-(--text-2)">{needsReason ? "Reason (required, the requester sees it)" : "Note (optional)"}</span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={2000}
            required={needsReason}
            className="rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 py-2 text-[14px] text-(--text-1)"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <PrimaryBtn type="submit" disabled={busy || (needsReason && !text.trim())}>
          {busy ? "Sending…" : ACT_WORDS[act]}
        </PrimaryBtn>
        <QuietBtn onClick={onCancel} disabled={busy}>
          Cancel
        </QuietBtn>
      </div>
    </form>
  );
}
