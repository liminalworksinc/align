"use client";
import type { ReactNode } from "react";

// The Sessions tab's controls in the LIM-2472 token system (both themes). Same names, props and words as the kit
// pieces they replace (Btn, Note, Err, Pill), so the page's behaviour and the strings test-v2 reads stay as they were;
// only colour, borders and sizes change. Buttons hold their label alone, so `button.textContent` is the label.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

export function Btn({ kind = "secondary", disabled, onClick, children }: { kind?: "secondary" | "danger"; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  const k = kind === "danger" ? "border-(--st-declined) text-(--st-declined) hover:bg-(--st-declined-soft)" : "border-(--edge) bg-(--bg-raised) text-(--text-1) hover:bg-(--bg-overlay)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[36px] max-w-full items-center rounded-(--radius-s) border px-3 text-[14px] font-medium [overflow-wrap:normal] disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px] ${FOCUS} ${k}`}
    >
      {children}
    </button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="my-2 rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-3 py-2 text-[14px] text-(--text-2)">{children}</p>;
}

export function Err({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="my-2 text-[15px] font-medium text-(--st-declined)">
      {children}
    </p>
  );
}

export const Loading = () => <p className="text-[15px] text-(--text-2)">Loading…</p>;

const TONE = {
  neutral: "text-(--text-2) border-(--edge)",
  violet: "text-(--accent-text) border-(--accent-text)",
  amber: "text-(--st-pending) border-(--st-pending)",
  red: "text-(--st-declined) border-(--st-declined)",
  green: "text-(--st-approved) border-(--st-approved)",
} as const;

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONE }) {
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-mono text-[12px] tracking-[0.04em] [overflow-wrap:anywhere] ${TONE[tone]}`}>{children}</span>;
}
