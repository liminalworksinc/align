"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, Btn, Err, Note, Pill, useAction, useApi, when } from "./kit";
import { ChangesForm, ConditionBox, CR_STATE_WORDS, crTone, Diff, EvidenceItem, NoticeBox, Revisions, SnapshotBox, useNotice, type Notice } from "./crparts";
import { OpenRequest } from "./decide";
import type { ChangeRequest, Goal } from "./types";
import { ValueCard } from "./value";
import { launchWords } from "@/lib/v2/launch-words";

// Change requests in the web app: the proposal form and one request's card. An open request is understood, then
// decided (decide.tsx); a decided one is its record, with exactly the launch and acknowledge actions its `can` flags
// allow: approving records the decision, and agents switch only at launch (LAUNCH-001). Used by the goal page and the
// workspace Requests tab.

/** "Propose a change": for a member who can read an active goal but doesn't own it. */
export function ProposeChange({ ws, goal, onDone }: { ws: string; goal: Goal; onDone: () => void }) {
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
  return <RequestRecord {...props} notice={notice} />;
}

/** A decided request (approved, rejected, withdrawn or superseded): its decision record. */
function RequestRecord({ ws, cr, me, showGoal, titles, onDone, notice }: { ws: string; cr: ChangeRequest; me: string; showGoal?: boolean; titles: Map<string, string>; onDone: () => void; notice: Notice | null }) {
  const act = useAction();
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  const doIt = (action: string, body: Record<string, unknown>) => act.run(() => api(`${path}/${action}`, { body }), onDone);
  const mine = cr.requester.id === me;
  const current = cr.revisions.find((r) => r.revision === cr.revision);
  const earlier = cr.revisions.filter((r) => r.revision !== cr.revision && r.evidence.length > 0);
  const remove = (id: string) => void act.run(() => api(`${path}/evidence/${id}`, { method: "DELETE" }), onDone);
  const names = (ps: { id: string; name: string }[]) => ps.map((a) => (a.id === me ? "you" : a.name)).join(" or ");
  const said = (p: { id: string; name: string } | null) => (p ? (p.id === me ? "you" : p.name) : "someone");
  const words = launchWords(cr.launch, cr.base_version, cr.version);
  const next = cr.goal.version + 1;
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
          Approved by {cr.approved_by?.name}
          {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}, then superseded before launch: the goal got a newer version or was closed first. It never reached agents. {mine ? "You" : cr.requester.name} can propose it again.
        </Note>
      )}
      {cr.state === "approved" && (
        <div className="text-[14px] text-zinc-600" data-launch={cr.launch ?? ""}>
          <p className="font-medium text-zinc-900">{words}.</p>
          <p>
            Approved by {cr.approved_by?.name}
            {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}.{cr.note ? ` Note: ${cr.note}` : ""}
            {cr.approved_without_evidence === true && <> Approved without evidence.</>}
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
          {(cr.launch === "pending" || cr.launch === "not_yet") && <p className="text-zinc-500">{cr.launchers.length ? `Can launch: ${names(cr.launchers)}` : "Nobody can launch this yet"}</p>}
        </div>
      )}
      {cr.condition && <ConditionBox c={cr.condition} said={said} />}
      {cr.state === "approved" && <ValueCard ws={ws} cr={cr} me={me} />}
      {cr.state === "rejected" && (
        <p className="text-[14px] text-zinc-600">
          Rejected by {cr.rejected_by?.name}
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
      <Revisions cr={cr} />
      <div className="mt-3 flex flex-wrap gap-2">
        {cr.can.acknowledge && cr.condition && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => void doIt("acknowledge", { revision: cr.condition!.revision })}>
            Confirm the condition is met
          </Btn>
        )}
        {cr.can.launch && (
          <Btn disabled={act.busy} onClick={() => void doIt("launch", {})}>
            Launch version {next} to agents
          </Btn>
        )}
        {cr.can.not_yet && cr.launch !== "not_yet" && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => void doIt("not_yet", {})}>
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
