"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, Btn, Err, Field, Input, num, Pill, Select, sentence, TextArea, usd, useAction, useApi, when } from "./kit";
import { LimitEditor, MeasuresEditor, limitsDraft, limitsOut, measuresDraft, measuresOut, sameLimits, type LimitDraft, type MeasureDraft } from "./goalform";
import { LIMIT_WORDS } from "./limits";
import type { AlignSnapshot, ChangeFields, ChangeRequest, Evidence, EvidenceKind, Goal } from "./types";
import { counterSameAsBase, counterSameAsRequest, hiddenGoals, withHidden } from "@/lib/v2/change-words.mts";
import { count } from "@/lib/v2/plural.mts";

// Pieces a change request is shown with, shared by its open view (decide.tsx: understand, then decide) and its record
// (changes.tsx): field values in words, the before/after diff, the changes form (a proposal or an approver's counter),
// and evidence (the links people or agents say support the change, never verified, and Align's own snapshot).

export const CR_STATE_WORDS: Record<ChangeRequest["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested a change",
  approved: "approved",
  rejected: "declined", // the state is "rejected"; the app says what the button did, as for target changes and alignments
  withdrawn: "withdrawn",
  superseded: "superseded",
};
export const crTone = (s: ChangeRequest["state"]) => (s === "approved" ? "green" : s === "pending" || s === "countered" ? "amber" : "neutral");

export const FIELD_LABEL: Record<keyof ChangeFields, string> = { title: "Goal", measures: "Measures", depends_on: "Depends on", status: "Status", limits: "Limits" };
export const STATUS_WORD: Record<Goal["status"], string> = { active: "Active", achieved: "Achieved", dropped: "Dropped" };

// Dependencies the reader can't read, counted and never named: the same words as the value card and the MCP decision
// record (lib/v2/change-words.mts).
export { hiddenGoals, withHidden };

/** One field's value in plain words (dependencies by title when the person can see them; `hidden` counts the ones they
 *  can't, so a dependency they can't see never reads as "Nothing"). */
export function FieldValue({ k, v, titles, hidden = 0 }: { k: keyof ChangeFields; v: ChangeFields[keyof ChangeFields]; titles: Map<string, string>; hidden?: number }) {
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
    const names = (v as string[]).map((id) => titles.get(id) ?? "a goal");
    return <span>{names.length || hidden > 0 ? withHidden(names, hidden) : "Nothing"}</span>;
  }
  if (k === "status") return <span>{STATUS_WORD[v as Goal["status"]] ?? String(v)}</span>;
  if (k === "limits") {
    const ls = v as Goal["limits"];
    if (!ls.length) return <span className="text-zinc-500">No limits</span>;
    return (
      <ul className="list-disc pl-5">
        {ls.map((l, i) => (
          <li key={`${l.id}-${i}`}>
            {LIMIT_WORDS[l.type]}: {l.text}
          </li>
        ))}
      </ul>
    );
  }
  return <span>{String(v)}</span>;
}

export function Diff({ cr, titles }: { cr: ChangeRequest; titles: Map<string, string> }) {
  const keys = (Object.keys(FIELD_LABEL) as (keyof ChangeFields)[]).filter((k) => k in cr.diff.after || k in cr.diff.before);
  if (!keys.length) return null;
  return (
    <div className="my-2 grid gap-2">
      {keys.map((k) => (
        <div key={k} className="grid gap-2 rounded-[10px] bg-zinc-50 p-2 text-[14px] sm:grid-cols-[120px_1fr_1fr]">
          <span className="text-zinc-600">{FIELD_LABEL[k]}</span>
          <div>
            <span className="block text-[12px] text-zinc-500">Before</span>
            <FieldValue k={k} v={cr.diff.before[k]} titles={titles} hidden={cr.diff.hidden_depends_on?.before} />
          </div>
          <div>
            <span className="block text-[12px] text-zinc-500">After</span>
            <FieldValue k={k} v={cr.diff.after[k]} titles={titles} hidden={cr.diff.hidden_depends_on?.after} />
          </div>
        </div>
      ))}
    </div>
  );
}

const sameMeasures = (a: { id?: string; text: string; target: string | null }[], b: Goal["measures"]) =>
  JSON.stringify(a.map((m) => [m.id ?? null, m.text, m.target ?? null])) === JSON.stringify(b.map((m) => [m.id, m.text, m.target ?? null]));
const sameIds = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
/** Whether a field's value as the form would send it is the value it already has (so sending it changes nothing). */
function sameField(k: keyof ChangeFields, a: ChangeFields[keyof ChangeFields], b: ChangeFields[keyof ChangeFields]): boolean {
  if (k === "depends_on") return sameIds((a as string[] | undefined) ?? [], (b as string[] | undefined) ?? []);
  if (k === "measures") {
    const m = (v: unknown) => JSON.stringify(((v as Goal["measures"] | undefined) ?? []).map((x) => [x.id ?? null, x.text, x.target ?? null]));
    return m(a) === m(b);
  }
  if (k === "limits") {
    const l = (v: unknown) => JSON.stringify(((v as Goal["limits"] | undefined) ?? []).map((x) => [x.id ?? null, x.type, x.text, x.source ?? null]));
    return l(a) === l(b);
  }
  return a === b;
}

/** Goal, measures, Status and Depends on, pre-filled from `start`. `onSend` gets only the fields that differ from
 *  `goal` (plus any in `keep`, for a counter that restates the request's fields). `hiddenDeps` counts the dependencies
 *  the person can't see, which the server keeps (the form says so); `choices`, when given, are the only goals offered
 *  as a new dependency (the ones everyone who decides can see), besides those already on the list; `notOfferedWho`
 *  names who can't see the others ("someone who decides on this goal", or for a counter the requester too). Each goal
 *  that isn't offered is left out for one reason, counted once (C7-1). Sending is offered only while what would be sent
 *  changes something: compared with `base` (a counter: the request's base version, every field, exactly what the server
 *  compares it with, also on a request behind its goal; C8-2) or else `goal`, plus `hiddenChange` (the request changes
 *  dependencies the person can't see, which a counter keeps). A counter whose only change was a dependency that would
 *  loop has nothing left to send, and says so, pointing to Decline (C7-2); one that is the request's base says so next to
 *  the disabled button (W3); and one identical to the request, with no condition, is no suggestion: it says to approve
 *  instead (W4). Each reason is the server's own wording for the refusal (lib/v2/change-words.mts). */
export function ChangesForm({
  ws,
  goal,
  start,
  keep = [],
  hiddenDeps = 0,
  choices = null,
  notOfferedWho = "someone who decides on this goal",
  loops = null,
  base = null,
  versions,
  hiddenChange = false,
  requesterName,
  noteLabel,
  noteRequired,
  withCondition = false,
  sendLabel,
  busy,
  onSend,
}: {
  ws: string;
  goal: Goal;
  start: ChangeFields;
  keep?: (keyof ChangeFields)[];
  hiddenDeps?: number;
  choices?: string[] | null;
  notOfferedWho?: string;
  /** Goals left out of `choices` because they already depend on this goal (a loop), counted on their own (C3-3). */
  loops?: string[] | null;
  /** A counter: the request's base version (every field; dependencies the person can see), which the sent fields are
   *  compared with to tell whether sending changes anything, and with `start` what the request asks for. */
  base?: Required<ChangeFields> | null;
  /** A counter: the request's base version and the goal's version now, for the reasons' words. */
  versions?: { base: number; goal: number };
  hiddenChange?: boolean;
  /** A counter's requester, named where the form says there is nothing left to suggest. */
  requesterName?: string;
  noteLabel: string;
  noteRequired: boolean;
  /** Offer the "Accept if…" condition (an approver's counter). */
  withCondition?: boolean;
  sendLabel: string;
  busy: boolean;
  onSend: (changes: ChangeFields, note: string, condition: string) => void;
}) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [title, setTitle] = useState(start.title ?? goal.title);
  const [status, setStatus] = useState<Goal["status"]>(start.status ?? goal.status);
  const [measures, setMeasures] = useState<MeasureDraft[]>(measuresDraft({ ...goal, measures: start.measures ?? goal.measures }));
  // A dependency the request has that now depends on this goal would close a loop, which the server refuses (409 cycle):
  // the counter form leaves it unticked and unoffered, and says so (C6-1). A goal's own dependencies never loop.
  const [looped] = useState<string[]>(() => (start.depends_on ?? []).filter((id) => loops?.includes(id)));
  const [startDeps] = useState<string[]>(() => (start.depends_on ?? goal.depends_on ?? []).filter((id) => !looped.includes(id)));
  const [deps, setDeps] = useState<string[]>(startDeps);
  const [limits, setLimits] = useState<LimitDraft[]>(limitsDraft(start.limits ?? goal.limits ?? []));
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState("");
  const listed = feed.data?.goals.filter((g) => g.id !== goal.id && (g.status === "active" || deps.includes(g.id))) ?? [];
  // A goal someone who decides can't see would be refused as a new dependency, so it isn't offered (C2 F5).
  const offered = (id: string) => !choices || choices.includes(id) || startDeps.includes(id);
  // Why a listed goal isn't offered, decided once so no goal is explained (or counted) twice (C7-1): the request's own
  // dependency that would loop (named below), a goal that would loop if added, or one someone who decides can't see.
  const leftOut = (id: string): "dropped" | "looping" | "hidden" | null => (offered(id) ? null : looped.includes(id) ? "dropped" : loops?.includes(id) ? "looping" : "hidden");
  const others = listed.filter((g) => offered(g.id));
  const looping = listed.filter((g) => leftOut(g.id) === "looping").length;
  const titleOf = (id: string) => `“${feed.data?.goals.find((g) => g.id === id)?.title ?? "a goal"}”`;
  const notOffered = listed.filter((g) => leftOut(g.id) === "hidden").length;
  const them = (n: number) => (n === 1 ? "it" : "them");
  const out = measuresOut(measures);
  const changes: ChangeFields = {};
  if (title.trim() !== goal.title || keep.includes("title")) changes.title = title.trim();
  if (!sameMeasures(out, goal.measures) || keep.includes("measures")) changes.measures = out as Goal["measures"];
  if (status !== goal.status || keep.includes("status")) changes.status = status;
  if (!sameIds(deps, goal.depends_on ?? []) || keep.includes("depends_on") || looped.length) changes.depends_on = deps;
  const limitsChanged = !sameLimits(limits, goal.limits ?? []);
  if (limitsChanged || keep.includes("limits")) changes.limits = limitsOut(limits) as Goal["limits"];
  // Would sending change anything? Each field sent against the value it would replace: for a counter the request's base
  // version, as the server compares it (409 no_change otherwise), so a counter that only restates nothing is never
  // offered, also on a request behind its goal (C8-2).
  const sent = Object.keys(changes) as (keyof ChangeFields)[];
  const differs = hiddenChange || sent.some((k) => !sameField(k, changes[k], (base ?? (goal as ChangeFields))[k]));
  const nothingLeft = !differs && looped.length > 0;
  // A counter asking for exactly what the request asks (every field it sends against the request's own values), with
  // no condition: the server refuses it 409 no_change, approve instead (W4).
  const asked: ChangeFields | null = base ? { ...base, ...start } : null;
  const sameAsRequest = !!asked && differs && !condition.trim() && sent.every((k) => sameField(k, changes[k], asked[k]));
  const v = versions ?? { base: goal.version, goal: goal.version };
  const why = !base || nothingLeft ? null : !differs ? counterSameAsBase(v.base, v.goal) : sameAsRequest ? counterSameAsRequest(requesterName ?? "the requester", v.base, v.goal) : null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(changes, note.trim(), condition.trim());
      }}
    >
      <Field label="Goal">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </Field>
      <MeasuresEditor value={measures} onChange={setMeasures} />
      <LimitEditor value={limits} onChange={setLimits} />
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
          <option value="active">Active</option>
          <option value="achieved">Achieved</option>
          <option value="dropped">Dropped</option>
        </Select>
      </Field>
      {(others.length > 0 || hiddenDeps > 0 || notOffered > 0 || looping > 0 || looped.length > 0) && (
        <div className="mb-3">
          <p className="mb-1 text-[14px] text-zinc-600">Depends on</p>
          {others.map((g) => (
            <label key={g.id} className="mb-1 flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={deps.includes(g.id)} onChange={(e) => setDeps((d) => (e.target.checked ? [...d, g.id] : d.filter((x) => x !== g.id)))} />
              {g.title}
            </label>
          ))}
          {hiddenDeps > 0 && (
            <p className="text-[14px] text-zinc-500" data-hidden-deps>
              Also depends on {hiddenGoals(hiddenDeps)}. Sending keeps {them(hiddenDeps)}; only someone who can see {them(hiddenDeps)} can remove {them(hiddenDeps)}.
            </p>
          )}
          {notOffered > 0 && (
            <p className="text-[14px] text-zinc-500" data-deps-not-offered>
              {notOffered === 1 ? "1 goal you can see isn't offered" : `${notOffered} goals you can see aren't offered`}: {notOfferedWho} can&apos;t see {them(notOffered)}.
            </p>
          )}
          {looping > 0 && (
            <p className="text-[14px] text-zinc-500" data-deps-looping>
              {looping === 1 ? "1 goal isn't offered: it already depends on this goal" : `${looping} goals aren't offered: they already depend on this goal`}, so adding {them(looping)} would make a loop.
            </p>
          )}
          {looped.length > 0 && feed.data && (
            <p className="text-[14px] text-zinc-500" data-deps-loop-dropped>
              {looped.length === 1
                ? `The request's dependency on ${titleOf(looped[0])} is left out: it already depends on this goal`
                : `The request's dependencies on ${looped.map(titleOf).join(", ")} are left out: they already depend on this goal`}
              , so keeping {them(looped.length)} would make a loop.
            </p>
          )}
        </div>
      )}
      <Field label={noteLabel} hint="Never sent to agents. 1 to 2000 characters.">
        <TextArea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} required={noteRequired} />
      </Field>
      {withCondition && (
        <Field label="Accept if… (optional condition the requester confirms)" hint="Never sent to agents, and never a gate on approval or launch. At most 2000 characters.">
          <TextArea rows={2} value={condition} maxLength={2000} onChange={(e) => setCondition(e.target.value)} />
        </Field>
      )}
      {nothingLeft && feed.data && (
        <p className="mb-2 text-[15px] text-zinc-700" data-counter-nothing-left>
          Without {looped.length === 1 ? `its dependency on ${titleOf(looped[0])}` : "the dependencies that would make a loop"}, this request changes nothing, so there is nothing left to
          suggest. To close it, choose <strong>Decline</strong> above{requesterName ? ` (or ${requesterName} can withdraw it)` : ""}; to suggest something else, change a field
          here.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Btn type="submit" disabled={busy || !differs || sameAsRequest || (noteRequired && !note.trim()) || !title.trim()}>
          {sendLabel}
        </Btn>
        {why && (
          <p className="min-w-0 text-[14px] text-zinc-600" data-counter-reason>
            {why}
          </p>
        )}
      </div>
    </form>
  );
}

// ---- evidence: links people or agents say support the change (never verified), and Align's own snapshot ----

export const KIND_WORD: Record<EvidenceKind, string> = { pr: "Pull request", ci_run: "CI run", incident: "Incident", dashboard: "Dashboard", doc: "Doc", other: "Link" };

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** One link: kind, label (opens in a new tab, no referrer), its host, who added it and how it was reported. */
export function EvidenceItem({ e, me, busy, onRemove }: { e: Evidence; me: string; busy: boolean; onRemove: (id: string) => void }) {
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

/** Remove one of the reader's own links. A 409 (the request was decided, withdrawn or moved on meanwhile, in another tab)
 *  is refused as adding one is (C8-1): the card's focused "Not recorded. <the server's message>", and the card reloads to
 *  show the request as it is now (c9 W1). Other errors throw, for the card's own error line. */
export async function removeEvidence(path: string, id: string, setNotice: (n: Notice | null) => void, onDone: () => void) {
  setNotice(null);
  try {
    await api(`${path}/evidence/${id}`, { method: "DELETE" });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 409) throw e;
    setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
  }
  onDone();
}

/** "Recorded by Align at revision N": the goal's spend over 30 days, bound sessions and last activity. */
export function SnapshotBox({ s }: { s: AlignSnapshot }) {
  const models = s.spend?.by_model ?? [];
  return (
    <div className="my-2 rounded-[10px] bg-zinc-50 p-2 text-[14px] text-zinc-700">
      <p className="text-[12px] text-zinc-500">
        Recorded by Align at revision {s.revision}, {when(s.recorded_at)}
      </p>
      <p>
        {s.spend ? (
          <>
            Spend on this goal in the last {s.window.days} days: {usd(s.spend.total.est_list_usd_micros)} estimated at list price, {count(s.spend.total.requests, "request", undefined, num)}
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

/** A link that can no longer become an https one as it is typed (so "htt" is fine, "http://x" is not). */
const notHttps = (url: string) => {
  const u = url.trim().toLowerCase();
  return !!u && !u.startsWith("https://") && !"https://".startsWith(u);
};

/** Add a link to the current revision (the requester, or someone who can approve, while the request is open). A 409 (the
 *  request was decided or moved on meanwhile, or the link is already there) is refused like any decision: the card's
 *  focused "Not recorded. <the server's message>", and the card reloads to show the request as it is now (C8-1). */
export function AddEvidence({ path, revision, onDone, setNotice }: { path: string; revision: number; onDone: () => void; setNotice: (n: Notice | null) => void }) {
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
        const close = () => {
          setOpen(false);
          setUrl("");
          setLabel("");
          onDone();
        };
        void act.run(async () => {
          setNotice(null);
          try {
            await api(`${path}/evidence`, { body: { kind, url: url.trim(), label: label.trim(), revision } });
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 409) throw e;
            setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
          }
          close();
        });
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
      <Field label="Link (https)" hint={notHttps(url) ? "Use an https:// link: Align keeps only https links." : undefined}>
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


/** The request's "Accept if…" condition: "Not confirmed yet" until the requester acknowledges it, then who and when;
 *  "Never confirmed" once the request closed without it (`closed`: declined, withdrawn or superseded). It is their
 *  statement; nothing here says verified. */
export function ConditionBox({ c, said, closed }: { c: NonNullable<ChangeRequest["condition"]>; said: (p: { id: string; name: string } | null) => string; closed?: string }) {
  return (
    <div className="my-2 rounded-[10px] border border-zinc-200 p-2 text-[14px]" data-condition={c.acknowledged_by ? "acknowledged" : "open"}>
      <p>
        <span className="text-zinc-600">Accept if:</span> {c.text}
      </p>
      <p className={c.acknowledged_by || closed ? "text-zinc-600" : "text-amber-800"}>
        {c.acknowledged_by ? `Acknowledged by ${said(c.acknowledged_by)}${c.acknowledged_at ? `, ${when(c.acknowledged_at)}` : ""}` : closed ? `Never confirmed: the request was ${closed}` : "Not confirmed yet"}
      </p>
    </div>
  );
}

/** Every revision with its author and note, under "Revisions" once there is more than one. */
export function Revisions({ cr, me }: { cr: ChangeRequest; me: string }) {
  if (cr.revisions.length < 2) return null;
  return (
    <details className="mt-1 text-[14px] text-zinc-500">
      <summary className="cursor-pointer">Revisions</summary>
      {cr.revisions.map((r) => (
        <div key={r.revision}>
          <p>
            Revision {r.revision} by {r.author.id === me ? "you" : r.author.name} against version {r.base_version}, {when(r.created_at)}
            {r.note ? `: ${r.note}` : ""}
          </p>
          {r.snapshot && r.revision !== cr.revision && <SnapshotBox s={r.snapshot} />}
        </div>
      ))}
    </details>
  );
}

// ---- a decision's outcome, kept across the reload (and remount) that follows it ----

/** "done": recorded. "stale": the request changed before sending, so nothing was sent. "refused": the server said no. */
export type Notice = { kind: "done" | "stale" | "refused"; text: string };

const notices = new Map<string, { n: Notice; at: number }>();
/** How long a notice outlives its card: the reload after a decision can remount the card more than once (the list,
 *  then the goal page), and each mount shows it; later visits don't. */
const NOTICE_MS = 10_000;

/** Request `id`'s notice. Setting one also keeps it for the card's next mounts, since the reload after a decision
 *  re-keys (remounts) the card. */
export function useNotice(id: string): [Notice | null, (n: Notice | null) => void] {
  const [notice, setLocal] = useState<Notice | null>(() => {
    const e = notices.get(id);
    return e && Date.now() - e.at < NOTICE_MS ? e.n : null;
  });
  const set = useCallback(
    (n: Notice | null) => {
      if (n) notices.set(id, { n, at: Date.now() });
      else notices.delete(id);
      setLocal(n);
    },
    [id],
  );
  return [notice, set];
}

/** A decision's outcome. "Not recorded" ones are alerts and take focus, so a keyboard or screen reader user hears why. */
export function NoticeBox({ notice }: { notice: Notice }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (notice.kind !== "done") ref.current?.focus();
  }, [notice]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={notice.kind === "done" ? "status" : "alert"}
      data-notice={notice.kind}
      className={`mb-3 rounded-[10px] px-3 py-2 text-[15px] text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${notice.kind === "done" ? "border border-zinc-300 bg-zinc-50" : "border border-red-700 bg-red-50"}`}
    >
      {notice.text}
    </div>
  );
}
