"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, Btn, Err, Field, Input, Loading, Note, num, Pill, Select, TextArea, usd, useAction, useApi, when } from "./kit";
import { MeasuresEditor, measuresDraft, measuresOut, type MeasureDraft } from "./goalform";
import type { AlignSnapshot, ChangeFields, ChangeRequest, Evidence, EvidenceKind, Goal } from "./types";

// Change requests in the web app: the proposal form (also used to suggest a change as an approver) and one request's
// card with exactly the actions its `can` flags allow. Used by the goal page and the workspace Requests tab.

export const CR_STATE_WORDS: Record<ChangeRequest["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested a change",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "withdrawn",
  superseded: "superseded",
};
const tone = (s: ChangeRequest["state"]) => (s === "approved" ? "green" : s === "pending" || s === "countered" ? "amber" : "neutral");

const FIELD_LABEL: Record<keyof ChangeFields, string> = { title: "Goal", measures: "Measures", depends_on: "Depends on", status: "Status" };
const STATUS_WORD: Record<Goal["status"], string> = { active: "Active", achieved: "Achieved", dropped: "Dropped" };

/** One field's value in plain words (dependencies by title when the person can see them). */
function FieldValue({ k, v, titles }: { k: keyof ChangeFields; v: ChangeFields[keyof ChangeFields]; titles: Map<string, string> }) {
  if (v === undefined) return <span className="text-zinc-500">(unchanged)</span>;
  if (k === "measures") {
    const ms = v as Goal["measures"];
    if (!ms.length) return <span className="text-zinc-500">No measures</span>;
    return (
      <ul className="list-disc pl-5">
        {ms.map((m, i) => (
          <li key={`${m.id}-${i}`}>
            {m.text}
            {m.target && <span className="text-zinc-500"> (target: {m.target})</span>}
          </li>
        ))}
      </ul>
    );
  }
  if (k === "depends_on") {
    const ids = v as string[];
    return <span>{ids.length ? ids.map((id) => titles.get(id) ?? "a goal").join(", ") : "Nothing"}</span>;
  }
  if (k === "status") return <span>{STATUS_WORD[v as Goal["status"]] ?? String(v)}</span>;
  return <span>{String(v)}</span>;
}

function Diff({ cr, titles }: { cr: ChangeRequest; titles: Map<string, string> }) {
  const keys = (Object.keys(FIELD_LABEL) as (keyof ChangeFields)[]).filter((k) => k in cr.diff.after || k in cr.diff.before);
  if (!keys.length) return null;
  return (
    <div className="my-2 grid gap-2">
      {keys.map((k) => (
        <div key={k} className="grid gap-2 rounded-[10px] bg-zinc-50 p-2 text-[14px] sm:grid-cols-[120px_1fr_1fr]">
          <span className="text-zinc-600">{FIELD_LABEL[k]}</span>
          <div>
            <span className="block text-[12px] text-zinc-500">Before</span>
            <FieldValue k={k} v={cr.diff.before[k]} titles={titles} />
          </div>
          <div>
            <span className="block text-[12px] text-zinc-500">After</span>
            <FieldValue k={k} v={cr.diff.after[k]} titles={titles} />
          </div>
        </div>
      ))}
    </div>
  );
}

const sameMeasures = (a: { id?: string; text: string; target: string | null }[], b: Goal["measures"]) =>
  JSON.stringify(a.map((m) => [m.id ?? null, m.text, m.target ?? null])) === JSON.stringify(b.map((m) => [m.id, m.text, m.target ?? null]));
const sameIds = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

/** Goal, measures, Status and Depends on, pre-filled from `start`. `onSend` gets only the fields that differ from
 *  `goal` (plus any in `keep`, for a counter that restates the request's fields). */
function ChangesForm({
  ws,
  goal,
  start,
  keep = [],
  noteLabel,
  noteRequired,
  sendLabel,
  busy,
  onSend,
}: {
  ws: string;
  goal: Goal;
  start: ChangeFields;
  keep?: (keyof ChangeFields)[];
  noteLabel: string;
  noteRequired: boolean;
  sendLabel: string;
  busy: boolean;
  onSend: (changes: ChangeFields, note: string) => void;
}) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [title, setTitle] = useState(start.title ?? goal.title);
  const [status, setStatus] = useState<Goal["status"]>(start.status ?? goal.status);
  const [measures, setMeasures] = useState<MeasureDraft[]>(measuresDraft({ ...goal, measures: start.measures ?? goal.measures }));
  const [deps, setDeps] = useState<string[]>(start.depends_on ?? goal.depends_on ?? []);
  const [note, setNote] = useState("");
  const others = feed.data?.goals.filter((g) => g.id !== goal.id && (g.status === "active" || deps.includes(g.id))) ?? [];
  const out = measuresOut(measures);
  const changes: ChangeFields = {};
  if (title.trim() !== goal.title || keep.includes("title")) changes.title = title.trim();
  if (!sameMeasures(out, goal.measures) || keep.includes("measures")) changes.measures = out as Goal["measures"];
  if (status !== goal.status || keep.includes("status")) changes.status = status;
  if (!sameIds(deps, goal.depends_on ?? []) || keep.includes("depends_on")) changes.depends_on = deps;
  const differs = title.trim() !== goal.title || !sameMeasures(out, goal.measures) || status !== goal.status || !sameIds(deps, goal.depends_on ?? []) || keep.length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(changes, note.trim());
      }}
    >
      <Field label="Goal">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </Field>
      <MeasuresEditor value={measures} onChange={setMeasures} />
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
          <option value="active">Active</option>
          <option value="achieved">Achieved</option>
          <option value="dropped">Dropped</option>
        </Select>
      </Field>
      {others.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-[14px] text-zinc-600">Depends on</p>
          {others.map((g) => (
            <label key={g.id} className="mb-1 flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={deps.includes(g.id)} onChange={(e) => setDeps((d) => (e.target.checked ? [...d, g.id] : d.filter((x) => x !== g.id)))} />
              {g.title}
            </label>
          ))}
        </div>
      )}
      <Field label={noteLabel} hint="Never sent to agents. 1 to 2000 characters.">
        <TextArea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} required={noteRequired} />
      </Field>
      <Btn type="submit" disabled={busy || !differs || (noteRequired && !note.trim()) || !title.trim()}>
        {sendLabel}
      </Btn>
    </form>
  );
}

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
      <p className="mb-3 text-[15px] text-zinc-600">Edit what should change. The goal&apos;s owner or a lead of its team decides; an approval publishes it as version {goal.version + 1}.</p>
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

/** An approver's "Suggest a change": the request's changes pre-filled on the goal as it is now. */
function CounterForm({ ws, cr, onDone }: { ws: string; cr: ChangeRequest; onDone: () => void }) {
  const g = useApi<{ goal: Goal }>(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}`);
  const act = useAction();
  if (g.loading) return <Loading />;
  if (!g.data) return <Err>{g.error}</Err>;
  return (
    <div className="mt-3 rounded-[12px] border border-zinc-300 p-3">
      <p className="mb-2 text-[15px] text-zinc-700">Suggest a change. {cr.requester.name} can accept it, and then it can be approved.</p>
      <ChangesForm
        ws={ws}
        goal={g.data.goal}
        start={cr.changes}
        keep={Object.keys(cr.changes) as (keyof ChangeFields)[]}
        noteLabel="Note"
        noteRequired
        sendLabel="Send suggestion"
        busy={act.busy}
        onSend={(changes, note) => void act.run(() => api(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/counter`, { body: { revision: cr.revision, changes, note } }), onDone)}
      />
      <Err>{act.error}</Err>
    </div>
  );
}

// ---- evidence: links people or agents say support the change (never verified), and Align's own snapshot ----

const KIND_WORD: Record<EvidenceKind, string> = { pr: "Pull request", ci_run: "CI run", incident: "Incident", dashboard: "Dashboard", doc: "Doc", other: "Link" };

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** One link: kind, label (opens in a new tab, no referrer), its host, who added it and how it was reported. */
function EvidenceItem({ e, me, busy, onRemove }: { e: Evidence; me: string; busy: boolean; onRemove: (id: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1 text-[14px]">
      <Pill>{KIND_WORD[e.kind]}</Pill>
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-violet-700 underline">
        {e.label}
      </a>
      <span className="text-zinc-500">({hostOf(e.url)})</span>
      <Pill tone={e.source === "agent" ? "amber" : "neutral"}>{e.reported_as}</Pill>
      <span className="text-zinc-500">
        by {e.added_by.id === me ? "you" : e.added_by.name}, {when(e.added_at)}
      </span>
      {e.can_remove && (
        <button type="button" className="text-[13px] text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => onRemove(e.id)}>
          Remove
        </button>
      )}
    </li>
  );
}

/** "Recorded by Align at revision N": the goal's spend over 30 days, bound sessions and last activity. */
function SnapshotBox({ s }: { s: AlignSnapshot }) {
  const models = s.spend?.by_model ?? [];
  return (
    <div className="my-2 rounded-[10px] bg-zinc-50 p-2 text-[14px] text-zinc-700">
      <p className="text-[12px] text-zinc-500">
        Recorded by Align at revision {s.revision}, {when(s.recorded_at)}
      </p>
      <p>
        {s.spend ? (
          <>
            Spend on this goal in the last {s.window.days} days: {usd(s.spend.total.est_list_usd_micros)} estimated at list price, {num(s.spend.total.requests)} requests
            {models.length > 0 && <> ({models.map((m) => `${m.model} ${usd(m.est_list_usd_micros)}`).join(", ")})</>}.
          </>
        ) : (
          <>Spend on this goal is hidden from you.</>
        )}{" "}
        Sessions bound to it: {num(s.bound_sessions)}. Last activity: {s.last_activity_at ? when(s.last_activity_at) : "none"}.
      </p>
    </div>
  );
}

/** Add a link to the current revision (the requester, or someone who can approve, while the request is open). */
function AddEvidence({ path, revision, onDone }: { path: string; revision: number; onDone: () => void }) {
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EvidenceKind>("pr");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  if (!open)
    return (
      <Btn kind="secondary" onClick={() => setOpen(true)}>
        Add evidence
      </Btn>
    );
  return (
    <form
      className="mt-2 rounded-[12px] border border-zinc-300 p-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        void act.run(
          () => api(`${path}/evidence`, { body: { kind, url: url.trim(), label: label.trim(), revision } }),
          () => {
            setOpen(false);
            setUrl("");
            setLabel("");
            onDone();
          },
        );
      }}
    >
      <p className="mb-2 text-[14px] text-zinc-600">A link that supports this change. It is shown as self-reported: Align does not check it.</p>
      <Field label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
          {(Object.keys(KIND_WORD) as EvidenceKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_WORD[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Link (https)">
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} placeholder="https://" required />
      </Field>
      <Field label="What it shows" hint="At most 120 characters.">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" disabled={act.busy || !/^https:\/\//i.test(url.trim()) || !label.trim()}>
          Add link
        </Btn>
        <Btn kind="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Btn>
      </div>
      <Err>{act.error}</Err>
    </form>
  );
}

/** One change request: what it changes, its history and decision, and the actions the server allows this person. */
export function ChangeRequestCard({ ws, cr, me, showGoal, titles, onDone }: { ws: string; cr: ChangeRequest; me: string; showGoal?: boolean; titles: Map<string, string>; onDone: () => void }) {
  const act = useAction();
  const [mode, setMode] = useState<"" | "approve" | "reject" | "counter">("");
  const [text, setText] = useState("");
  const [stale, setStale] = useState(false);
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}`;
  const doIt = (action: string, body: Record<string, unknown>) =>
    act.run(async () => {
      try {
        await api(`${path}/${action}`, { body });
      } catch (e) {
        if (e instanceof ApiError && e.code === "stale_version" && action === "approve") {
          setStale(true);
          return;
        }
        throw e;
      }
      setMode("");
      setText("");
    }, onDone);
  const mine = cr.requester.id === me;
  const current = cr.revisions.find((r) => r.revision === cr.revision);
  const earlier = cr.revisions.filter((r) => r.revision !== cr.revision && r.evidence.length > 0);
  const remove = (id: string) => void act.run(() => api(`${path}/evidence/${id}`, { method: "DELETE" }), onDone);
  const noEvidence = cr.evidence_count === 0;
  return (
    <div className="mb-4 rounded-[12px] border border-zinc-200 p-4">
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
        <Pill tone={tone(cr.state)}>{CR_STATE_WORDS[cr.state]}</Pill>
        <Pill>base version {cr.base_version}</Pill>
        <Pill>revision {cr.revision}</Pill>
      </div>
      <p className="text-[15px] text-zinc-700">Why: {cr.reason}</p>
      <Diff cr={cr} titles={titles} />
      {cr.state === "superseded" && <Note>Closed because the goal was marked achieved or dropped.</Note>}
      {cr.state === "approved" && (
        <p className="text-[14px] text-zinc-600">
          Approved by {cr.approved_by?.name}
          {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}. It became version {cr.version}.{cr.note ? ` Note: ${cr.note}` : ""}
          {cr.approved_without_evidence === true && <> Approved without evidence.</>}
          {cr.approved_without_evidence === false && <> Approved with {cr.evidence_count} evidence {cr.evidence_count === 1 ? "link" : "links"}, none verified.</>}
        </p>
      )}
      {cr.state === "rejected" && (
        <p className="text-[14px] text-zinc-600">
          Rejected by {cr.rejected_by?.name}
          {cr.decided_at ? `, ${when(cr.decided_at)}` : ""}. Reason: {cr.rejection_reason}
        </p>
      )}
      {(cr.state === "pending" || cr.state === "countered") && cr.approvers.length > 0 && <p className="text-[14px] text-zinc-500">Can approve: {cr.approvers.map((a) => (a.id === me ? "you" : a.name)).join(" or ")}</p>}
      {(stale || (cr.behind && cr.state === "pending" && !mine)) && <Note>The goal changed after this request was made. {cr.requester.name} needs to update it before it can be approved.</Note>}
      {cr.behind && cr.can.rebase && (
        <div className="my-2 flex flex-wrap items-center gap-2">
          <Note>
            Made against version {cr.base_version}. The goal is now at version {cr.goal.version}.
          </Note>
          <Btn kind="secondary" disabled={act.busy} onClick={() => void doIt("rebase", { revision: cr.revision, base_version: cr.goal.version })}>
            Update to version {cr.goal.version}
          </Btn>
        </div>
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
          <p className="text-[14px] text-zinc-500">No evidence links on this revision.</p>
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
        {cr.can.add_evidence && <AddEvidence path={path} revision={cr.revision} onDone={onDone} />}
      </div>
      {cr.revisions.length > 1 && (
        <details className="mt-1 text-[14px] text-zinc-500">
          <summary className="cursor-pointer">Revisions</summary>
          {cr.revisions.map((r) => (
            <div key={r.revision}>
              <p>
                Revision {r.revision} by {r.author.name} against version {r.base_version}, {when(r.created_at)}
                {r.note ? `: ${r.note}` : ""}
              </p>
              {r.snapshot && r.revision !== cr.revision && <SnapshotBox s={r.snapshot} />}
            </div>
          ))}
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {cr.can.approve && (
          <Btn disabled={act.busy} onClick={() => setMode(mode === "approve" ? "" : "approve")}>
            Approve
          </Btn>
        )}
        {cr.can.counter && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setMode(mode === "counter" ? "" : "counter")}>
            Suggest a change
          </Btn>
        )}
        {cr.can.reject && (
          <Btn kind="danger" disabled={act.busy} onClick={() => setMode(mode === "reject" ? "" : "reject")}>
            Reject
          </Btn>
        )}
        {cr.can.accept_counter && (
          <Btn disabled={act.busy} onClick={() => void doIt("accept_counter", { revision: cr.revision })}>
            Accept the change
          </Btn>
        )}
        {cr.can.withdraw && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void doIt("withdraw", { revision: cr.revision })}>
            Withdraw
          </Btn>
        )}
      </div>
      {mode === "approve" && (
        <div className="mt-3">
          {noEvidence && (
            <div className="mb-3 rounded-[10px] border border-amber-700 p-3 text-[14px] text-amber-800">
              <p className="font-medium">Approve without evidence?</p>
              <p>This revision has no evidence links. You can still approve it; the decision record and the audit log will say it was approved without evidence.</p>
            </div>
          )}
          <Field label="Note (optional, never sent to agents)">
            <TextArea rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Btn disabled={act.busy} onClick={() => void doIt("approve", { revision: cr.revision, note: text.trim() || null })}>
            {noEvidence ? `Approve without evidence as version ${cr.goal.version + 1}` : `Approve as version ${cr.goal.version + 1}`}
          </Btn>
        </div>
      )}
      {mode === "reject" && (
        <div className="mt-3">
          <Field label="Why you're rejecting">
            <TextArea rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Btn kind="danger" disabled={act.busy || !text.trim()} onClick={() => void doIt("reject", { reason: text.trim() })}>
            Reject
          </Btn>
        </div>
      )}
      {mode === "counter" && <CounterForm ws={ws} cr={cr} onDone={onDone} />}
      <Err>{act.error}</Err>
    </div>
  );
}

/** Titles of the goals this person can read, for dependency names in diffs. */
export function useGoalTitles(ws: string) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  return new Map((feed.data?.goals ?? []).map((g) => [g.id, g.title]));
}
