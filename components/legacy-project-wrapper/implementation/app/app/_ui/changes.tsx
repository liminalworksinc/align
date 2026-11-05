"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, Btn, Err, Note, Pill, sentence, useAction, useApi, when } from "./kit";
import { ChangesForm, ConditionBox, CR_STATE_WORDS, crTone, Diff, EvidenceItem, NoticeBox, removeEvidence, Revisions, SnapshotBox, useNotice, type Notice } from "./crparts";
import { OpenRequest } from "./decide";
import type { ChangeRequest, Goal } from "./types";
import { ValueCard } from "./value";
import { launchWords } from "@/lib/v2/launch-words";

// Change requests in the web app: the proposal form and one request's card. An open request is understood, then
// decided (decide.tsx); a decided one is its record, with exactly the launch and acknowledge actions its `can` flags
// allow: approving records the decision, and agents switch only at launch (LAUNCH-001). Used by the goal page and the
// workspace Requests tab.

/** "Propose a change": for a member who can read an active goal but doesn't own it. `choices` are the goals the
 *  server would accept as a new dependency (the goal read's dependency_choices), `loops` those left out because they
 *  already depend on this goal (dependency_loops); `hiddenDeps` counts the goal's
 *  dependencies the person can't see, which a proposal keeps. */
export function ProposeChange({
  ws,
  goal,
  choices = null,
  loops = null,
  hiddenDeps = 0,
  onDone,
}: {
  ws: string;
  goal: Goal;
  choices?: string[] | null;
  loops?: string[] | null;
  hiddenDeps?: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const act = useAction();
  if (!open)
    return (
      <Btn kind="secondary" onClick={() => setOpen(true)}>
        Propose a change
      </Btn>
    );
  return (
    <div className="rounded-[12px] border border-zinc-300 p-4">
      <p className="mb-3 text-[15px] text-zinc-600">
        Edit what should change. The goal&apos;s owner or a lead of its team decides. Once approved and launched it becomes version {goal.version + 1}; agents switch at launch.
      </p>
      <ChangesForm
        key={goal.version}
        ws={ws}
        goal={goal}
        start={{}}
        choices={choices}
        loops={loops}
        hiddenDeps={hiddenDeps}
        noteLabel="Why this change"
        noteRequired
        sendLabel="Send for approval"
        busy={act.busy}
        onSend={(changes, reason) => {
          setError(null);
          void act.run(async () => {
            try {
              await api(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests`, { body: { base_version: goal.version, changes, reason } });
              setOpen(false);
              onDone();
            } catch (e) {
              if (e instanceof ApiError) setError({ code: e.code, message: e.message });
              else throw e;
            }
          });
        }}
      />
      {error?.code === "stale_version" && <Err>{error.message}</Err>}
      {error?.code === "already_open" && (
        <Err>
          You already have an open change request on this goal. <a href="#change-requests" className="underline">See it below.</a>
        </Err>
      )}
      {error && error.code !== "stale_version" && error.code !== "already_open" && <Err>{error.message}</Err>}
      <Err>{act.error}</Err>
    </div>
  );
}

/** One change request. While it is open (pending or countered) it is the open view (decide.tsx: understand the change,
 *  then decide); once decided it is its record, with the launch and acknowledge controls its `can` flags allow. */
export function ChangeRequestCard(props: { ws: string; cr: ChangeRequest; me: string; showGoal?: boolean; titles: Map<string, string>; onDone: () => void }) {
  // A decision's outcome (recorded, or not recorded and why) outlives the remount its reload causes.
  const [notice, setNotice] = useNotice(props.cr.id);
  if (props.cr.state === "pending" || props.cr.state === "countered") return <OpenRequest {...props} notice={notice} setNotice={setNotice} />;
  return <RequestRecord {...props} notice={notice} setNotice={setNotice} />;
}

/** A decided request (approved, rejected, withdrawn or superseded): its decision record. Launch and Not yet post the
 *  revision on screen (a stale one is refused, 409) and say "Recorded: …" like every other decision (C2 N5, F4). */
function RequestRecord({
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
  const act = useAction();
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  /** Confirm the condition is met: recorded, or refused like every decision (a 409 is the card's focused "Not recorded.
   *  <the server's words>" and the card reloads; c9 sweep). */
  const acknowledge = () =>
    void act.run(async () => {
      setNotice(null);
      try {
        await api(`${path}/acknowledge`, { body: { revision: cr.condition!.revision } });
        setNotice({ kind: "done", text: "Recorded: you acknowledged the condition." });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) throw e;
        setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
      }
      onDone();
    });
  const next = cr.goal.version + 1;
  /** Launch or not yet: the decision's outcome is a notice, which outlives the reload (and remount) that follows. */
  const decideLaunch = (action: "launch" | "not_yet") =>
    void act.run(async () => {
      setNotice(null);
      try {
        await api(`${path}/${action}`, { body: { revision: cr.revision } });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) throw e;
        setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
        onDone(); // the request moved on: show it as it is now
        return;
      }
      setNotice({
        kind: "done",
        text:
          action === "launch"
            ? `Recorded: you launched version ${next} to agents. They get it at their next turn.`
            : `Recorded: you decided not yet. Agents stay on version ${cr.goal.version} until someone launches version ${next}.`,
      });
      onDone();
    });
  const mine = cr.requester.id === me;
  const current = cr.revisions.find((r) => r.revision === cr.revision);
  const earlier = cr.revisions.filter((r) => r.revision !== cr.revision && r.evidence.length > 0);
  const remove = (id: string) => void act.run(() => removeEvidence(path, id, setNotice, onDone));
  const names = (ps: { id: string; name: string }[]) => ps.map((a) => (a.id === me ? "you" : a.name)).join(" or ");
  const said = (p: { id: string; name: string } | null) => (p ? (p.id === me ? "you" : p.name) : "someone");
  const words = launchWords(cr.launch, cr.base_version, cr.version);
  // The launch set, less the reader when the server would refuse their launch (C4-1).
  const canLaunch = cr.dependency_not_visible ? cr.launchers.filter((a) => a.id !== me) : cr.launchers;
  return (
    <div className="mb-4 rounded-[12px] border border-zinc-200 p-4" data-cr={cr.id} data-cr-view="record">
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
        <Pill tone={crTone(cr.state)}>{CR_STATE_WORDS[cr.state]}</Pill>
        <Pill>base version {cr.base_version}</Pill>
        <Pill>revision {cr.revision}</Pill>
      </div>
      <p className="text-[15px] text-zinc-700">Why: {cr.reason}</p>
      <Diff cr={cr} titles={titles} />
      {cr.state === "superseded" && cr.launch !== "superseded" && <Note>Closed because the goal was marked achieved or dropped.</Note>}
      {cr.state === "superseded" && cr.launch === "superseded" && (
        <Note>
          Approved by {said(cr.approved_by)}
          {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}, then superseded before launch: the goal got a newer version or was closed first. It never reached agents. {mine ? "You" : cr.requester.name} can propose it again.
        </Note>
      )}
      {cr.state === "approved" && (
        <div className="text-[14px] text-zinc-600" data-launch={cr.launch ?? ""}>
          <p className="font-medium text-zinc-900">{words}.</p>
          <p>
            Approved by {said(cr.approved_by)}
            {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}.{cr.note ? ` Note: ${cr.note}` : ""}
            {cr.approved_without_evidence === true && <> Approved without evidence on the approved revision ({cr.revision}).</>}
            {cr.approved_without_evidence === false && <> Approved with {cr.evidence_count} evidence {cr.evidence_count === 1 ? "link" : "links"}, none verified.</>}
          </p>
          {cr.launch === "launched" && (
            <p>
              Launched by {said(cr.launch_decided_by)}
              {cr.launch_decided_at ? `, ${when(cr.launch_decided_at)}` : ""}. It became version {cr.version}.
            </p>
          )}
          {cr.launch === "not_yet" && (
            <p>
              Not launched yet: {said(cr.launch_decided_by)} decided not yet{cr.launch_decided_at ? `, ${when(cr.launch_decided_at)}` : ""}.
            </p>
          )}
          {(cr.launch === "pending" || cr.launch === "not_yet") && !cr.dependency_loop && <p className="text-zinc-500">{canLaunch.length ? `Can launch: ${names(canLaunch)}` : "Nobody can launch this yet"}</p>}
          {/* Why nobody can launch it as it stands: a dependency it adds would now close a loop (C5-1). */}
          {cr.dependency_loop && (
            <p className="text-zinc-700" data-dependency-loop>
              Nobody can launch this as it stands. {cr.dependency_loop}
            </p>
          )}
          {/* Why Launch isn't offered to someone who may launch it: a dependency they can't see (C4-1). */}
          {cr.dependency_not_visible && (
            <p className="text-zinc-700" data-dependency-not-visible>
              You can&apos;t launch this. {cr.dependency_not_visible}
            </p>
          )}
        </div>
      )}
      {cr.condition && <ConditionBox c={cr.condition} said={said} closed={cr.state === "rejected" ? "declined" : cr.state === "withdrawn" ? "withdrawn" : cr.state === "superseded" ? "superseded" : undefined} />}
      {cr.state === "approved" && <ValueCard ws={ws} cr={cr} me={me} titles={titles} />}
      {cr.state === "rejected" && (
        <p className="text-[14px] text-zinc-600">
          Declined by {said(cr.rejected_by)}
          {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}. Reason: {cr.rejection_reason}
        </p>
      )}
      <div className="mt-2">
        <p className="text-[14px] font-medium text-zinc-800">Evidence for revision {cr.revision}</p>
        {current?.snapshot && <SnapshotBox s={current.snapshot} />}
        {current && current.evidence.length > 0 ? (
          <ul>
            {current.evidence.map((e) => (
              <EvidenceItem key={e.id} e={e} me={me} busy={act.busy} onRemove={remove} />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-zinc-500">No evidence attached.</p>
        )}
        {earlier.map((r) => (
          <div key={r.revision} className="mt-1">
            <p className="text-[13px] text-zinc-500">From revision {r.revision}</p>
            <ul>
              {r.evidence.map((e) => (
                <EvidenceItem key={e.id} e={e} me={me} busy={act.busy} onRemove={remove} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Revisions cr={cr} me={me} />
      <div className="mt-3 flex flex-wrap gap-2">
        {cr.can.acknowledge && cr.condition && (
          <Btn kind="secondary" disabled={act.busy} onClick={acknowledge}>
            Confirm the condition is met
          </Btn>
        )}
        {cr.can.launch && (
          <Btn disabled={act.busy} onClick={() => decideLaunch("launch")}>
            Launch version {next} to agents
          </Btn>
        )}
        {cr.can.not_yet && cr.launch !== "not_yet" && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => decideLaunch("not_yet")}>
            Not yet
          </Btn>
        )}
      </div>
      <Err>{act.error}</Err>
    </div>
  );
}

/** Titles of the goals this person can read, for dependency names in diffs. */
export function useGoalTitles(ws: string) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  return new Map((feed.data?.goals ?? []).map((g) => [g.id, g.title]));
}
