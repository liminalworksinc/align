"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ApiError, api, sentence } from "../kit";
import type { ChangeFields, ChangeRequest, Goal } from "../types";
import { changeWaits, launchWaits } from "@/lib/v2/home-core.mts";
import { Compare } from "./compare";
import { DecisionLinks } from "./decision-links";
import { EvidenceLabel } from "./evidence-label";
import { deliveryStatement, hasEvidence } from "./evidence-facts.mts";
import { EvidenceSummary, useDelivery } from "./evidence-summary";
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
// data-cr / data-cr-view. Wording: a launch makes a version the launched one; never what agents "are on" or "released".

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
  const [evNotice, setEvNotice] = useOneNotice(cr.id, "body");
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
  // Read once: the state line's delivery statement and the evidence summary both use it.
  const delivery = useDelivery(ws, cr);
  // The columns are named by the request's state: what it asks while undecided, what was decided once it is.
  const undecided = cr.state === "pending" || cr.state === "countered";
  const currentLabel = undecided ? `Current (v${n})` : `Version ${n}`;
  const proposedLabel =
    cr.state === "approved"
      ? cr.launch === "launched" && cr.version
        ? `Launched v${cr.version}`
        : "Approved"
      : cr.state === "countered"
        ? `Suggested (revision ${cr.revision})`
        : cr.state === "rejected"
          ? "Declined"
          : cr.state === "withdrawn"
            ? "Withdrawn"
            : cr.state === "superseded"
              ? "Superseded"
              : "Proposed";
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
      <DecisionLinks ws={ws} goalId={cr.goal.id} crId={cr.id} here="review" className="-mt-2" />

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

      <Compare before={cr.diff.before} after={cr.diff.after} hidden={cr.diff.hidden_depends_on ?? null} beforeLabel={currentLabel} afterLabel={proposedLabel} titleOf={titleOf} />
      {cr.behind && <p className="text-[14px] text-(--st-pending)">The goal moved on to version {cr.goal.version} since this was asked against version {n}.</p>}

      <section aria-label="Evidence" className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-(--text-2)">Evidence</p>
        {delivery.launched && delivery.value === undefined ? (
          <p className="text-[13px] text-(--text-3)">Reading evidence…</p>
        ) : (
          <EvidenceSummary ws={ws} cr={cr} variant="full" value={delivery.launched ? delivery.value : null} sayUnread={false} />
        )}
        {!hasEvidence(cr) && (
          <p className="text-[14px] text-(--text-2)">
            {cr.state === "approved"
              ? cr.approved_without_evidence
                ? "Approved without evidence."
                : `No evidence attached${cr.revision > 1 ? ` to revision ${cr.revision}` : ""}.`
              : cr.state === "pending" || cr.state === "countered"
                ? `No evidence attached${cr.revision > 1 ? ` to revision ${cr.revision}` : ""}. Approving without evidence is recorded as such.`
                : `No evidence attached${cr.revision > 1 ? ` to revision ${cr.revision}` : ""}.`}
          </p>
        )}
        {evidence.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {evidence.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                {e.reported_as === "agent-reported" ? <EvidenceLabel kind="reported" size="s" detail="connected app" /> : <EvidenceLabel kind="self" size="s" />}
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--text-1) underline decoration-(--line-strong) underline-offset-2 hover:decoration-(--text-1) [overflow-wrap:anywhere]">
                  {e.label || e.url}
                </a>
                <span className="text-[13px] text-(--text-3)">
                  {who(e.added_by, me)}, revision {e.revision}
                </span>
              </li>
            ))}
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
        {!waits && launch && `Approval is not launch: version ${cr.version ?? cr.goal.version + 1} becomes the launched version only when ${people(launch.launchers, me)} launch${launch.launchers.length === 1 && launch.launchers[0].id !== me ? "es" : ""} it.`}
        {!waits && !launch && cr.state === "approved" && cr.launch === "launched" && `Launched by ${who(cr.launch_decided_by, me)}, ${at(cr.launch_decided_at)}: version ${cr.version} is now the launched version.${delivery.value !== undefined ? ` ${deliveryStatement(cr.version!, delivery.value)}` : ""}`}
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

// One result notice at a time per request: the body's (Add evidence) and the actions' (a decision) live in two
// components a consumer mounts separately, so a new notice in one clears the other's through a window event.
const NOTICE_EVENT = "align-review-notice";
function useOneNotice(crId: string, from: "body" | "actions") {
  const [notice, set] = useState<Notice | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ cr: string; from: string }>).detail;
      if (d.cr === crId && d.from !== from) set(null);
    };
    window.addEventListener(NOTICE_EVENT, on);
    return () => window.removeEventListener(NOTICE_EVENT, on);
  }, [crId, from]);
  const show = useCallback(
    (n: Notice | null) => {
      set(n);
      if (n) window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: { cr: crId, from } }));
    },
    [crId, from],
  );
  return [notice, show] as const;
}

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

/** The POST each choice makes (…/change-requests/<id>/<action>): Accept if is a counter with a condition. */
const ACTION: Record<Choice, string> = {
  approve_and_launch: "approve_and_launch",
  approve: "approve",
  launch: "launch",
  not_yet: "not_yet",
  accept_if: "counter",
  counter: "counter",
  reject: "reject",
  accept_counter: "accept_counter",
  acknowledge: "acknowledge",
  rebase: "rebase",
  withdraw: "withdraw",
};

/** The body for a choice that needs no words from the person; null for one that does (Accept if, counter, decline). */
export function defaultBody(cr: ChangeRequest, choice: Choice): Record<string, unknown> | null {
  switch (choice) {
    case "approve":
    case "approve_and_launch":
      return { revision: cr.revision, note: null };
    case "launch":
    case "not_yet":
    case "accept_counter":
    case "withdraw":
      return { revision: cr.revision };
    case "acknowledge":
      return { revision: cr.condition?.revision };
    case "rebase":
      return { revision: cr.revision, base_version: cr.goal.version };
    default:
      return null;
  }
}

/** What a recorded choice says, after "Recorded: " (empty: just "Recorded."). */
function doneWords(cr: ChangeRequest, choice: Choice): string {
  switch (choice) {
    // A launch's own line ("Launched by you, <time>: version N is now the launched version.") says the launch with who
    // and when, so the notice doesn't restate it.
    case "approve_and_launch":
    // One job each: this says what was recorded; the waits line under the request says approval is not launch, and who
    // launches, once (it is there on a cold open too).
    case "approve":
      return `you approved revision ${cr.revision}`;
    case "launch":
      return "";
    case "not_yet":
      return "you decided not yet";
    case "accept_if":
      return `you accepted it if ${cr.requester.name} acknowledges your condition`;
    case "counter":
      return `you suggested a change to ${cr.requester.name}`;
    case "reject":
      return "you declined this request";
    case "accept_counter":
      return "you accepted the suggested change. It waits for approval again";
    case "acknowledge":
      return "you acknowledged the condition";
    case "rebase":
      return `you updated your request to version ${cr.goal.version}. It waits for approval again`;
    case "withdraw":
      return "you withdrew your request";
  }
}

/** The outcome of sending a choice: the notice to show, and whether the request should be read again (anything but a
 *  retry: a decision, or a refusal that says how it stands now). */
export interface SendResult {
  kind: "done" | "refused" | "retry";
  text: string;
  reread: boolean;
}

/**
 * The one way a decision is sent, for the review and for any shortcut to it (the Desk's one-click Approve only):
 *  1. Read the request again. If its revision, state, launch decision or its goal's version changed since `cr` was read,
 *     nothing is sent (a confirmation can name a version a moved goal makes stale): refused, saying what changed.
 *  2. `requireEvidence`: the caller offered this only because the request had evidence; if the re-read has none on its
 *     current revision (a link removed in another session meanwhile), nothing is sent.
 *  3. POST …/<action> with `body` (default: defaultBody, for the choices that need no words; throws for one that does).
 *  4. 403/404/409: refused, in the server's words (409 adds "Here it is as it stands now."). Anything else (network, 429,
 *     5xx): retry, nothing changed. The server checks every rule again on the write; this never decides for it.
 */
export async function sendChoice(ws: string, cr: ChangeRequest, choice: Choice, body?: Record<string, unknown> | null, opts: { requireEvidence?: boolean } = {}): Promise<SendResult> {
  const b = body ?? defaultBody(cr, choice);
  if (!b) throw new Error(`sendChoice: "${choice}" needs a body (a note, a condition, changes or a reason)`);
  const path = crPath(ws, cr);
  try {
    const now = await api<ChangeRequest>(path);
    if (now.revision !== cr.revision || now.state !== cr.state || now.launch !== cr.launch || now.goal.version !== cr.goal.version) {
      const what =
        now.state !== cr.state || now.launch !== cr.launch
          ? now.state_note
          : now.revision !== cr.revision
            ? `It changed after you opened it: it is now at revision ${now.revision}.`
            : `The goal moved to version ${now.goal.version} after you opened it.`;
      return { kind: "refused", text: `Not recorded. ${what} Nothing was sent. Read it again and decide again.`, reread: true };
    }
    if (opts.requireEvidence && !hasEvidence(now))
      return { kind: "refused", text: "Not recorded. Its evidence was removed after you opened it. Nothing was sent. Open it to decide.", reread: true };
    await api(`${path}/${ACTION[choice]}`, { body: b });
    const words = doneWords(cr, choice);
    return { kind: "done", text: words ? `Recorded: ${words}.` : "Recorded.", reread: true };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    if (status === 403 || status === 404 || status === 409)
      return { kind: "refused", text: `Not recorded. ${sentence((e as Error).message)}${status === 409 ? " Here it is as it stands now." : " Nothing changed."}`, reread: true };
    return { kind: "retry", text: `Not recorded yet. ${sentence((e as Error).message)} Nothing changed; try again.`, reread: false };
  }
}

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
    approve_and_launch: `Approves revision ${cr.revision}, then launches it: version ${next} becomes the goal's launched version.`,
    approve: `Records the approval. Approval is not launch: version ${next} becomes the launched version only when someone launches it.`,
    launch: `Version ${next} becomes the goal's launched version. Connected apps and bound sessions can get it the next time they read the goal.`,
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
    approve_and_launch: `Approves revision ${cr.revision} and launches version ${next}.`,
    approve: `Approves revision ${cr.revision}. Launching it is a separate step.`,
    launch: `Launches version ${next}.`,
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
  const [notice, setNotice] = useOneNotice(cr.id, "actions");
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

  function request(): Record<string, unknown> | null {
    switch (choice) {
      case "approve":
      case "approve_and_launch":
        return { revision: cr.revision, note: note.trim() || null };
      case "accept_if":
        return { revision: cr.revision, changes: cr.changes, note: note.trim(), condition: condition.trim() };
      case "counter":
        return { revision: cr.revision, changes: counter, note: note.trim() };
      case "reject":
        return { revision: cr.revision, reason: reason.trim() };
      case null:
        return null;
      default:
        return defaultBody(cr, choice);
    }
  }


  const send = async () => {
    const body = request();
    if (!body || sending || !choice) return;
    setSending(true);
    try {
      const r = await sendChoice(ws, cr, choice, body);
      setNotice({ kind: r.kind, text: r.text });
      if (r.reread) {
        setChoice(null);
        onDone();
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
        <div role="region" aria-labelledby={`confirm-${cr.id}`} data-confirm={choice} className="flex flex-col gap-2 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-raised) p-3">
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
              <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-(--text-1) underline decoration-(--line-strong) underline-offset-2 [&::-webkit-details-marker]:hidden">Add a note</summary>
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
