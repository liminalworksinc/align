"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, Btn, Card, Err, Field, go, Input, Note, Pill, Select, TextArea, useAction, useApi } from "./kit";
import type { Goal, Limit, WsDetail } from "./types";

// A goal's limits in the web app (PORT-002): the chips on the Goals tab, the Limits card on the goal page, the limit
// editor of the goal forms (re-exported by goalform.tsx with the other editors), and "Paste meeting notes", which
// suggests limits from notes and turns them into a new version (the goal's owner) or a change request (anyone else).
// Limits are goal content: nothing here saves one except a new version or a change request its approvers approve.

export type LimitDraft = { id?: string; type: "must" | "must_not" | "out_of_scope"; text: string; source_title: string; source_date: string; source_kind?: "meeting" | "manual" };

export const LIMIT_WORDS: Record<Limit["type"], string> = { must: "Must", must_not: "Must not", out_of_scope: "Out of scope" };
const LIMITS_MAX = 5;
const today = () => new Date().toISOString().slice(0, 10);
const EXAMPLE = "No limits found. Write them as rules, like “The three models must not all fit on the GPU.”";

export const limitsDraft = (ls: Limit[] = []): LimitDraft[] =>
  ls.map((l) => ({ id: l.id, type: l.type, text: l.text, source_title: l.source?.title ?? "", source_date: l.source?.date ?? "", source_kind: l.source?.kind }));

/** The limits to send: empty rows left out; a source only when it has a date. */
export const limitsOut = (d: LimitDraft[]) =>
  d
    .filter((x) => x.text.trim())
    .map((x) => ({
      ...(x.id ? { id: x.id } : {}),
      type: x.type,
      text: x.text.trim(),
      source: x.source_date ? { kind: x.source_kind ?? (x.source_title.trim() ? "meeting" : "manual"), title: x.source_title.trim(), date: x.source_date } : null,
    }));

/** True when the drafts say exactly the goal's limits (same ids, types, words and sources, in order). */
export const sameLimits = (d: LimitDraft[], ls: Limit[]) =>
  JSON.stringify(limitsOut(d).map((l) => [l.id ?? null, l.type, l.text, l.source])) === JSON.stringify(ls.map((l) => [l.id, l.type, l.text, l.source]));

const sourceWords = (l: Limit) => (l.source ? `${l.source.title ? `${l.source.title}, ` : l.source.kind === "manual" ? "written in Align, " : ""}${l.source.date}` : "");

/** Up to 5 limit chips under a goal on the Goals tab. */
export function LimitChips({ goal }: { goal: Goal }) {
  const ls = goal.limits ?? [];
  if (!ls.length) return null;
  return (
    <ul aria-label={`Limits of ${goal.title}`} className="mt-1 flex flex-wrap gap-2">
      {ls.slice(0, LIMITS_MAX).map((l) => (
        <li key={l.id} className="text-[14px] text-zinc-700">
          <Pill tone={l.type === "must_not" ? "red" : l.type === "must" ? "violet" : "neutral"}>{LIMIT_WORDS[l.type]}</Pill> {l.text}
        </li>
      ))}
    </ul>
  );
}

// "Add to a new version" hands the chosen limits to the goal page's new-version form: kept for this tab only
// (sessionStorage), so the form picks them up when the goal page opens, or at once when it is already open.
const STASH = (goalId: string) => `align.limits.${goalId}`;
const STASH_EVENT = "align:limits-stashed";

function stashVersionLimits(goalId: string, d: LimitDraft[]) {
  try {
    sessionStorage.setItem(STASH(goalId), JSON.stringify(d));
  } catch {}
  window.dispatchEvent(new CustomEvent(STASH_EVENT, { detail: goalId }));
}

/** The new-version form takes limits stashed for this goal (once), and scrolls itself into view. */
export function useStashedLimits(goalId: string, apply: (d: LimitDraft[]) => void) {
  useEffect(() => {
    const take = () => {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(STASH(goalId));
        sessionStorage.removeItem(STASH(goalId));
      } catch {}
      if (!raw) return;
      try {
        const d = JSON.parse(raw) as LimitDraft[];
        if (Array.isArray(d)) {
          apply(d);
          document.getElementById("new-version")?.scrollIntoView({ block: "start" });
        }
      } catch {}
    };
    take();
    const on = (e: Event) => (e as CustomEvent<string>).detail === goalId && take();
    window.addEventListener(STASH_EVENT, on);
    return () => window.removeEventListener(STASH_EVENT, on);
  }, [goalId, apply]);
}

/** The goal page's Limits card (the current version's limits, and "Suggest a limit"). */
export function GoalLimits({ ws, goal, canEdit, onDone }: { ws: string; goal: Goal; canEdit: boolean; onDone: () => void }) {
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const [suggesting, setSuggesting] = useState(false);
  const ls = goal.limits ?? [];
  const member = !!detail.data && detail.data.role !== "viewer";
  const canPropose = member && !canEdit && goal.owner.id !== detail.data?.me && goal.status === "active";
  return (
    <Card title="Limits">
      {ls.length === 0 ? (
        <Note>No limits on this version.</Note>
      ) : (
        <ul className="mb-2 text-[15px]">
          {ls.map((l) => (
            <li key={l.id} className="py-1">
              <Pill tone={l.type === "must_not" ? "red" : l.type === "must" ? "violet" : "neutral"}>{LIMIT_WORDS[l.type]}</Pill> {l.text}
              {l.source && <span className="text-[13px] text-zinc-500"> ({sourceWords(l)})</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mb-2 text-[14px] text-zinc-500">
        Limits are part of the goal: they change only through a new version, and agents of sessions bound to this goal get them with it as context set by the people who approve it.
        {canEdit && " Edit them in New version below."}
      </p>
      {canPropose && !suggesting && (
        <div className="mb-2">
          <Btn kind="secondary" onClick={() => setSuggesting(true)}>
            Suggest a limit
          </Btn>
        </div>
      )}
      {canPropose && suggesting && <SuggestLimit ws={ws} goal={goal} onClose={() => setSuggesting(false)} onDone={onDone} />}
      {member && goal.status === "active" && <NotesSuggest ws={ws} preferGoalId={goal.id} onDone={onDone} />}
    </Card>
  );
}

/** A change request that adds limits: the goal's limits plus the new ones, for its approval set to decide. */
function SuggestLimit({ ws, goal, onClose, onDone }: { ws: string; goal: Goal; onClose: () => void; onDone: () => void }) {
  const [limits, setLimits] = useState<LimitDraft[]>(() => [...limitsDraft(goal.limits), { type: "must_not", text: "", source_title: "", source_date: "" }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const act = useAction();
  const changed = !sameLimits(limits, goal.limits ?? []);
  return (
    <form
      className="mb-3 rounded-[12px] border border-zinc-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void act.run(async () => {
          try {
            await api(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests`, { body: { base_version: goal.version, changes: { limits: limitsOut(limits) }, reason: reason.trim() } });
            onClose();
            onDone();
          } catch (err) {
            if (err instanceof ApiError) setError({ code: err.code, message: err.message });
            else throw err;
          }
        });
      }}
    >
      <p className="mb-2 text-[14px] text-zinc-600">This sends a change request. The goal&apos;s owner or a lead of its team decides; once approved the limits are part of version {goal.version + 1}.</p>
      <LimitEditor value={limits} onChange={setLimits} />
      <Field label="Why this limit" hint="Never sent to agents. 1 to 2000 characters.">
        <TextArea rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} required />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" disabled={act.busy || !changed || !reason.trim()}>
          Send for approval
        </Btn>
        <Btn kind="secondary" onClick={onClose}>
          Cancel
        </Btn>
      </div>
      {error?.code === "already_open" ? (
        <Err>
          You already have an open change request on this goal. <a href="#change-requests" className="underline">See it below.</a>
        </Err>
      ) : (
        <Err>{error?.message ?? null}</Err>
      )}
      <Err>{act.error}</Err>
    </form>
  );
}

/** Edits a version's limits (type, text, source), at most 5. */
export function LimitEditor({ value, onChange }: { value: LimitDraft[]; onChange: (v: LimitDraft[]) => void }) {
  const set = (i: number, patch: Partial<LimitDraft>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="mb-3">
      <span className="mb-1 block text-[14px] text-zinc-600">Limits (what work toward this goal must do, must not do, or leaves out of scope; at most {LIMITS_MAX})</span>
      {value.map((l, i) => (
        <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[150px_1fr]">
          <Select aria-label={`Limit ${i + 1} kind`} value={l.type} onChange={(e) => set(i, { type: e.target.value as LimitDraft["type"] })}>
            <option value="must">{LIMIT_WORDS.must}</option>
            <option value="must_not">{LIMIT_WORDS.must_not}</option>
            <option value="out_of_scope">{LIMIT_WORDS.out_of_scope}</option>
          </Select>
          <Input aria-label={`Limit ${i + 1}`} placeholder="The three models must not all fit on the GPU" value={l.text} maxLength={160} onChange={(e) => set(i, { text: e.target.value })} />
          <span className="hidden sm:block" />
          <div className="grid grid-cols-[1fr_160px_auto] gap-2">
            <Input aria-label={`Limit ${i + 1} meeting`} placeholder="Where it was said (optional)" value={l.source_title} maxLength={120} onChange={(e) => set(i, { source_title: e.target.value, source_kind: undefined })} />
            <Input aria-label={`Limit ${i + 1} date`} type="date" value={l.source_date} onChange={(e) => set(i, { source_date: e.target.value })} />
            <Btn kind="secondary" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove limit
            </Btn>
          </div>
        </div>
      ))}
      {value.length < LIMITS_MAX && (
        <Btn kind="secondary" onClick={() => onChange([...value, { type: "must_not", text: "", source_title: "", source_date: "" }])}>
          Add a limit
        </Btn>
      )}
    </div>
  );
}

interface Suggestion {
  type: Limit["type"];
  text: string;
  quote: string;
  source: NonNullable<Limit["source"]>;
  already: string | null;
}
interface GoalSuggestions {
  goal: { id: string; title: string; version: number };
  can_edit: boolean;
  can_propose: boolean;
  limits: Suggestion[];
}

const draftOf = (s: Suggestion): LimitDraft => ({ type: s.type, text: s.text, source_title: s.source.title, source_date: s.source.date, source_kind: s.source.kind });

/** One goal's suggestions: pick some, then add them to a new version (owner) or propose them (anyone else). */
function GoalGroup({ ws, group, title, date, onDone }: { ws: string; group: GoalSuggestions; title: string; date: string; onDone?: () => void }) {
  const [chosen, setChosen] = useState<boolean[]>(() => group.limits.map((l) => !l.already));
  const [sent, setSent] = useState(false);
  const act = useAction();
  const picked = group.limits.filter((_, i) => chosen[i]).map(draftOf);
  const goalPath = `/app/w/${ws}/goals/${group.goal.id}`;
  const withCurrent = async () => {
    const { goal } = await api<{ goal: Goal }>(`/api/v2/workspaces/${ws}/goals/${group.goal.id}`);
    const all = [...limitsDraft(goal.limits), ...picked];
    if (all.length > LIMITS_MAX) throw new Error(`A goal keeps at most ${LIMITS_MAX} limits and this one has ${goal.limits.length}. Choose fewer, or remove one first.`);
    return { goal, all };
  };
  return (
    <div className="mb-3 rounded-[12px] border border-zinc-200 p-3">
      <p className="mb-1 text-[15px]">
        <Link href={goalPath} className="font-medium text-zinc-900 underline">
          {group.goal.title}
        </Link>
      </p>
      <ul>
        {group.limits.map((l, i) => (
          <li key={i} className="py-1 text-[15px]">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={chosen[i]} onChange={(e) => setChosen((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
              <span>
                <Pill tone={l.type === "must_not" ? "red" : l.type === "must" ? "violet" : "neutral"}>{LIMIT_WORDS[l.type]}</Pill> {l.text}
                {l.already && <span className="text-[13px] text-zinc-500"> (the goal already has a limit like this)</span>}
                <span className="block text-[13px] text-zinc-500">Said: “{l.quote}”</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {sent ? (
        <Note>
          Proposed. The goal&apos;s owner or a lead of its team decides on the <Link href={`/app/w/${ws}/requests`} className="underline">Requests</Link> tab.
        </Note>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {group.can_edit && (
            <Btn
              disabled={act.busy || !picked.length}
              onClick={() =>
                void act.run(async () => {
                  const { all } = await withCurrent();
                  stashVersionLimits(group.goal.id, all);
                  if (window.location.pathname !== goalPath) go(`${goalPath}#new-version`);
                })
              }
            >
              Add to a new version
            </Btn>
          )}
          {group.can_propose && (
            <Btn
              disabled={act.busy || !picked.length}
              onClick={() =>
                void act.run(async () => {
                  const { goal, all } = await withCurrent();
                  const reason = `Limits from ${title.trim() || "pasted notes"}, ${date}`;
                  await api(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests`, { body: { base_version: goal.version, changes: { limits: limitsOut(all) }, reason } });
                  setSent(true);
                }, onDone)
              }
            >
              Propose these limits
            </Btn>
          )}
        </div>
      )}
      <Err>{act.error}</Err>
    </div>
  );
}

/** "Paste meeting notes" (members and owners): suggestions grouped by goal, each proposed or added to a new version.
 *  `preferGoalId` is the goal page it was opened from. */
export function NotesSuggest({ ws, preferGoalId, onDone }: { ws: string; preferGoalId?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<{ suggestions: GoalSuggestions[]; dropped: number; title: string; date: string } | null>(null);
  const act = useAction();
  const body = (
    <>
      <p className="mb-2 text-[14px] text-zinc-500">
        Align picks out sentences like “must”, “must not” and “out of scope”, matches each to a goal you can see, and shows them here. Nothing is saved until the goal&apos;s owner adds them to a new version, or you propose them and someone who approves for the goal agrees.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            const r = await api<{ suggestions: GoalSuggestions[]; dropped: number }>(`/api/v2/workspaces/${ws}/limits/suggest`, {
              body: { notes, source: { title: title.trim(), date }, ...(preferGoalId ? { prefer_goal_id: preferGoalId } : {}) },
            });
            setResult({ ...r, title, date });
          });
        }}
      >
        <Field label="Notes, or one limit">
          <TextArea rows={5} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} required />
        </Field>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <Field label="Meeting (optional)">
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <Btn type="submit" disabled={act.busy || !notes.trim() || !date}>
          Suggest limits
        </Btn>
      </form>
      <Err>{act.error}</Err>
      {result && (
        <div className="mt-3" aria-label="Suggested limits">
          {result.suggestions.length === 0 && <Note>{EXAMPLE}</Note>}
          {result.suggestions.map((g) => (
            <GoalGroup key={`${g.goal.id}:${result.date}:${result.title}`} ws={ws} group={g} title={result.title} date={result.date} onDone={onDone} />
          ))}
          {result.dropped > 0 && (
            <Note>
              {result.dropped} more {result.dropped === 1 ? "sentence reads" : "sentences read"} like a limit but didn&apos;t clearly belong to one goal you can see.
            </Note>
          )}
        </div>
      )}
    </>
  );
  if (preferGoalId) {
    // On the goal page it sits inside the Limits card, folded away until opened.
    if (!open)
      return (
        <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-semibold text-violet-700 hover:underline">
          Paste meeting notes
        </button>
      );
    return <div className="mt-2 rounded-[12px] border border-zinc-300 p-3">{body}</div>;
  }
  return (
    <Card title="Paste meeting notes">
      {open ? (
        body
      ) : (
        <Btn kind="secondary" onClick={() => setOpen(true)}>
          Paste meeting notes
        </Btn>
      )}
    </Card>
  );
}
