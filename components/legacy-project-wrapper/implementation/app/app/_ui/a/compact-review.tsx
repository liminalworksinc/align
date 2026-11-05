"use client";
import Link from "next/link";
import { useState } from "react";
import { NoticeBox, useNotice } from "../crparts";
import { Compare, EvidenceLabel } from "../ds";
import { api, ApiError, sentence, when } from "../kit";
import type { ChangeRequest } from "../types";

// Concept A's compact review (LIM-2472), built for the drawer and a phone: the change (Compare), what Align holds
// about it, and the decisions this person may take, the dominant one first. Every button is the real POST with the
// request's revision; before sending, the request is read again and a changed revision or state sends nothing. A
// refusal shows the server's own reason. Decisions that need a form of their own (suggest a change, Accept if…,
// acknowledge a condition, update to the goal's version) live on the full record, linked here, not re-built.
//
// Launch is always a deliberate press: Approve and launch and Launch each ask to confirm, saying what Align will
// release. "Not yet" leaves the change approved and unlaunched; the drawer says so and still offers Launch.

type Action = "approve_and_launch" | "approve" | "reject" | "accept_counter" | "withdraw" | "launch" | "not_yet";

const primary =
  "inline-flex min-h-[44px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-4 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";
const secondary =
  "inline-flex min-h-[44px] items-center justify-center rounded-(--radius-s) border border-(--line-strong) px-4 text-[14px] text-(--text-1) hover:bg-(--bg-raised) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";
const danger =
  "inline-flex min-h-[44px] items-center justify-center rounded-(--radius-s) border border-(--st-declined) px-4 text-[14px] text-(--st-declined) hover:bg-(--st-declined-soft) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

/** The review's body and its decision bar. The bar goes in the drawer's footer, so the decision is always on screen. */
export function useCompactReview({ ws, cr, me, titles, recordHref, onDone }: { ws: string; cr: ChangeRequest; me: string; titles: Map<string, string>; recordHref: string; onDone: () => void }) {
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  const [notice, setNotice] = useNotice(cr.id);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const c = cr.can;
  const open = cr.state === "pending" || cr.state === "countered";
  const unlaunched = cr.state === "approved" && (cr.launch === "pending" || cr.launch === "not_yet");
  const next = cr.version ?? cr.goal.version + 1;
  const snap = cr.revisions.find((r) => r.revision === cr.revision)?.snapshot ?? null;
  const said = (p: { id: string; name: string } | null) => (p ? (p.id === me ? "you" : p.name) : "someone");
  // Form-only decisions this person has: offered on the record.
  const elsewhere = (open && (c.counter || c.acknowledge || c.rebase)) || (!open && c.acknowledge && !!cr.condition);

  const done: Record<Action, string> = {
    approve_and_launch: `you approved revision ${cr.revision} and launched it as version ${next}. Align sends it to the sessions bound to this goal; receipts show which received it`,
    approve: `you approved revision ${cr.revision} as version ${next}. It is not launched: version ${cr.goal.version} stays the released one until someone launches it`,
    reject: "you declined it. Nothing changes",
    accept_counter: "you accepted the suggested change. It now waits on the approvers",
    withdraw: "you withdrew your request",
    launch: `you launched version ${next}. Align sends it to the sessions bound to this goal; receipts show which received it`,
    not_yet: `you decided not yet. It stays approved and unlaunched; anyone who may launch it can still do so`,
  };

  const send = async (a: Action) => {
    if (sending) return;
    setSending(true);
    setNotice(null);
    try {
      const now = await api<ChangeRequest>(path).catch(() => null);
      if (now && (now.revision !== cr.revision || now.state !== cr.state || now.launch !== cr.launch)) {
        setNotice({ kind: "stale", text: `Not recorded. ${now.state !== cr.state ? now.state_note : "This request changed after you opened it."} Nothing was sent. Read it again and decide again.` });
        onDone();
        return;
      }
      const body: Record<string, unknown> = { revision: cr.revision };
      if (a === "reject") body.reason = reason.trim();
      if (a === "approve" || a === "approve_and_launch") body.note = null;
      await api(`${path}/${a}`, { body });
      setNotice({ kind: "done", text: `Recorded: ${done[a]}.` });
      setConfirm(null);
      onDone();
    } catch (e) {
      const reauth = e instanceof ApiError && e.code === "reauth_required";
      setNotice({ kind: "refused", text: `Not recorded. ${sentence((e as Error).message)}${reauth ? " Sign in again from Account, then come back." : ""}` });
      if (e instanceof ApiError && e.status === 409) {
        setConfirm(null);
        onDone();
      }
    } finally {
      setSending(false);
    }
  };

  const confirmText: Partial<Record<Action, string>> = {
    approve_and_launch: `Approve revision ${cr.revision} and launch it as version ${next}? Align records your approval, releases version ${next} and sends it to the sessions bound to this goal. A launch can't be taken back; a later change replaces it.`,
    approve: `Approve revision ${cr.revision} as version ${next}, without launching? Version ${cr.goal.version} stays the released one until someone launches it.`,
    launch: `Launch version ${next}? Align releases it and sends it to the sessions bound to this goal. A launch can't be taken back; a later change replaces it.`,
  };
  const label: Record<Action, string> = {
    approve_and_launch: "Approve and launch",
    approve: c.approve_and_launch ? "Approve only" : "Approve",
    reject: "Decline",
    accept_counter: "Accept the suggested change",
    withdraw: "Withdraw my request",
    launch: `Launch version ${next}`,
    not_yet: "Not yet",
  };

  // This person's decisions here, the dominant one first.
  const acts: Action[] = [];
  if (open) {
    if (c.approve_and_launch) acts.push("approve_and_launch");
    if (c.approve) acts.push("approve");
    if (c.accept_counter) acts.push("accept_counter");
    if (c.reject) acts.push("reject");
    if (c.withdraw) acts.push("withdraw");
  } else if (unlaunched) {
    if (c.launch) acts.push("launch");
    if (c.not_yet && cr.launch !== "not_yet") acts.push("not_yet");
  }
  const instant = (a: Action) => a === "not_yet" || a === "accept_counter" || a === "withdraw";
  const press = (a: Action) => (instant(a) ? void send(a) : setConfirm(a));

  const who = open ? (cr.state === "countered" ? [cr.requester] : cr.approvers) : cr.launchers;
  const notYours = acts.length === 0 && (open || unlaunched);
  const body = (
    <div className="flex flex-col gap-4" data-compact-review>
      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-semibold text-(--text-1)">What would change</h3>
        <Compare
          before={cr.diff.before}
          after={cr.diff.after}
          hidden={cr.diff.hidden_depends_on ?? null}
          beforeLabel={`Version ${cr.base_version}${cr.state === "approved" ? "" : " (approved)"}`}
          afterLabel={cr.version ? `Version ${cr.version}` : "Proposed"}
          titleOf={(id) => titles.get(id) ?? "a goal you can't see"}
        />
      </section>
      <section className="flex flex-col gap-2 text-[13px] text-(--text-2)">
        <h3 className="text-[14px] font-semibold text-(--text-1)">What Align holds about it</h3>
        <p className="flex flex-wrap items-center gap-2">
          {cr.evidence_count ? <EvidenceLabel kind="reported" size="s" detail={`${cr.evidence_count} evidence link${cr.evidence_count === 1 ? "" : "s"}, not verified`} /> : <EvidenceLabel kind="unobserved" size="s" detail="no evidence links" />}
          {snap && <EvidenceLabel kind="reported" size="s" detail={`${snap.bound_sessions} session${snap.bound_sessions === 1 ? "" : "s"} bound at revision ${snap.revision}`} />}
        </p>
        {cr.condition && (
          <p>
            Accept if: &ldquo;{cr.condition.text}&rdquo; {cr.condition.acknowledged_by ? `Confirmed by ${said(cr.condition.acknowledged_by)}.` : "Not confirmed yet."}
          </p>
        )}
        {cr.launch === "not_yet" && (
          <p data-not-yet>
            {said(cr.launch_decided_by)} decided not yet{cr.launch_decided_at ? ` on ${when(cr.launch_decided_at)}` : ""}. It stays approved and unlaunched; version {cr.goal.version} is still the released one.
          </p>
        )}
        {(cr.dependency_loop || cr.dependency_not_visible) && <p>{cr.dependency_loop ?? cr.dependency_not_visible}</p>}
      </section>

      {elsewhere && (
        <p className="text-[13px] text-(--text-2)">
          To suggest a change, accept it on a condition, confirm a condition or update it to the goal&apos;s version,{" "}
          <Link href={recordHref} className="text-(--accent-text) underline">
            open the full record
          </Link>
          .
        </p>
      )}
    </div>
  );
  const footer = (
    <div className="flex w-full flex-col gap-2" data-decision-bar>
      {notice && <NoticeBox notice={notice} />}
      {acts.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Your decision">
          {confirm && confirm !== "reject" ? (
            <div className="flex flex-col gap-3" data-confirm={confirm}>
              <p className="text-[14px] text-(--text-1)">{confirmText[confirm]}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={sending} onClick={() => void send(confirm)} autoFocus>
                  Confirm: {label[confirm].toLowerCase()}
                </button>
                <button type="button" className={secondary} disabled={sending} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : confirm === "reject" ? (
            <div className="flex flex-col gap-2" data-confirm="reject">
              <label className="flex flex-col gap-1 text-[13px] text-(--text-2)">
                Why you decline it (the requester sees this)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} className="rounded-(--radius-s) border border-(--line-strong) bg-(--bg-inset) px-3 py-2 text-[14px] text-(--text-1)" autoFocus />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={danger} disabled={sending || !reason.trim()} onClick={() => void send("reject")}>
                  Decline with this reason
                </button>
                <button type="button" className={secondary} disabled={sending} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {acts.map((a, i) => (
                <button key={a} type="button" className={i === 0 ? primary : a === "reject" ? danger : secondary} disabled={sending} onClick={() => press(a)} data-act={a}>
                  {label[a]}
                </button>
              ))}
            </div>
          )}
          {!confirm && (open ? <p className="text-[12px] text-(--text-3)">Approving records the decision; launching is what releases the new version to agents.</p> : null)}
        </section>
      )}
      {notYours && (
        <p className="text-[14px] text-(--text-2)" data-review-not-yours>
          <b className="font-semibold text-(--text-1)">Not yours to {open ? "decide" : "launch"}.</b> {who.map((p) => (p.id === me ? "you" : p.name)).join(" or ") || "Nobody yet"} can.
        </p>
      )}
    </div>
  );
  return { body, footer };
}
