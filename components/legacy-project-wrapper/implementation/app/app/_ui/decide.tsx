"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, Btn, Err, Field, Loading, Note, Pill, TextArea, useAction, useApi, when } from "./kit";
import { AddEvidence, ChangesForm, ConditionBox, CR_STATE_WORDS, crTone, EvidenceItem, FIELD_LABEL, FieldValue, NoticeBox, Revisions, SnapshotBox, STATUS_WORD, type Notice } from "./crparts";
import { LIMIT_WORDS } from "./limits";
import type { ChangeFields, ChangeRequest, Goal, Limit } from "./types";

// An open change request (pending or countered): understand it, then decide (main #43 and #49, on v2).
// Order on screen: what is approved now beside what is proposed, with its version, requester, who decides and state ->
// what would change, read from the request's own text and labelled so, beside the evidence links (self- or
// agent-reported, never verified) and Align's snapshot -> "Your decision": only the decisions the server's `can` flags
// allow this person, none preselected; choosing one reveals only its input and moves focus there -> a confirmation of
// who acts, on which revision, the decision, what was entered, the expected transition and that approval is not launch
// -> the same POST as before. Before sending, the request is read again: if its revision or state changed, nothing is
// sent and a focused "Not recorded" says so; a refusal (409) shows the server's reason the same way. The server still
// checks every write. A decided request is its record (changes.tsx); launch keeps its own controls there.

type Person = { id: string; name: string };
type Decision = "approve" | "approve_and_launch" | "accept_if" | "counter" | "reject" | "accept_counter" | "acknowledge" | "withdraw";

/** The decisions this person may take on this request now, from its `can` flags (and nothing else), in screen order. */
export function decisionsFor(cr: ChangeRequest): Decision[] {
  const c = cr.can;
  const out: Decision[] = [];
  if (c.approve) out.push("approve");
  if (c.approve_and_launch) out.push("approve_and_launch");
  if (c.counter) out.push("accept_if", "counter");
  if (c.reject) out.push("reject");
  if (c.accept_counter) out.push("accept_counter");
  if (c.acknowledge && cr.condition) out.push("acknowledge");
  if (c.withdraw) out.push("withdraw");
  return out;
}

const TEXT_MAX = 2000;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

const quote = (s: string) => `“${s}”`;
const measureWords = (m: { text: string; target: string | null }) => `${quote(m.text)}${m.target ? ` (target: ${m.target})` : ""}`;

/** What the request says would change, field by field, in words. Read from the request, never from evidence. */
export function changeLines(cr: ChangeRequest, titles: Map<string, string>): string[] {
  const { before, after } = cr.diff;
  const out: string[] = [];
  if (after.title !== undefined && after.title !== before.title) out.push(`The goal ${quote(before.title ?? "")} would be renamed ${quote(after.title)}.`);
  if (after.measures) {
    const b = before.measures ?? [];
    const a = after.measures;
    const n = out.length;
    for (const m of a) {
      const was = b.find((x) => x.id === m.id);
      if (!was) out.push(`Adds the measure ${measureWords(m)}.`);
      else if (was.text === m.text && (was.target ?? null) !== (m.target ?? null)) out.push(`Changes the target of ${quote(m.text)} from ${was.target ?? "none"} to ${m.target ?? "none"}.`);
      else if (was.text !== m.text || (was.target ?? null) !== (m.target ?? null)) out.push(`Changes the measure ${measureWords(was)} to ${measureWords(m)}.`);
    }
    for (const m of b) if (!a.some((x) => x.id === m.id)) out.push(`Removes the measure ${measureWords(m)}.`);
    if (out.length === n) out.push("Reorders the measures.");
  }
  if (after.limits) {
    const b = before.limits ?? [];
    const a = after.limits;
    const words = (l: Limit) => `${LIMIT_WORDS[l.type]}: ${quote(l.text)}`;
    const n = out.length;
    for (const l of a) {
      const was = b.find((x) => x.id === l.id);
      if (!was) out.push(`Adds the limit ${words(l)}.`);
      else if (was.text !== l.text || was.type !== l.type) out.push(`Changes the limit ${words(was)} to ${words(l)}.`);
    }
    for (const l of b) if (!a.some((x) => x.id === l.id)) out.push(`Removes the limit ${words(l)}.`);
    if (out.length === n) out.push("Reorders the limits.");
  }
  if (after.status !== undefined && after.status !== before.status) out.push(`Status would change from ${STATUS_WORD[before.status ?? "active"]} to ${STATUS_WORD[after.status]}.`);
  if (after.depends_on) {
    const b = before.depends_on ?? [];
    const name = (id: string) => quote(titles.get(id) ?? "a goal");
    const added = after.depends_on.filter((id) => !b.includes(id));
    const removed = b.filter((id) => !after.depends_on!.includes(id));
    if (added.length) out.push(`Would depend on ${added.map(name).join(", ")}.`);
    if (removed.length) out.push(`Would no longer depend on ${removed.map(name).join(", ")}.`);
  }
  return out;
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="al-lbl">{k}</dt>
      <dd className="text-[15px] text-zinc-900">{children}</dd>
    </div>
  );
}

function ConfirmRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <dt className="al-lbl pt-0.5">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** One choice: a toggle button, never preselected. */
function Choice({ on, title, sub, onPick }: { on: boolean; title: string; sub: string; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-decision={title}
      onClick={onPick}
      className={`flex min-h-[44px] max-w-full flex-col items-start rounded-[10px] border px-3 py-2 text-left ${focusRing} ${on ? "border-violet-700 bg-violet-50" : "border-zinc-300 bg-zinc-50 hover:bg-zinc-100"}`}
    >
      <span className="text-[15px] font-semibold text-zinc-900">{title}</span>
      <span className="text-[13px] text-zinc-600">{sub}</span>
    </button>
  );
}

/** The counter's input: the request's fields pre-filled on the goal as it is now, a required note and an optional
 *  "Accept if…" condition. Its button goes to the confirmation; nothing is sent from here. */
function CounterInput({ ws, cr, focus, onReview }: { ws: string; cr: ChangeRequest; focus: boolean; onReview: (changes: ChangeFields, note: string, condition: string) => void }) {
  const g = useApi<{ goal: Goal }>(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}`);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (g.data && focus) box.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [g.data, focus]);
  if (g.loading) return <Loading />;
  if (!g.data) return <Err>{g.error}</Err>;
  return (
    <div ref={box}>
      <p className="mb-2 text-[15px] text-zinc-700">Edit what should change. {cr.requester.name} can accept your suggestion, and then it can be approved.</p>
      <ChangesForm
        ws={ws}
        goal={g.data.goal}
        start={cr.changes}
        keep={Object.keys(cr.changes) as (keyof ChangeFields)[]}
        noteLabel="Note"
        noteRequired
        withCondition
        sendLabel="Review this decision"
        busy={false}
        onSend={onReview}
      />
    </div>
  );
}

export function OpenRequest({
  ws,
  cr,
  me,
  showGoal,
  titles,
  onDone,
  notice,
  setNotice,
}: {
  ws: string;
  cr: ChangeRequest;
  me: string;
  showGoal?: boolean;
  titles: Map<string, string>;
  onDone: () => void;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
}) {
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  const act = useAction();
  const mine = cr.requester.id === me;
  const decisions = decisionsFor(cr);
  const n = cr.goal.version;
  const next = n + 1;
  const ask = mine ? "you" : cr.requester.name;
  const said = (p: Person | null) => (p ? (p.id === me ? "you" : p.name) : "someone");
  const names = (ps: Person[]) => ps.map((a) => (a.id === me ? "you" : a.name)).join(" or ");
  const current = cr.revisions.find((r) => r.revision === cr.revision);
  const earlier = cr.revisions.filter((r) => r.revision !== cr.revision && r.evidence.length > 0);
  const counterNote = current && current.author.id !== cr.requester.id && current.note ? current : null;
  const noEvidence = cr.evidence_count === 0;
  const fields = (Object.keys(FIELD_LABEL) as (keyof ChangeFields)[]).filter((k) => k in cr.diff.after || k in cr.diff.before);
  const lines = changeLines(cr, titles);
  // Who acts: the requester, or someone in the approval set (only they get decisions).
  const meName = mine ? cr.requester.name : (cr.approvers.find((a) => a.id === me)?.name ?? "you");
  const myPart = mine ? "the requester" : cr.approvers.some((a) => a.id === me) ? "in this goal's approval set" : "";

  const [choice, setChoice] = useState<Decision | null>(null);
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [condition, setCondition] = useState("");
  const [ifNote, setIfNote] = useState("");
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState<{ changes: ChangeFields; note: string; condition: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const confirmHead = useRef<HTMLHeadingElement | null>(null);
  const errRef = useRef<HTMLParagraphElement | null>(null);
  const reviewBtn = useRef<HTMLButtonElement | null>(null);

  // Focus follows the step: the revealed input after a choice (the counter's form focuses itself once loaded), the
  // confirmation's heading, and back.
  useEffect(() => {
    if (!choice) return;
    if (step === "confirm") confirmHead.current?.focus();
    else if (choice !== "counter") (panel.current?.querySelector<HTMLElement>("[data-first]") ?? reviewBtn.current)?.focus();
  }, [choice, step]);
  useEffect(() => {
    if (err) errRef.current?.focus();
  }, [err]);

  const TITLE: Record<Decision, string> = {
    approve: "Approve",
    approve_and_launch: "Approve and launch",
    accept_if: "Accept if…",
    counter: "Suggest a change",
    reject: "Decline",
    accept_counter: "Accept the change",
    acknowledge: "Confirm the condition is met",
    withdraw: "Withdraw",
  };
  const SUB: Record<Decision, string> = {
    approve: `Records the decision. Agents stay on version ${n} until someone launches version ${next}.`,
    approve_and_launch: `Approves, then launches version ${next} to agents now.`,
    accept_if: `Keep this change and add a condition ${cr.requester.name} acknowledges.`,
    counter: `Propose different fields. ${cr.requester.name} accepts it, then it can be approved.`,
    reject: `The goal stays at version ${n}. Needs a reason.`,
    accept_counter: "Your request goes back for approval with the suggested change.",
    acknowledge: "Your statement, recorded with your name and the time. Align doesn't check it.",
    withdraw: "Close your request. The goal doesn't change.",
  };

  const pick = (d: Decision) => {
    setChoice(d);
    setStep("input");
    setErr(null);
    setNotice(null);
  };

  function validate(): string | null {
    if (choice === "accept_if") {
      if (!condition.trim()) return `Write the condition ${cr.requester.name} acknowledges.`;
      if (!ifNote.trim()) return `Write a note to ${cr.requester.name}: why you accept only on this condition.`;
    }
    if (choice === "reject" && !reason.trim()) return `Write why you're declining. ${cr.requester.name} sees it.`;
    return null;
  }

  const review = () => {
    const v = validate();
    setErr(null);
    if (v) {
      queueMicrotask(() => setErr(v)); // re-set, so focus moves to it even when the same message repeats
      return;
    }
    setStep("confirm");
  };

  function request(): { action: string; body: Record<string, unknown> } | null {
    switch (choice) {
      case "approve":
      case "approve_and_launch":
        return { action: choice, body: { revision: cr.revision, note: note.trim() || null } };
      case "accept_if":
        return { action: "counter", body: { revision: cr.revision, changes: cr.changes, note: ifNote.trim(), condition: condition.trim() } };
      case "counter":
        return counter ? { action: "counter", body: { revision: cr.revision, changes: counter.changes, note: counter.note, ...(counter.condition ? { condition: counter.condition } : {}) } } : null;
      case "reject":
        return { action: "reject", body: { revision: cr.revision, reason: reason.trim() } };
      case "accept_counter":
      case "withdraw":
        return { action: choice, body: { revision: cr.revision } };
      case "acknowledge":
        return { action: "acknowledge", body: { revision: cr.condition?.revision } };
      default:
        return null;
    }
  }

  const doneLine = (): string => {
    switch (choice) {
      case "approve":
        return `you approved revision ${cr.revision} as version ${next}. Agents stay on version ${n} until someone launches it`;
      case "approve_and_launch":
        return `you approved revision ${cr.revision} and launched it as version ${next}`;
      case "accept_if":
        return `you accepted revision ${cr.revision} if ${cr.requester.name} acknowledges your condition`;
      case "counter":
        return `you suggested a change to ${cr.requester.name}`;
      case "reject":
        return "you declined this request";
      case "accept_counter":
        return "you accepted the suggested change. It waits for approval again";
      case "acknowledge":
        return "you acknowledged the condition";
      case "withdraw":
        return "you withdrew your request";
      default:
        return "";
    }
  };

  const submit = async () => {
    const req = request();
    if (!req || sending) return;
    setSending(true);
    try {
      // Freshness: is the revision on screen still the one the server holds? (The server checks again on the write.)
      const now = await api<ChangeRequest>(path).catch(() => null);
      if (now && (now.revision !== cr.revision || now.state !== cr.state)) {
        setNotice({
          kind: "stale",
          text: `Not recorded. This request changed after you opened it: it is now ${quote(CR_STATE_WORDS[now.state])} at revision ${now.revision}. Nothing was sent. Read it again and decide again.`,
        });
        onDone();
        return;
      }
      await api(`${path}/${req.action}`, { body: req.body });
      setNotice({ kind: "done", text: `Recorded: ${doneLine()}.` });
      onDone();
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409;
      setNotice({ kind: "refused", text: `Not recorded. ${(e as Error).message}${conflict ? "" : " Nothing changed."}` });
      if (conflict) onDone(); // the request moved on: show it as it is now
    } finally {
      setSending(false);
    }
  };

  const stateWord = CR_STATE_WORDS[cr.state];
  const transition = (): string => {
    switch (choice) {
      case "approve":
        return `${stateWord} → approved. Version ${next} is recorded as approved; the goal and its agents stay on version ${n} until someone launches it.`;
      case "approve_and_launch":
        return `${stateWord} → approved, then launched: the goal becomes version ${next}, and agents get it at their next turn.`;
      case "accept_if":
      case "counter":
        return `${stateWord} → ${CR_STATE_WORDS.countered} (revision ${cr.revision + 1}). ${cr.requester.name} accepts it, then it can be approved.`;
      case "reject":
        return `${stateWord} → rejected. The goal stays at version ${n}, and ${cr.requester.name} sees your reason.`;
      case "accept_counter":
        return `${stateWord} → ${CR_STATE_WORDS.pending}, with the suggested change.`;
      case "acknowledge":
        return "The request stays as it is. The condition shows as acknowledged by you, with the time.";
      case "withdraw":
        return `${stateWord} → withdrawn. The goal doesn't change.`;
      default:
        return "";
    }
  };
  const launchLine = (): string => {
    switch (choice) {
      case "approve":
        return `Approval is not launch. Agents stay on version ${n} until someone who can launch it does.`;
      case "approve_and_launch":
        return `Approval is not launch; this decision does both. It approves, then launches version ${next} to agents.`;
      case "reject":
      case "withdraw":
        return `Nothing goes to launch. The goal stays at version ${n}.`;
      default:
        return "Approval is not launch, and this is neither: nothing reaches agents.";
    }
  };
  const enteredRows = (): [string, ReactNode][] => {
    const rows: [string, ReactNode][] = [];
    if ((choice === "approve" || choice === "approve_and_launch") && noEvidence) rows.push(["Evidence", "None. The decision record and the audit log will say it was approved without evidence."]);
    if ((choice === "approve" || choice === "approve_and_launch") && note.trim()) rows.push(["Your note", note.trim()]);
    if (choice === "accept_if") {
      rows.push(["Accept if", condition.trim()]);
      rows.push(["Your note", ifNote.trim()]);
    }
    if (choice === "counter" && counter) {
      for (const k of (Object.keys(FIELD_LABEL) as (keyof ChangeFields)[]).filter((x) => x in counter.changes))
        rows.push([`${FIELD_LABEL[k]} would be`, <FieldValue key={k} k={k} v={counter.changes[k]} titles={titles} />]);
      rows.push(["Your note", counter.note]);
      if (counter.condition) rows.push(["Accept if", counter.condition]);
    }
    if (choice === "reject") rows.push(["Your reason", reason.trim()]);
    if (!rows.length) rows.push(["What you entered", "Nothing. This decision needs no text."]);
    return rows;
  };

  const waitingLine =
    cr.state === "countered"
      ? `Waiting on ${ask} to accept the suggested change.`
      : cr.behind
        ? `Waiting on ${ask} to update it to version ${n}.`
        : cr.approvers.length
          ? `Waiting on ${names(cr.approvers)} to decide.`
          : "Nobody can approve this yet.";

  return (
    <div className="mb-4 min-w-0 rounded-[12px] border border-zinc-200 p-4" data-cr={cr.id} data-cr-view="open">
      {notice && <NoticeBox notice={notice} />}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[16px] text-zinc-900">
          {mine ? "You" : cr.requester.name} proposed a change
          {showGoal && (
            <>
              {" "}
              to{" "}
              <Link href={`/app/w/${ws}/goals/${cr.goal.id}`} className="underline">
                {cr.goal.title}
              </Link>
            </>
          )}
        </span>
        <Pill tone={crTone(cr.state)}>{stateWord}</Pill>
      </div>

      {/* 1. Approved now beside proposed (stacked on a phone), with the facts a decision needs. */}
      <section aria-label="Approved now and proposed" className="mt-3" data-compare>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-[10px] bg-zinc-50 p-3" data-side="approved">
            <p className="al-lbl">Approved now · version {cr.base_version}</p>
            {fields.map((k) => (
              <div key={k} className="mt-1 text-[14px]">
                <span className="block text-[12px] text-zinc-500">{FIELD_LABEL[k]}</span>
                <FieldValue k={k} v={cr.diff.before[k]} titles={titles} />
              </div>
            ))}
          </div>
          <div className="min-w-0 rounded-[10px] border border-violet-700 p-3" data-side="proposed">
            <p className="al-lbl">Proposed · revision {cr.revision}</p>
            {fields.map((k) => (
              <div key={k} className="mt-1 text-[14px]">
                <span className="block text-[12px] text-zinc-500">{FIELD_LABEL[k]}</span>
                <FieldValue k={k} v={cr.diff.after[k]} titles={titles} />
              </div>
            ))}
            <p className="mt-2 text-[13px] text-zinc-500">Not approved. Nothing changes until someone in the goal&apos;s approval set approves it, and agents get it only at launch.</p>
          </div>
        </div>
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 rounded-[10px] border border-zinc-200 p-3 sm:grid-cols-4">
          <Fact k="Version">
            Goal at version {n}
            {cr.behind ? `; request made against version ${cr.base_version}` : ""}
          </Fact>
          <Fact k="Requested by">{mine ? "You" : cr.requester.name}</Fact>
          <Fact k="Decides">{cr.approvers.length ? names(cr.approvers) : "Nobody can approve this yet"}</Fact>
          <Fact k="State">{stateWord}</Fact>
        </dl>
      </section>
      {cr.behind && !mine && <Note>The goal changed after this request was made. {cr.requester.name} needs to update it before it can be approved.</Note>}
      {cr.behind && cr.can.rebase && (
        <div className="my-2 flex flex-wrap items-center gap-2">
          <Note>
            Made against version {cr.base_version}. The goal is now at version {n}.
          </Note>
          <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(`${path}/rebase`, { body: { revision: cr.revision, base_version: n } }), onDone)}>
            Update to version {n}
          </Btn>
        </div>
      )}

      {/* 2. What would change (the request's own text) beside the evidence. */}
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
        <section aria-label="What would change" className="min-w-0 rounded-[10px] border border-zinc-200 p-3" data-what-would-change>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-zinc-900">What would change</h3>
            <Pill>the request&apos;s own text, not evidence</Pill>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[14px] text-zinc-800">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-2 text-[14px] text-zinc-700">
            {mine ? "Your" : `${cr.requester.name}'s`} reason, as written: {quote(cr.reason)}
          </p>
          {counterNote && (
            <p className="mt-1 text-[14px] text-zinc-700">
              {said(counterNote.author)}&apos;s note on revision {counterNote.revision}, as written: {quote(counterNote.note!)}
            </p>
          )}
          {cr.condition && <ConditionBox c={cr.condition} said={said} />}
        </section>
        <section aria-label="Evidence" className="min-w-0 rounded-[10px] border border-zinc-200 p-3" data-evidence>
          <h3 className="text-[15px] font-semibold text-zinc-900">Evidence for revision {cr.revision}</h3>
          {current?.snapshot && <SnapshotBox s={current.snapshot} />}
          {current && current.evidence.length > 0 ? (
            <ul>
              {current.evidence.map((e) => (
                <EvidenceItem key={e.id} e={e} me={me} busy={act.busy} onRemove={(id) => void act.run(() => api(`${path}/evidence/${id}`, { method: "DELETE" }), onDone)} />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-zinc-600" data-no-evidence>
              No evidence attached.
            </p>
          )}
          {earlier.map((r) => (
            <div key={r.revision} className="mt-1">
              <p className="text-[13px] text-zinc-500">From revision {r.revision}</p>
              <ul>
                {r.evidence.map((e) => (
                  <EvidenceItem key={e.id} e={e} me={me} busy={act.busy} onRemove={() => undefined} />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-1 text-[13px] text-zinc-500">Links are what people or agents say support the change, labelled self-reported or agent-reported. Align doesn&apos;t check them.</p>
          {cr.can.add_evidence && <AddEvidence path={path} revision={cr.revision} onDone={onDone} />}
        </section>
      </div>
      <Err>{act.error}</Err>

      {/* 3-4. Your decision: choose, give that choice's input, confirm. */}
      {decisions.length > 0 ? (
        <section aria-label="Your decision" className="mt-4 border-t border-zinc-200 pt-3" data-decide>
          <h3 className="al-lbl mb-2">Your decision</h3>
          {step === "input" && (
            <>
              {cr.state === "countered" && cr.can.reject && (
                <p className="mb-2 text-[15px] text-zinc-700" data-countered-decline>
                  Waiting on {cr.requester.name} to accept your suggested change. You can still decline instead of waiting.
                </p>
              )}
              <p className="mb-2 text-[14px] text-zinc-600">{decisions.length > 1 ? "Choose what should happen. Nothing is sent until you confirm." : "Nothing is sent until you confirm."}</p>
              <div role="group" aria-label="Your decision" className="flex flex-wrap gap-2">
                {decisions.map((d) => (
                  <Choice key={d} on={choice === d} title={TITLE[d]} sub={SUB[d]} onPick={() => pick(d)} />
                ))}
              </div>
            </>
          )}

          {choice && (
            <div ref={panel} hidden={step === "confirm"} className="mt-3 min-w-0 rounded-[10px] border border-zinc-200 p-3" data-decision-input={choice}>
              {(choice === "approve" || choice === "approve_and_launch") && (
                <>
                  {noEvidence && (
                    <div role="note" className="mb-3 rounded-[10px] border border-amber-700 p-3 text-[14px] text-amber-800">
                      <p className="font-medium">Approve without evidence?</p>
                      <p>This revision has no evidence links. You can still approve it; the decision record and the audit log will say it was approved without evidence.</p>
                    </div>
                  )}
                  <button type="button" aria-expanded={noteOpen} onClick={() => setNoteOpen((o) => !o)} className={`mb-2 min-h-[44px] text-[14px] font-medium text-zinc-700 underline ${focusRing}`}>
                    Add a note (optional)
                  </button>
                  {noteOpen && (
                    <Field label="Note (optional, never sent to agents)">
                      <TextArea rows={2} value={note} maxLength={TEXT_MAX} onChange={(e) => setNote(e.target.value)} />
                    </Field>
                  )}
                </>
              )}
              {choice === "accept_if" && (
                <>
                  <Field label={`Accept if… (the condition ${cr.requester.name} acknowledges)`} hint="Never sent to agents, and never a gate on approval or launch. 1 to 2000 characters.">
                    <TextArea data-first rows={2} value={condition} maxLength={TEXT_MAX} onChange={(e) => setCondition(e.target.value)} />
                  </Field>
                  <Field label={`Note to ${cr.requester.name}`} hint="Never sent to agents. 1 to 2000 characters.">
                    <TextArea rows={2} value={ifNote} maxLength={TEXT_MAX} onChange={(e) => setIfNote(e.target.value)} />
                  </Field>
                  <p className="mb-2 text-[14px] text-zinc-600">The change stays as {ask} wrote it. {cr.requester.name} accepts it, then it can be approved.</p>
                </>
              )}
              {choice === "counter" && (
                <CounterInput
                  ws={ws}
                  cr={cr}
                  focus={step === "input"}
                  onReview={(changes, cNote, cCond) => {
                    setCounter({ changes, note: cNote, condition: cCond });
                    setErr(null);
                    setStep("confirm");
                  }}
                />
              )}
              {choice === "reject" && (
                <Field label="Why you're declining" hint={`${cr.requester.name} sees it. 1 to 2000 characters.`}>
                  <TextArea data-first rows={2} value={reason} maxLength={TEXT_MAX} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
              {(choice === "accept_counter" || choice === "acknowledge" || choice === "withdraw") && <p className="mb-2 text-[15px] text-zinc-700">This needs no text.</p>}
              {err && (
                <p ref={errRef} tabIndex={-1} role="alert" className={`mb-2 rounded-[10px] border border-red-700 bg-red-50 px-3 py-2 text-[15px] text-zinc-900 ${focusRing}`}>
                  {err}
                </p>
              )}
              {choice !== "counter" && (
                <Btn onClick={review} ref={reviewBtn}>
                  Review this decision
                </Btn>
              )}
            </div>
          )}

          {choice && step === "confirm" && (
            <div role="region" aria-labelledby={`confirm-${cr.id}`} className="mt-3 min-w-0 rounded-[10px] border border-violet-700 p-3" data-confirm={choice}>
              <h4 id={`confirm-${cr.id}`} ref={confirmHead} tabIndex={-1} className={`mb-2 text-[17px] font-semibold text-zinc-900 ${focusRing}`}>
                Confirm: {TITLE[choice]}
              </h4>
              <dl className="space-y-2 text-[15px] text-zinc-900">
                <ConfirmRow k="Acting as">
                  {meName} (you{myPart ? `, ${myPart}` : ""})
                </ConfirmRow>
                <ConfirmRow k="On">
                  Revision {cr.revision} of {mine ? "your" : `${cr.requester.name}'s`} request on {quote(cr.goal.title)}, made against version {cr.base_version}
                </ConfirmRow>
                <ConfirmRow k="Decision">{TITLE[choice]}</ConfirmRow>
                {enteredRows().map(([k, v]) => (
                  <ConfirmRow key={k} k={k}>
                    {v}
                  </ConfirmRow>
                ))}
                <ConfirmRow k="What happens">{transition()}</ConfirmRow>
                <ConfirmRow k="Launch">{launchLine()}</ConfirmRow>
              </dl>
              <p className="mt-2 text-[13px] text-zinc-500">Align reads the request again before sending. If it changed meanwhile, nothing is sent.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn disabled={sending} onClick={() => void submit()}>
                  {sending ? "Recording…" : `Confirm: ${TITLE[choice].replace(/…$/, "")}`}
                </Btn>
                <Btn kind="secondary" disabled={sending} onClick={() => setStep("input")}>
                  Back
                </Btn>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="mt-4 border-t border-zinc-200 pt-3 text-[15px] text-zinc-700" data-waiting>
          {waitingLine}
        </p>
      )}

      <Revisions cr={cr} />
      {/* 5. Details: the ids, closed by default. */}
      <details className="mt-1 text-[13px] text-zinc-500" data-details>
        <summary className="cursor-pointer">Details</summary>
        <dl className="mt-1 font-mono [overflow-wrap:anywhere]">
          <div>change_request: {cr.id}</div>
          <div>
            goal: {cr.goal.id} (version {cr.goal.version})
          </div>
          <div>state: {cr.state}</div>
          <div>revision: {cr.revision}</div>
          <div>base_version: {cr.base_version}</div>
          <div>requester: {cr.requester.id}</div>
          <div>approvers: {cr.approvers.map((a) => a.id).join(", ") || "none"}</div>
          <div>evidence: {current?.evidence.map((e) => e.id).join(", ") || "none"}</div>
          <div>created_at: {cr.created_at}</div>
          <div>updated_at: {cr.updated_at}</div>
          {cr.condition?.acknowledged_at && <div>condition_acknowledged_at: {when(cr.condition.acknowledged_at)}</div>}
        </dl>
      </details>
    </div>
  );
}
