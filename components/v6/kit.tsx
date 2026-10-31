"use client";
import { useState, type ReactNode } from "react";

// v6 primitives for the W5 screens (Goals, Ways forward, Scenario Studio, Work). Local to components/v6 so they don't
// collide with components/ui.tsx. Colors come from the dark token theme in app/globals.css (zinc/violet/amber/red/
// emerald map to --al-* tokens there).

export type PillTone = "amber" | "violet" | "red" | "mint" | "grey" | "white";

const PILL: Record<PillTone, string> = {
  amber: "text-amber-700 bg-amber-50 border-amber-700",
  violet: "text-violet-700 bg-violet-50 border-violet-700",
  red: "text-red-700 bg-red-50 border-red-700",
  mint: "text-emerald-700 bg-emerald-50 border-emerald-700",
  grey: "text-zinc-600 bg-zinc-50 border-zinc-200",
  white: "text-[var(--al-bg)] bg-[var(--al-ink)] border-[var(--al-ink)]",
};

export function Pill({ tone, children, small }: { tone: PillTone; children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-[1.3] ${small ? "px-[7px] py-px text-[11px]" : "px-2.5 py-[3px] text-[12.5px]"} ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "amber" | "violet" }) {
  const color = tone === "amber" ? "text-amber-700" : tone === "violet" ? "text-violet-700" : "text-zinc-700";
  // A long chip wraps in a narrow container (a custom workspace on a phone); elsewhere it stays on one line.
  return <span className={`whitespace-nowrap rounded-full bg-zinc-100 px-[9px] py-[3px] text-[12px] @max-md:whitespace-normal ${color}`}>{children}</span>;
}

export function Lbl({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500 ${className}`}>{children}</span>;
}

export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">{children}</h1>
      {sub && <p className="mt-1 text-[15px] text-zinc-500">{sub}</p>}
    </div>
  );
}

/** Segmented control. Each option is a pressed/unpressed button; `disabled` options say why in their title. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; disabled?: string }[];
  value: T;
  onChange?: (v: T) => void;
  label: string;
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={!!o.disabled || !onChange}
          title={o.disabled}
          onClick={() => onChange?.(o.id)}
          className={`rounded-md px-3 py-1.5 text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)] disabled:cursor-default ${value === o.id ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900 disabled:hover:text-zinc-500"} ${o.disabled ? "opacity-50" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

export const CARD = "rounded-[14px] border border-zinc-200 bg-white";
export const NODE =
  "flex w-full flex-col gap-2 rounded-[14px] border bg-white px-[18px] py-4 text-left text-zinc-900 transition-opacity duration-300 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)]";
export const nodeState = (sel: boolean, dim: boolean) =>
  `${sel ? "outline-2 outline-offset-2 outline-violet-500" : ""} ${dim ? "opacity-30" : ""}`;

/** A row inside a node or list: "#1  task  status". */
export function Row({ n, children, status, statusTone }: { n?: ReactNode; children: ReactNode; status?: ReactNode; statusTone?: "amber" | "violet" }) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 py-2.5 text-[14.5px] last:border-b-0">
      {n !== undefined && <span className="font-mono text-[12.5px] text-zinc-600">{n}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {status && <Chip tone={statusTone}>{status}</Chip>}
    </div>
  );
}

export function Bar({ pct, tone = "violet" }: { pct: number; tone?: "violet" | "amber" | "mint" }) {
  const c = tone === "amber" ? "bg-amber-500" : tone === "mint" ? "bg-emerald-700" : "bg-violet-600";
  return (
    <div className="h-1.5 overflow-hidden rounded-[3px] bg-zinc-100" aria-hidden>
      <i className={`block h-full ${c}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** "What could prove this wrong ▼": a full-width disclosure row. */
export function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 border-t border-zinc-200 py-3 text-left text-[15px] font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)]"
      >
        {title}
        <span aria-hidden className="ml-auto font-mono text-[12px] text-zinc-500">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="al-in pb-3">{children}</div>}
    </div>
  );
}

export function Skeleton({ width }: { width: string }) {
  return <div className="h-3 animate-pulse rounded bg-zinc-100" style={{ width }} aria-hidden />;
}

/** A check mark row: ✓ (passed), ✕ (failed) or ▲ (open question). */
export function Check({ kind, children }: { kind: "ok" | "bad" | "no"; children: ReactNode }) {
  const m = kind === "ok" ? "bg-emerald-700 text-[var(--al-bg)]" : kind === "bad" ? "bg-red-700 text-[var(--al-bg)]" : "bg-zinc-100 text-zinc-500";
  return (
    <div className="flex items-start gap-2.5 text-[14px] leading-[1.4]">
      <span aria-hidden className={`mt-px grid size-[18px] flex-none place-items-center rounded-full text-[11px] font-bold ${m}`}>
        {kind === "ok" ? "✓" : kind === "bad" ? "✕" : "▲"}
      </span>
      <span className={kind === "bad" ? "text-red-700" : "text-zinc-900"}>
        {children}
        {kind !== "no" && <span className="sr-only">{kind === "ok" ? " passed" : " failed"}</span>}
      </span>
    </div>
  );
}

/** Dashed card for something that is designed but not built. Never carries a working control. */
export function NotBuilt({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-dashed border-zinc-300 px-[18px] py-3.5 text-zinc-700">
      <span>{title}</span>
      <span className="text-[13px] text-zinc-500">{children}</span>
    </div>
  );
}

/** Copy text to the clipboard; returns false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
