"use client";
import type { ReactNode } from "react";

export type Tone = "violet" | "amber" | "neutral" | "red" | "green" | "blue";

const TONES: Record<Tone, string> = {
  violet: "bg-violet-50 text-violet-800 ring-violet-300",
  amber: "bg-amber-50 text-amber-900 ring-amber-300",
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-300",
  red: "bg-red-50 text-red-800 ring-red-300",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-400",
  blue: "bg-sky-50 text-sky-800 ring-sky-300",
};

const ICONS: Record<Tone, string> = { violet: "◆", amber: "▲", neutral: "●", red: "✕", green: "✓", blue: "ⓘ" };

export function Badge({ tone, children, icon = true }: { tone: Tone; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {icon && <span aria-hidden>{ICONS[tone]}</span>}
      {children}
    </span>
  );
}

/** Truth-state badge. Green is reserved for Sparta-verified narrow outcomes only. */
export function StateBadge({ state }: { state: string }) {
  const tone: Tone =
    state === "VERIFIED" || state === "PASS"
      ? "green"
      : state === "FAILED" || state === "FAIL" || state === "REJECTED"
        ? "red"
        : state === "UNKNOWN" || state === "STALE" || state === "UNTESTED" || state === "PENDING_SECURITY" || state === "COUNTERED"
          ? "amber"
          : state === "PROPOSED" || state === "INFERRED"
            ? "violet"
            : "neutral";
  return <Badge tone={tone}>{state.replaceAll("_", " ")}</Badge>;
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const k = {
    primary: "bg-violet-700 text-white hover:bg-violet-800 disabled:bg-zinc-300",
    secondary: "bg-white text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:text-zinc-400",
    danger: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
    ghost: "text-zinc-700 hover:bg-zinc-100",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg px-3.5 py-2 text-[15px] font-semibold transition ${k} disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-zinc-800">{children}</code>;
}

export const OWNER_LABEL: Record<string, string> = {
  ceo: "CEO",
  product: "Product Director",
  security: "Alex / Security Lead",
};

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
