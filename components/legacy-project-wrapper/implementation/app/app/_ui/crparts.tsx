"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Btn, Err, Field, Input, num, Pill, Select, TextArea, usd, useAction, useApi, when } from "./kit";
import { LimitEditor, MeasuresEditor, limitsDraft, limitsOut, measuresDraft, measuresOut, sameLimits, type LimitDraft, type MeasureDraft } from "./goalform";
import { LIMIT_WORDS } from "./limits";
import type { AlignSnapshot, ChangeFields, ChangeRequest, Evidence, EvidenceKind, Goal } from "./types";

// Pieces a change request is shown with, shared by its open view (decide.tsx: understand, then decide) and its record
// (changes.tsx): field values in words, the before/after diff, the changes form (a proposal or an approver's counter),
// and evidence (the links people or agents say support the change, never verified, and Align's own snapshot).

export const CR_STATE_WORDS: Record<ChangeRequest["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested a change",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "withdrawn",
  superseded: "superseded",
};
export const crTone = (s: ChangeRequest["state"]) => (s === "approved" ? "green" : s === "pending" || s === "countered" ? "amber" : "neutral");

export const FIELD_LABEL: Record<keyof ChangeFields, string> = { title: "Goal", measures: "Measures", depends_on: "Depends on", status: "Status", limits: "Limits" };
export const STATUS_WORD: Record<Goal["status"], string> = { active: "Active", achieved: "Achieved", dropped: "Dropped" };

/** One field's value in plain words (dependencies by title when the person can see them). */
export function FieldValue({ k, v, titles }: { k: keyof ChangeFields; v: ChangeFields[keyof ChangeFields]; titles: Map<string, string> }) {
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
export function ChangesForm({
  ws,
  goal,
  start,
  keep = [],
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
  const [deps, setDeps] = useState<string[]>(start.depends_on ?? goal.depends_on ?? []);
  const [limits, setLimits] = useState<LimitDraft[]>(limitsDraft(start.limits ?? goal.limits ?? []));
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState("");
  const others = feed.data?.goals.filter((g) => g.id !== goal.id && (g.status === "active" || deps.includes(g.id))) ?? [];
  const out = measuresOut(measures);
  const changes: ChangeFields = {};
  if (title.trim() !== goal.title || keep.includes("title")) changes.title = title.trim();
  if (!sameMeasures(out, goal.measures) || keep.includes("measures")) changes.measures = out as Goal["measures"];
  if (status !== goal.status || keep.includes("status")) changes.status = status;
  if (!sameIds(deps, goal.depends_on ?? []) || keep.includes("depends_on")) changes.depends_on = deps;
  const limitsChanged = !sameLimits(limits, goal.limits ?? []);
  if (limitsChanged || keep.includes("limits")) changes.limits = limitsOut(limits) as Goal["limits"];
  const differs = title.trim() !== goal.title || !sameMeasures(out, goal.measures) || status !== goal.status || !sameIds(deps, goal.depends_on ?? []) || limitsChanged || keep.length > 0;
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
      {withCondition && (
        <Field label="Accept if… (optional condition the requester confirms)" hint="Never sent to agents, and never a gate on approval or launch. At most 2000 characters.">
          <TextArea rows={2} value={condition} maxLength={2000} onChange={(e) => setCondition(e.target.value)} />
        </Field>
      )}
      <Btn type="submit" disabled={busy || !differs || (noteRequired && !note.trim()) || !title.trim()}>
        {sendLabel}
      </Btn>
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
export function AddEvidence({ path, revision, onDone }: { path: string; revision: number; onDone: () => void }) {
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


/** The request's "Accept if…" condition: "Not confirmed yet" until the requester acknowledges it, then who and when.
 *  It is their statement; nothing here says verified. */
export function ConditionBox({ c, said }: { c: NonNullable<ChangeRequest["condition"]>; said: (p: { id: string; name: string } | null) => string }) {
  return (
    <div className="my-2 rounded-[10px] border border-zinc-200 p-2 text-[14px]" data-condition={c.acknowledged_by ? "acknowledged" : "open"}>
      <p>
        <span className="text-zinc-600">Accept if:</span> {c.text}
      </p>
      <p className={c.acknowledged_by ? "text-zinc-600" : "text-amber-800"}>
        {c.acknowledged_by ? `Acknowledged by ${said(c.acknowledged_by)}${c.acknowledged_at ? `, ${when(c.acknowledged_at)}` : ""}` : "Not confirmed yet"}
      </p>
    </div>
  );
}

/** Every revision with its author and note, under "Revisions" once there is more than one. */
export function Revisions({ cr }: { cr: ChangeRequest }) {
  if (cr.revisions.length < 2) return null;
  return (
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
