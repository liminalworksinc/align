"use client";
import type { ReactNode } from "react";
import { changeWords, withHidden } from "@/lib/v2/change-words.mts";
import type { ChangeFields, Goal, Limit } from "../types";

// Version compare (LIM-2472 workstream S, item 4): a plan before and after, field by field, the changed parts marked.
// Built once for both concepts: B's decision detail and A's drawer import `Compare` with a change request's diff
// (GET …/change-requests/<id> → diff.before / diff.after, or two of its revisions' `changes`), and `VersionsCompare`
// with the goal page's version list (GET …/goals/<goal> → versions). Only what the reads return: a goal version row
// carries title, status and target share, so two goal versions compare on those three and say what isn't compared.

const FIELDS = ["title", "measures", "limits", "status", "depends_on"] as const;
type Field = (typeof FIELDS)[number];
const FIELD_LABEL: Record<Field, string> = { title: "Title", measures: "Measures", limits: "Limits", status: "Status", depends_on: "Depends on" };
const LIMIT_LABEL: Record<Limit["type"], string> = { must: "Must", must_not: "Must not", out_of_scope: "Out of scope" };
const STATUS_LABEL: Record<Goal["status"], string> = { active: "Active", achieved: "Achieved", dropped: "Dropped" };

type Mark = "added" | "removed" | "changed" | null;

const MARK_WORD = { added: "Added", removed: "Removed", changed: "Changed" } as const;

/** Said in words, never by colour alone: a small bordered label in the text colours. */
function MarkTag({ m }: { m: Mark }) {
  if (!m) return null;
  return (
    <span data-mark-label={m} className={`shrink-0 rounded-(--radius-s) border px-1.5 text-[12px] leading-5 font-medium ${m === "removed" ? "border-(--edge) text-(--text-2)" : "border-(--accent-text) text-(--accent-text)"}`}>
      {MARK_WORD[m]}
    </span>
  );
}

function Item({ m, children }: { m: Mark; children: ReactNode }) {
  return (
    <li
      data-mark={m ?? "same"}
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-(--radius-s) px-2 py-1 text-[14px] [overflow-wrap:anywhere] ${
        m === "removed" ? "text-(--text-2) line-through decoration-(--edge)" : m ? "bg-(--accent-soft) text-(--text-1)" : "text-(--text-2)"
      }`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <MarkTag m={m} />
    </li>
  );
}

const None = () => <p className="px-2 py-1 text-[14px] text-(--text-3)">None</p>;

/** One side of one field. `other` is the opposite side, to mark what was added, removed or changed. */
function Side({ field, v, other, side, titleOf, hidden }: { field: Field; v: unknown; other: unknown; side: "before" | "after"; titleOf: (id: string) => string; hidden: number }) {
  if (field === "measures") {
    const list = (Array.isArray(v) ? v : []) as Goal["measures"];
    const o = (Array.isArray(other) ? other : []) as Goal["measures"];
    if (!list.length) return <None />;
    return (
      <ul className="flex flex-col gap-0.5">
        {list.map((m) => {
          const twin = o.find((x) => x.id === m.id);
          const mark: Mark = !twin ? (side === "after" ? "added" : "removed") : twin.text !== m.text || (twin.target ?? null) !== (m.target ?? null) ? (side === "after" ? "changed" : null) : null;
          return (
            <Item key={m.id} m={mark}>
              {m.text}
              {m.target ? <span className="text-(--text-3)"> · target {m.target}</span> : null}
            </Item>
          );
        })}
      </ul>
    );
  }
  if (field === "limits") {
    const list = (Array.isArray(v) ? v : []) as Limit[];
    const o = (Array.isArray(other) ? other : []) as Limit[];
    if (!list.length) return <None />;
    return (
      <ul className="flex flex-col gap-0.5">
        {list.map((l) => {
          const twin = o.find((x) => x.id === l.id);
          const mark: Mark = !twin ? (side === "after" ? "added" : "removed") : twin.text !== l.text || twin.type !== l.type ? (side === "after" ? "changed" : null) : null;
          return (
            <Item key={l.id} m={mark}>
              <span className="font-medium">{LIMIT_LABEL[l.type] ?? l.type}:</span> {l.text}
            </Item>
          );
        })}
      </ul>
    );
  }
  if (field === "depends_on") {
    const list = (Array.isArray(v) ? v : []) as string[];
    const o = (Array.isArray(other) ? other : []) as string[];
    if (!list.length && !hidden) return <None />;
    return (
      <ul className="flex flex-col gap-0.5">
        {list.map((id) => (
          <Item key={id} m={o.includes(id) ? null : side === "after" ? "added" : "removed"}>
            {titleOf(id)}
          </Item>
        ))}
        {hidden > 0 && <Item m={null}>{withHidden([], hidden)}</Item>}
      </ul>
    );
  }
  const text = field === "status" ? (STATUS_LABEL[v as Goal["status"]] ?? String(v ?? "")) : String(v ?? "");
  if (!text) return <None />;
  return (
    <ul>
      <Item m={side === "after" && v !== other ? "changed" : null}>{text}</Item>
    </ul>
  );
}

export interface CompareProps {
  before: ChangeFields;
  after: ChangeFields;
  /** Column headings, e.g. "Version 3 (approved)" / "Proposed". */
  beforeLabel?: string;
  afterLabel?: string;
  /** depends_on only: dependencies on each side the reader can't see (the diff's hidden_depends_on). */
  hidden?: { before: number; after: number } | null;
  /** A dependency's name (default: its id). */
  titleOf?: (id: string) => string;
  /** A line above the table (where the two sides come from). */
  caption?: ReactNode;
}

/** Before and after, field by field: two columns from 640px, one above the other below, the changed parts marked
 *  (Added / Removed / Changed, never colour alone), and the same change lines in words the decision record uses. */
export function Compare({ before, after, beforeLabel = "Before", afterLabel = "After", hidden = null, titleOf = (id) => id, caption }: CompareProps) {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  // A field the same on both sides (two revisions that both carry it) isn't a change: left out, never "X → X".
  const fields = FIELDS.filter((f) => (f in before || f in after) && (JSON.stringify(b[f] ?? null) !== JSON.stringify(a[f] ?? null) || (f === "depends_on" && hidden && hidden.before !== hidden.after)));
  if (!fields.length) return <p className="text-[14px] text-(--text-3)">Nothing changes.</p>;
  return (
    <div data-compare className="min-w-0">
      {caption && <p className="mb-2 text-[13px] text-(--text-3)">{caption}</p>}
      <div className="overflow-hidden rounded-(--radius-m) border border-(--line)">
        <div className="grid grid-cols-[minmax(0,1fr)] border-b border-(--line) bg-(--bg-inset) text-[12.5px] font-medium tracking-wide text-(--text-3) uppercase sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="hidden px-3 py-2 sm:block">Field</span>
          <span className="hidden px-3 py-2 sm:block">{beforeLabel}</span>
          <span className="hidden px-3 py-2 sm:block">{afterLabel}</span>
          <span className="px-3 py-2 sm:hidden">
            {beforeLabel} and {afterLabel}
          </span>
        </div>
        {fields.map((f) => {
          const words = changeWords(f, { before: b[f], after: a[f], hidden: f === "depends_on" ? hidden : null }, { title: titleOf });
          return (
            <div key={f} data-field={f} className="grid grid-cols-[minmax(0,1fr)] border-b border-(--line) last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="px-3 pt-2.5 sm:py-2.5">
                <p className="text-[14px] font-medium text-(--text-1)">{FIELD_LABEL[f]}</p>
              </div>
              <div className="px-3 py-1.5 sm:border-l sm:border-(--line) sm:py-2">
                <p className="px-2 text-[12.5px] text-(--text-3) sm:hidden">{beforeLabel}</p>
                <Side field={f} v={b[f]} other={a[f]} side="before" titleOf={titleOf} hidden={hidden?.before ?? 0} />
              </div>
              <div className="px-3 py-1.5 sm:border-l sm:border-(--line) sm:py-2">
                <p className="px-2 text-[12.5px] text-(--text-3) sm:hidden">{afterLabel}</p>
                <Side field={f} v={a[f]} other={b[f]} side="after" titleOf={titleOf} hidden={hidden?.after ?? 0} />
              </div>
              <ul className="col-span-full flex flex-col gap-0.5 border-t border-dashed border-(--line) px-5 py-1.5 text-[13px] text-(--text-2) sm:col-start-2" aria-label={`${FIELD_LABEL[f]} change in words`}>
                {words.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A row of GET …/goals/<goal> → versions. */
export interface VersionRow {
  version: number;
  title: string;
  status: string;
  target_share: number | null;
  created_at: string;
}

/** Two goal versions side by side on what a version row carries (title, status, target share). Measures, limits and
 *  dependencies of an older version aren't in any read the web app has, so they are named as not compared rather
 *  than shown as unchanged (a server ask: a version's full content). */
export function VersionsCompare({ a, b }: { a: VersionRow; b: VersionRow }) {
  const [older, newer] = a.version <= b.version ? [a, b] : [b, a];
  const rows: { label: string; o: string; n: string }[] = [
    { label: "Title", o: older.title, n: newer.title },
    { label: "Status", o: STATUS_LABEL[older.status as Goal["status"]] ?? older.status, n: STATUS_LABEL[newer.status as Goal["status"]] ?? newer.status },
    { label: "Target share", o: older.target_share === null ? "None" : `${older.target_share}%`, n: newer.target_share === null ? "None" : `${newer.target_share}%` },
  ];
  return (
    <div data-compare="versions" className="min-w-0">
      <div className="overflow-hidden rounded-(--radius-m) border border-(--line)">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-(--line) bg-(--bg-inset) text-[12.5px] font-medium tracking-wide text-(--text-3) uppercase">
          <span className="px-3 py-2">Field</span>
          <span className="px-3 py-2">Version {older.version}</span>
          <span className="px-3 py-2">Version {newer.version}</span>
        </div>
        {rows.map((r) => {
          const changed = r.o !== r.n;
          return (
            <div key={r.label} data-field={r.label} className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-(--line) text-[14px] last:border-b-0">
              <span className="px-3 py-2 font-medium text-(--text-1)">{r.label}</span>
              <span className="border-l border-(--line) px-3 py-2 text-(--text-2) [overflow-wrap:anywhere]">{r.o}</span>
              <span className={`flex flex-wrap items-baseline gap-2 border-l border-(--line) px-3 py-2 [overflow-wrap:anywhere] ${changed ? "bg-(--accent-soft) text-(--text-1)" : "text-(--text-2)"}`}>
                <span className="min-w-0 flex-1">{r.n}</span>
                {changed && <MarkTag m="changed" />}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-(--text-3)">Measures, limits and dependencies of earlier versions aren&apos;t available to compare yet.</p>
    </div>
  );
}
