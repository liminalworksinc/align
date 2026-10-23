"use client";
import { useId, useState, type ReactNode } from "react";

// v6 review screen primitives: a proposal shown as a message thread, collapsible sections and the answer options.
// Presentation only; no data or API logic lives here.

/** Up to two initials for an avatar: "Alex / Security Lead" -> "AS", "Product Director" -> "PD". */
export function initials(name: string): string {
  const words = name.split(/[\s/·]+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export type BubbleTone = "plain" | "counter" | "ratified" | "declined";

const BUBBLE: Record<BubbleTone, string> = {
  plain: "ring-zinc-200",
  counter: "ring-amber-300",
  ratified: "ring-zinc-800",
  declined: "ring-red-300",
};

/** One message in the thread: avatar, then a bubble with a header row (name, tag, time) and the body. */
export function Msg({
  name,
  tag,
  at,
  tone = "plain",
  me = false,
  children,
}: {
  name: string;
  tag?: ReactNode;
  at?: string;
  tone?: BubbleTone;
  me?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="al-in flex items-start gap-3">
      <span
        aria-hidden
        className={`grid size-[34px] flex-none place-items-center rounded-full border text-[12px] font-bold ${
          me ? "border-violet-700 bg-violet-50 text-violet-700" : "border-zinc-300 bg-zinc-100 text-zinc-600"
        }`}
      >
        {initials(name)}
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-[14px] bg-white px-4 py-3.5 ring-1 ${BUBBLE[tone]}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <b className="text-[15px] text-zinc-900">{name}</b>
          {tag}
          {at && <span className="ml-auto text-[13px] text-zinc-500">{at}</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Small grey chip for a bubble's header ("proposal · v2"). */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-0.5 text-[12px] text-zinc-600">{children}</span>;
}

/** Solid ink pill for the ratified bubble. */
export function InkPill({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-black">{children}</span>
  );
}

/** Mono uppercase label inline in a bubble ("Current", "Proposed"). */
export function Lbl({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <span className={`al-lbl mr-1.5 !text-[11px] ${accent ? "!text-violet-700" : ""}`}>{children}</span>;
}

/** Text struck through in grey: the version being replaced. */
export function Old({ children }: { children: ReactNode }) {
  return <span className="text-zinc-600 line-through decoration-zinc-500">{children}</span>;
}

/** A collapsible section: a full-width summary row with an arrow, the body shown only when open. */
export function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 border-t border-zinc-200 py-3 text-left text-[15px] font-semibold text-zinc-900"
      >
        {title}
        <span aria-hidden className="ml-auto font-mono text-[12px] text-zinc-500">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div id={id} className="al-in pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** One answer option (Accept, Accept if…, Counter, Decline): a radio styled as a card. */
export function Option({ on, title, sub, onPick }: { on: boolean; title: string; sub: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-xl border px-3.5 py-3 text-left transition ${
        on ? "border-violet-700 bg-violet-50" : "border-zinc-300 hover:bg-zinc-100"
      }`}
    >
      <b className="text-[15px] text-zinc-900">{title}</b>
      <span className="text-[13px] text-zinc-500">{sub}</span>
    </button>
  );
}

/** Conditions as a numbered list, one per line of the single conditions field. */
export function NumberedLines({ lines }: { lines: string[] }) {
  return (
    <ol className="space-y-1.5">
      {lines.map((c, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15px] text-zinc-900">
          <span className="grid h-[22px] min-w-[22px] flex-none place-items-center rounded-full bg-zinc-100 px-1.5 text-[12px] font-bold text-zinc-900">
            {i + 1}
          </span>
          <span className="min-w-0 whitespace-pre-wrap">{c}</span>
        </li>
      ))}
    </ol>
  );
}

/** The one conditions field split for display: one condition per non-empty line. */
export function conditionLines(text: string | undefined | null): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
