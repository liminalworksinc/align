"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ApiError, api, sentence } from "../kit";
import type { ChangeFields, ChangeRequest, Goal } from "../types";
import { changeWaits, launchWaits } from "@/lib/v2/home-core.mts";
import { Compare } from "./compare";
import { EvidenceLabel } from "./evidence-label";
import { StatusPill, type StatusKind } from "./status-pill";

// A compact review of one change request (LIM-2472 workstream S), for both concepts in place of main's long decision
// card (_ui/decide.tsx, _ui/changes.tsx, which stay the concepts'). Same rules and words as those files:
//  - ReviewBody: who asked and when, the reason once, the diff (Compare), evidence with its class, what Align recorded
//    about the goal when the revision was written (bound sessions only), and what it waits for and on whom
//    (changeWaits / launchWaits, lib/v2/home-core.mts).
//  - ReviewActions: the real POSTs to …/change-requests/<id>/<action>, offered exactly as the request's `can` flags say
//    for the signed-in person (the server decides; the flags are its answer). One dominant action, then the others.
//    Each choice shows its input, then a confirmation ("Confirm: <choice>") before anything is sent; Launch is the
//    confirmation itself. Before sending, the request is read again: if it changed, nothing is sent. 403/404/409 re-read
//    and say what changed (red); a network failure, 429 or 5xx says to try again (amber).
// Kept from main for its tests: data-decision="<choice title>", data-confirm="<choice>", "Confirm: <title>" buttons,
// data-cr / data-cr-view. Wording: Align releases a version at launch; it never says what agents "are on".

type Person = { id: string; name: string };
type Choice = "approve_and_launch" | "approve" | "launch" | "not_yet" | "accept_if" | "counter" | "reject" | "accept_counter" | "acknowledge" | "rebase" | "withdraw";

const BTN = "inline-flex min-h-[36px] max-sm:min-h-[44px] items-center justify-center whitespace-nowrap rounded-(--radius-s) border px-3 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BTN} border-(--accent) bg-(--accent) text-(--text-on-accent) hover:bg-(--accent-hover)`;
const SECONDARY = `${BTN} border-(--edge) bg-(--bg-raised) text-(--text-1) hover:bg-(--bg-overlay)`;
const FIELD = "min-h-[36px] max-sm:min-h-[44px] w-full rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-2.5 py-2 text-[14px] text-(--text-1) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";
const at = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const blank = (s: string) => s.trim() === "";
const crPath = (ws: string, cr: ChangeRequest) => `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
const who = (p: Person | null | undefined, me: string) => (!p ? "someone" : p.id === me ? "you" : p.name);
const people = (ps: Person[], me: string) => (ps.length ? ps.map((p) => who(p, me)).join(" or ") : "nobody yet");

function statusOf(cr: ChangeRequest): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched", label: `Launched v${cr.version}` } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, not yet launched" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}

// ---------------------------------------------------------------------------------------------------------------------

/** The request itself: everything a reviewer needs before choosing, nothing they don't. */
/** `onDone`: called after an evidence link is added (or refused), to re-read the request; without it the Add evidence
 *  control isn't offered. */
export function ReviewBody({ ws, cr, me, titleOf = (id) => id, onDone }: { ws: string; cr: ChangeRequest; me: string; titleOf?: (id: string) => string; onDone?: () => void }) {
  // Add evidence's result lives here, outside the can.add_evidence gate: a refusal re-reads the request, and the new
  // read may no longer allow adding (declined meanwhile), which unmounts the form but must not take its statement along.
  const [evNotice, setEvNotice] = useState<Notice | null>(null);
  const evRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (evNotice) evRef.current?.focus();
  }, [evNotice]);
  const s = statusOf(cr);
  const current = cr.revisions.find((r) => r.revision === cr.revision) ?? cr.revisions[cr.revisions.length - 1];
  const evidence = cr.revisions.flatMap((r) => r.evidence);
  const waits = changeWaits(cr);
  const launch = launchWaits(cr);
  const n = cr.base_version;
  const proposedLabel = cr.state === "approved" && cr.version ? `Version ${cr.version}` : cr.state === "countered" ? `Revision ${cr.revision} (suggested)` : "Proposed";
  return (
    <div className="flex min-w-0 flex-col gap-4" data-cr={cr.id} data-cr-view="review">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill kind={s.kind} label={s.label} size="s" />
        <p className="text-[14px] text-(--text-2)">
          <span className="font-medium text-(--text-1)">{who(cr.requester, me) === "you" ? "You" : cr.requester.name}</span> asked to change{" "}
          <span className="font-medium text-(--text-1)">{cr.goal.title}</span> (version {n}) · {at(cr.created_at)}
          {cr.revision > 1 && ` · revision ${cr.revision}`}
        </p>
      </header>

      {!blank(cr.reason) && (
        <blockquote className="border-l-2 border-(--line-strong) pl-3 text-[15px] text-(--text-1) [overflow-wrap:anywhere]">
          {cr.reason}
        </blockquote>
      )}
      {current?.condition && (
        <p className="text-[14px] text-(--text-1)">
          <span className="font-medium">Accept if:</span> {current.condition}
          {cr.condition?.acknowledged_by ? <span className="text-(--text-2)"> · acknowledged by {who(cr.condition.acknowledged_by, me)}, {at(cr.condition.acknowledged_at)}</span> : <span className="text-(--text-2)"> · not acknowledged yet</span>}
        </p>
      )}

      <Compare before={cr.diff.before} after={cr.diff.after} hidden={cr.diff.hidden_depends_on ?? null} beforeLabel={`Version ${n}`} afterLabel={proposedLabel} titleOf={titleOf} />
      {cr.behind && <p className="text-[14px] text-(--st-pending)">The goal moved on to version {cr.goal.version} since this was asked against version {n}.</p>}

      <section aria-label="Evidence" className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-(--text-2)">Evidence</p>
        {evidence.length === 0 ? (
          <p className="text-[14px] text-(--text-2)">None. Approving without evidence is recorded as such.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {evidence.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                {e.reported_as === "agent-reported" ? <EvidenceLabel kind="reported" size="s" detail="connected app" /> : <span className="rounded-(--radius-s) border border-(--edge) px-1.5 text-[12px] leading-5 text-(--text-2)">Self-reported</span>}
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--accent-text) underline underline-offset-2 [overflow-wrap:anywhere]">
                  {e.label || e.url}
                </a>
                <span className="text-[13px] text-(--text-3)">
                  {who(e.added_by, me)}, revision {e.revision}
                </span>
              </li>
            ))}
            <li className="text-[13px] text-(--text-3)">Align doesn&apos;t verify links.</li>
          </ul>
        )}
        {evNotice && <NoticeLine n={evNotice} r={evRef} />}
        {cr.can.add_evidence && onDone && <AddEvidence ws={ws} cr={cr} onDone={onDone} setNotice={setEvNotice} />}
      </section>

      {current?.snapshot && (
        <p className="text-[13px] text-(--text-2)">
          When revision {current.snapshot.revision} was written, Align recorded {current.snapshot.bound_sessions === 1 ? "1 session" : `${current.snapshot.bound_sessions} sessions`} bound to this goal.
        </p>
      )}

      <p data-waits className="rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-3 py-2 text-[14px] text-(--text-1)">
        {waits?.next === "rebase" && `Waits on ${people(waits.waiting_on, me)} to update it to version ${cr.goal.version}.`}
        {waits?.next === "resolve_loop" && `Waits on ${people(waits.waiting_on, me)}: nobody can approve it as it stands. ${cr.dependency_loop ?? ""}`}
        {waits?.next === "decide" && `Waits on ${people(waits.waiting_on, me)} to decide.`}
        {waits?.next === "accept_counter" && `Waits on ${people(waits.waiting_on, me)} to accept the suggested change.`}
        {!waits && launch && `Approved. Approval is not launch: version ${cr.version ?? cr.goal.version + 1} is released only when ${people(launch.launchers, me)} launch${launch.launchers.length === 1 && launch.launchers[0].id !== me ? "es" : ""} it.`}
        {!waits && !launch && cr.state === "approved" && cr.launch === "launched" && `Launched by ${who(cr.launch_decided_by, me)}, ${at(cr.launch_decided_at)}: Align released version ${cr.version}.`}
        {!waits && !launch && cr.state !== "approved" && cr.state_note}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** Below 640px (Tailwind's sm). Server render and first paint say "not a phone". */
const PHONE = "(max-width: 639.98px)";
function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(PHONE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
/** Choices whose only text is an optional note: in compact mode on a phone they go straight to a one-row confirmation,
 *  the note behind "Add a note". */
const NOTE_ONLY: Choice[] = ["approve", "approve_and_launch"];

const NO_TEXT: Choice[] = ["launch", "not_yet", "accept_counter", "acknowledge", "rebase", "withdraw"];

const EVIDENCE_KINDS = { pr: "Pull request", ci_run: "CI run", incident: "Incident", dashboard: "Dashboard", doc: "Doc", other: "Link" } as const;

/** Add a link to the current revision, as main's card does (POST …/evidence {kind, url, label, revision}): shown as
 *  self-reported, never verified. Kept from main for its tests: the "Add evidence" and "Add link" buttons, the
 *  url input, the 120-character label input and the "Link (https)" / "What it shows" labels. Refusals as ReviewActions:
 *  403/404/409 red, then the request is read again; anything else amber, try again. */
function AddEvidence({ ws, cr, onDone, setNotice }: { ws: string; cr: ChangeRequest; onDone: () => void; setNotice: (n: Notice | null) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<keyof typeof EVIDENCE_KINDS>("pr");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const https = /^https:\/\//i.test(url.trim());
  const typing = url.trim() !== "" && !https && !"https://".startsWith(url.trim().toLowerCase());
  if (!open)
    return (
      <div>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          Add evidence
        </button>
      </div>
    );
  return (
    <form
      data-add-evidence
      className="flex flex-col gap-3 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (busy || !https || blank(label)) return;
        setBusy(true);
        setNotice(null);
        api(`${crPath(ws, cr)}/evidence`, { body: { kind, url: url.trim(), label: label.trim(), revision: cr.revision } })
          .then(
            () => {
              setNotice({ kind: "done", text: "Recorded: your link was added, shown as self-reported." });
              setOpen(false);
              setUrl("");
              setLabel("");
              onDone();
            },
            (e: Error) => {
              const status = e instanceof ApiError ? e.status : 0;
              if (status === 403 || status === 404 || status === 409) {
                setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}${status === 409 ? " Here it is as it stands now." : " Nothing changed."}` });
                setOpen(false);
                onDone();
              } else setNotice({ kind: "retry", text: `Not recorded yet. ${sentence(e.message)} Nothing changed; try again.` });
            },
          )
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-[14px] text-(--text-2)">A link that supports this change. It is shown as self-reported: Align doesn&apos;t check it.</p>
      <Labelled label="Kind">
        <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as keyof typeof EVIDENCE_KINDS)}>
          {(Object.keys(EVIDENCE_KINDS) as (keyof typeof EVIDENCE_KINDS)[]).map((k) => (
            <option key={k} value={k}>
              {EVIDENCE_KINDS[k]}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Link (https)">
        <input className={FIELD} type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} placeholder="https://" required />
      </Labelled>
      {typing && <p className="-mt-2 text-[13px] text-(--st-declined)">Use an https:// link: Align keeps only https links.</p>}
      <Labelled label="What it shows">
        <input className={FIELD} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required />
      </Labelled>
      <p className="-mt-2 text-[13px] text-(--text-3)">At most 120 characters.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={PRIMARY} disabled={busy || !https || blank(label)}>
          Add link
        </button>
        <button type="button" className={SECONDARY} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type Notice = { kind: "done" | "refused" | "retry"; text: string };

/** The choices this person has, from the request's `can` flags (the server's answer), dominant first. */
function choicesFor(cr: ChangeRequest): Choice[] {
  const c = cr.can;
  const out: Choice[] = [];
  if (c.approve_and_launch) out.push("approve_and_launch");
  if (c.launch) out.push("launch");
  if (c.accept_counter) out.push("accept_counter");
  if (c.acknowledge && cr.condition) out.push("acknowledge");
  if (c.rebase && cr.behind) out.push("rebase");
  if (c.approve) out.push("approve");
  if (c.not_yet && cr.launch !== "not_yet") out.push("not_yet");
  if (c.counter && !cr.dependency_loop) out.push("accept_if");
  if (c.counter) out.push("counter");
  if (c.reject) out.push("reject");
  if (c.withdraw) out.push("withdraw");
  return out;
}

export type ReviewChoice = Choice;

/** `compact`: below 640px the secondary actions fold into a "More actions" menu (the dominant one stays a button).
 *  `initialChoice`: open with this choice already picked (its input, or its confirmation for a choice that needs no
 *  text), e.g. from a concept's own "Decline" or "Launch" button; ignored when this person can't make it. Remount (a new
 *  `key`) to apply a different one. `onChoice` hears every pick and cancel (null). */
export function ReviewActions({
  ws,
  cr,
  me,
  onDone,
  compact = false,
  initialChoice,
  onChoice,
}: {
  ws: string;
  cr: ChangeRequest;
  me: string;
  onDone: () => void;
  compact?: boolean;
  initialChoice?: ReviewChoice;
  onChoice?: (c: ReviewChoice | null) => void;
}) {
  const path = crPath(ws, cr);
  const next = cr.version ?? cr.goal.version + 1;
  const n = cr.goal.version;
  const TITLE: Record<Choice, string> = {
    approve_and_launch: "Approve and launch",
    approve: cr.can.approve_and_launch ? "Approve only" : "Approve",
    launch: `Launch v${next}`,
    not_yet: "Not yet",
    accept_if: "Accept if…",
    counter: "Suggest a change",
    reject: "Decline",
    accept_counter: "Accept the change",
    acknowledge: "Confirm the condition is met",
    rebase: `Update to version ${n}`,
    withdraw: "Withdraw",
  };
  const SAYS: Record<Choice, string> = {
    approve_and_launch: `Approves revision ${cr.revision}, then launches it: Align releases version ${next} of the goal.`,
    approve: `Records the approval. Approval is not launch: version ${next} is released only when someone launches it.`,
    launch: `Align releases version ${next} of the goal. Connected apps and bound sessions get it when they next ask.`,
    not_yet: `Records that it isn't launched yet. The goal stays at version ${n}.`,
    accept_if: `Keeps this change and adds a condition ${cr.requester.name} acknowledges.`,
    counter: `Sends different values back to ${cr.requester.name}, who accepts them before it can be approved.`,
    reject: `The goal stays at version ${n}. ${cr.requester.name} sees your reason.`,
    accept_counter: "Your request goes back for approval with the suggested change.",
    acknowledge: "Your statement, recorded with your name and the time. Align doesn't check it.",
    rebase: `Moves your request onto version ${n} of the goal. It waits for approval again.`,
    withdraw: "Closes your request. The goal doesn't change.",
  };

  /** The phone confirmation's one line: what the action does, nothing more. */
  const SHORT: Record<Choice, string> = {
    ...SAYS,
    approve_and_launch: `Approves revision ${cr.revision} and releases version ${next}.`,
    approve: `Approves revision ${cr.revision}. Nothing is released until someone launches it.`,
    launch: `Releases version ${next}.`,
  };
  const choices = choicesFor(cr);
  const phone = usePhone();
  const oneRow = compact && phone;
  const first = initialChoice && choices.includes(initialChoice) ? initialChoice : null;
  const [choice, setChoiceState] = useState<Choice | null>(first);
  const [step, setStep] = useState<"input" | "confirm">(first && NO_TEXT.includes(first) ? "confirm" : "input");
  // On a phone in compact mode a note-only choice shows the one-row confirmation (the note behind "Add a note"), also
  // when it was picked before the page knew it was on a phone (initialChoice): derived, never a second state.
  const shown: "input" | "confirm" = oneRow && choice && NOTE_ONLY.includes(choice) ? "confirm" : step;
  const setChoice = (c: Choice | null) => {
    setChoiceState(c);
    // Clearing a choice (Cancel, Back from a no-text confirmation, or after a decision) always returns to the choices.
    if (c === null) setStep("input");
    onChoice?.(c);
  };
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState("");
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState<ChangeFields>(() => structuredClone(cr.changes));
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const confirmRef = useRef<HTMLHeadingElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (shown === "confirm") confirmRef.current?.focus();
  }, [shown]);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const pick = (c: Choice) => {
    setChoice(c);
    setErr(null);
    setNotice(null);
    // Launch, Not yet, Accept the change, Acknowledge, Update and Withdraw need no text: straight to the confirmation.
    setStep(NO_TEXT.includes(c) || (oneRow && NOTE_ONLY.includes(c)) ? "confirm" : "input");
  };

  function invalid(): string | null {
    if (choice === "accept_if") {
      if (blank(condition)) return `Write the condition ${cr.requester.name} acknowledges.`;
      if (blank(note)) return `Write a note to ${cr.requester.name}: why you accept only on this condition.`;
    }
    if (choice === "counter") {
      if (JSON.stringify(counter) === JSON.stringify(cr.changes)) return "Change at least one value, or choose Approve instead.";
      if (blank(note)) return `Write a note to ${cr.requester.name}: what you changed and why.`;
    }
    if (choice === "reject" && blank(reason)) return `Write why you're declining. ${cr.requester.name} sees it.`;
    return null;
  }

  function request(): { action: string; body: Record<string, unknown> } | null {
    switch (choice) {
      case "approve":
      case "approve_and_launch":
        return { action: choice, body: { revision: cr.revision, note: note.trim() || null } };
      case "launch":
      case "not_yet":
      case "accept_counter":
      case "withdraw":
        return { action: choice, body: { revision: cr.revision } };
      case "accept_if":
        return { action: "counter", body: { revision: cr.revision, changes: cr.changes, note: note.trim(), condition: condition.trim() } };
      case "counter":
        return { action: "counter", body: { revision: cr.revision, changes: counter, note: note.trim() } };
      case "reject":
        return { action: "reject", body: { revision: cr.revision, reason: reason.trim() } };
      case "acknowledge":
        return { action: "acknowledge", body: { revision: cr.condition?.revision } };
      case "rebase":
        return { action: "rebase", body: { revision: cr.revision, base_version: n } };
      default:
        return null;
    }
  }

  const DONE: Record<Choice, string> = {
    approve_and_launch: `you approved revision ${cr.revision} and launched version ${next}`,
    approve: `you approved revision ${cr.revision}. It is not launched yet`,
    launch: `you launched version ${next}`,
    not_yet: "you decided not yet",
    accept_if: `you accepted it if ${cr.requester.name} acknowledges your condition`,
    counter: `you suggested a change to ${cr.requester.name}`,
    reject: "you declined this request",
    accept_counter: "you accepted the suggested change. It waits for approval again",
    acknowledge: "you acknowledged the condition",
    rebase: `you updated your request to version ${n}. It waits for approval again`,
    withdraw: "you withdrew your request",
  };

  const send = async () => {
    const req = request();
    if (!req || sending || !choice) return;
    setSending(true);
    try {
      // Read it again first: if it changed since it was shown, nothing is sent (the server checks again on the write).
      const now = await api<ChangeRequest>(path);
      if (now.revision !== cr.revision || now.state !== cr.state || now.launch !== cr.launch) {
        setNotice({ kind: "refused", text: `Not recorded. ${now.state !== cr.state || now.launch !== cr.launch ? now.state_note : `It changed after you opened it: it is now at revision ${now.revision}.`} Nothing was sent. Read it again and decide again.` });
        setChoice(null);
        onDone();
        return;
      }
      await api(`${path}/${req.action}`, { body: req.body });
      setNotice({ kind: "done", text: `Recorded: ${DONE[choice]}.` });
      setChoice(null);
      onDone();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 403 || status === 404 || status === 409) {
        setNotice({ kind: "refused", text: `Not recorded. ${sentence((e as Error).message)}${status === 409 ? " Here it is as it stands now." : " Nothing changed."}` });
        setChoice(null);
        onDone();
      } else {
        setNotice({ kind: "retry", text: `Not recorded yet. ${sentence((e as Error).message)} Nothing changed; try again.` });
      }
    } finally {
      setSending(false);
    }
  };

  // Nobody's move is this person's: say whose it is.
  if (!choices.length) {
    const waits = changeWaits(cr);
    const launch = launchWaits(cr);
    const line = waits
      ? `Not yours: ${people(waits.waiting_on, me)} can ${waits.next === "decide" ? "decide on it" : waits.next === "rebase" ? "update it" : waits.next === "accept_counter" ? "accept the suggested change" : "suggest a change or decline it"}.`
      : launch
        ? `Not yours: ${people(cr.dependency_not_visible ? launch.launchers.filter((p) => p.id !== me) : launch.launchers, me)} can launch it.`
        : null;
    return (
      <div className="flex flex-col gap-2">
        {notice && <NoticeLine n={notice} r={noticeRef} />}
        {line && (
          <p data-not-yours className="text-[14px] text-(--text-2)">
            {line}
          </p>
        )}
        {cr.dependency_not_visible && <p className="text-[14px] text-(--text-2)">You can&apos;t act on this. {cr.dependency_not_visible}</p>}
      </div>
    );
  }

  const [dominant, ...rest] = choices;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-review-actions={cr.id}>
      {notice && <NoticeLine n={notice} r={noticeRef} />}
      {shown !== "confirm" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-decision={TITLE[dominant]} aria-pressed={choice === dominant} className={PRIMARY} onClick={() => pick(dominant)}>
            {TITLE[dominant]}
          </button>
          {rest.map((c) => (
            <button key={c} type="button" data-decision={TITLE[c]} aria-pressed={choice === c} className={`${SECONDARY} ${compact ? "max-sm:hidden" : ""}`} onClick={() => pick(c)}>
              {TITLE[c]}
            </button>
          ))}
          {compact && rest.length > 0 && (
            // Phones only: the same choices in a menu, so the dominant action stands alone on a narrow drawer.
            <details className="relative sm:hidden" data-more-actions>
              <summary className={`${SECONDARY} list-none [&::-webkit-details-marker]:hidden`}>More actions</summary>
              <div role="menu" aria-label="More actions" className="absolute left-0 z-10 mt-1 flex min-w-[12rem] flex-col gap-1 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-overlay) p-1">
                {rest.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    data-decision={TITLE[c]}
                    className="flex min-h-[44px] items-center rounded-(--radius-s) px-3 text-left text-[14px] text-(--text-1) hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus)"
                    onClick={(e) => {
                      (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                      pick(c);
                    }}
                  >
                    {TITLE[c]}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {choice && shown === "input" && (
        <div data-decision-input={choice} className="flex flex-col gap-3 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-3">
          <p className="text-[14px] text-(--text-2)">{SAYS[choice]}</p>
          {(choice === "approve" || choice === "approve_and_launch") && (
            <Labelled label="Note (optional)">
              <textarea className={FIELD} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Labelled>
          )}
          {choice === "accept_if" && (
            <>
              <Labelled label={`Accept if (${cr.requester.name} acknowledges this)`}>
                <textarea className={FIELD} rows={2} maxLength={2000} value={condition} onChange={(e) => setCondition(e.target.value)} />
              </Labelled>
              <Labelled label={`Note to ${cr.requester.name}`}>
                <textarea className={FIELD} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </Labelled>
            </>
          )}
          {choice === "counter" && <CounterFields value={counter} onChange={setCounter} note={note} setNote={setNote} requester={cr.requester.name} />}
          {choice === "reject" && (
            <Labelled label={`Why you're declining (${cr.requester.name} sees it)`}>
              <textarea className={FIELD} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Labelled>
          )}
          {err && (
            <p role="alert" className="text-[14px] text-(--st-declined)">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY}
              onClick={() => {
                const v = invalid();
                setErr(v);
                if (!v) setStep("confirm");
              }}
            >
              Review this decision
            </button>
            <button type="button" className={SECONDARY} onClick={() => setChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {choice && shown === "confirm" && (
        <div role="region" aria-labelledby={`confirm-${cr.id}`} data-confirm={choice} className="flex flex-col gap-2 rounded-(--radius-m) border border-(--accent) bg-(--bg-raised) p-3">
          <h4 id={`confirm-${cr.id}`} ref={confirmRef} tabIndex={-1} className="text-[15px] font-semibold text-(--text-1) outline-none">
            {TITLE[choice]}: {cr.goal.title}
          </h4>
          {oneRow ? (
            // One short consequence line at every width: approval and launch stay distinguishable in words.
            <p data-consequence className="text-[14px] text-(--text-2)">{SHORT[choice]}</p>
          ) : (
            <p className="text-[14px] text-(--text-2)">{SAYS[choice]}</p>
          )}
          {!oneRow && (choice === "approve" || choice === "approve_and_launch") && cr.evidence_count === 0 && <p className="text-[14px] text-(--text-2)">No evidence: the record will say it was approved without evidence.</p>}
          {oneRow && NOTE_ONLY.includes(choice) && (
            <details data-add-note className="text-[14px]" open={note.trim() !== "" || undefined}>
              <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-(--accent-text) [&::-webkit-details-marker]:hidden">Add a note</summary>
              <textarea aria-label="Note (optional)" className={FIELD} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </details>
          )}
          {choice === "reject" && <p className="text-[14px] text-(--text-1)">Your reason: {reason.trim()}</p>}
          {choice === "accept_if" && <p className="text-[14px] text-(--text-1)">Accept if: {condition.trim()}</p>}
          {!oneRow && <p className="text-[13px] text-(--text-3)">Align reads the request again before sending. If it changed meanwhile, nothing is sent.</p>}
          <div className={`flex gap-2 ${oneRow ? "flex-nowrap [&>button]:min-w-0 [&>button:first-child]:flex-1" : "flex-wrap"}`}>
            <button type="button" className={PRIMARY} disabled={sending} onClick={() => void send()}>
              Confirm: {TITLE[choice]}
            </button>
            <button type="button" className={SECONDARY} disabled={sending} onClick={() => (NO_TEXT.includes(choice) || oneRow ? setChoice(null) : setStep("input"))}>
              {oneRow ? "Cancel" : "Back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NoticeLine({ n, r }: { n: Notice; r: React.RefObject<HTMLParagraphElement | null> }) {
  const tone = n.kind === "done" ? "border-(--line-strong) bg-(--bg-inset) text-(--text-1)" : n.kind === "retry" ? "border-(--st-retry) bg-(--st-retry-soft) text-(--text-1)" : "border-(--st-declined) bg-(--st-declined-soft) text-(--text-1)";
  return (
    <p ref={r} tabIndex={-1} role={n.kind === "done" ? "status" : "alert"} data-notice={n.kind} className={`rounded-(--radius-s) border px-3 py-2 text-[14px] [overflow-wrap:anywhere] outline-none ${tone}`}>
      {n.text}
    </p>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-(--text-2)">
      {label}
      {children}
    </label>
  );
}

/** Suggest a change, compactly: the values this request changes (title, measures' text and targets) as editable fields.
 *  Limits and dependencies keep what the request asks; the goal page's full form changes those. */
function CounterFields({ value, onChange, note, setNote, requester }: { value: ChangeFields; onChange: (v: ChangeFields) => void; note: string; setNote: (s: string) => void; requester: string }) {
  const measures = value.measures as Goal["measures"] | undefined;
  return (
    <div className="flex flex-col gap-3">
      {value.title !== undefined && (
        <Labelled label="Title">
          <input className={FIELD} value={value.title} maxLength={200} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </Labelled>
      )}
      {measures?.map((m, i) => (
        <div key={m.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Labelled label={`Measure ${i + 1}`}>
            <input className={FIELD} value={m.text} maxLength={300} onChange={(e) => onChange({ ...value, measures: measures.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)) })} />
          </Labelled>
          <Labelled label="Target">
            <input className={FIELD} value={m.target ?? ""} maxLength={100} onChange={(e) => onChange({ ...value, measures: measures.map((x) => (x.id === m.id ? { ...x, target: e.target.value || null } : x)) })} />
          </Labelled>
        </div>
      ))}
      {value.title === undefined && !measures && <p className="text-[14px] text-(--text-2)">This request changes limits, status or dependencies: suggest a change to those from the goal page.</p>}
      <Labelled label={`Note to ${requester}`}>
        <textarea className={FIELD} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Labelled>
    </div>
  );
}
