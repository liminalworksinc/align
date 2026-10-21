"use client";
import type { ReactNode } from "react";
import { customStateLabel, type Labels } from "@/lib/labels";

export type Tone = "violet" | "amber" | "neutral" | "red" | "green" | "blue";

// Outline pills: mono, rounded, colored border + text, no fill.
const TONES: Record<Tone, string> = {
  violet: "text-violet-700 border-violet-700",
  amber: "text-amber-700 border-amber-700",
  neutral: "text-zinc-700 border-zinc-300",
  red: "text-red-700 border-red-700",
  green: "text-emerald-700 border-emerald-700",
  blue: "text-sky-800 border-sky-800",
};

const ICONS: Record<Tone, string> = { violet: "◆", amber: "▲", neutral: "●", red: "✕", green: "✓", blue: "ⓘ" };

export function Badge({ tone, children, icon = true }: { tone: Tone; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[12px] leading-[1.4] tracking-[0.04em] ${TONES[tone]}`}>
      {icon && <span aria-hidden>{ICONS[tone]}</span>}
      {children}
    </span>
  );
}

/** Status badge. Green is reserved for passing sandbox test results only. Custom scenarios pass labels for team names. */
export function StateBadge({ state, labels }: { state: string; labels?: Labels }) {
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
  const custom = labels && customStateLabel(state, labels);
  return <Badge tone={tone}>{custom ?? STATE_LABEL[state] ?? state.replaceAll("_", " ").toLowerCase()}</Badge>;
}

/** Plain-language names for every status the app shows. The codes stay in data and APIs. */
export const STATE_LABEL: Record<string, string> = {
  OBSERVED: "Confirmed",
  PROPOSED: "Suggested",
  INFERRED: "Best guess",
  ACCEPTED: "Agreed",
  VERIFIED: "Passed the test",
  UNKNOWN: "Unknown",
  FAILED: "Failed",
  REJECTED: "Declined",
  PASS: "Passed",
  FAIL: "Failed",
  TESTED: "Tested",
  STALE: "Needs retest",
  UNTESTED: "Not tested",
  DRAFT: "Draft",
  PENDING_SECURITY: "Waiting for Security",
  COUNTERED: "Security asked for changes",
  ACKNOWLEDGED_BY_PRODUCT: "Product accepted changes",
  RATIFIED: "Approved",
  NOT_SHARED: "Not shared",
  NOT_TESTED: "Not tested",
};

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
    primary: "border-transparent bg-violet-700 text-black hover:brightness-110",
    secondary: "border-zinc-300 text-zinc-900 hover:border-zinc-500 hover:bg-zinc-100",
    danger: "border-red-700 text-red-700 hover:bg-red-50",
    ghost: "border-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-[18px] text-[15px] font-semibold transition ${k} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="al-lbl">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1.5 py-px font-mono text-[13px] text-zinc-900 [overflow-wrap:anywhere]">{children}</code>;
}

export const OWNER_LABEL: Record<string, string> = {
  ceo: "CEO",
  product: "Product Director",
  security: "Alex / Security Lead",
  leadership: "CEO / Leadership",
};

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // never render "Invalid Date"
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/**
 * The only place backend metadata (ids, hashes, versions, paths, commands) may appear.
 * Closed by default; used on the Evidence page so engineers can still reproduce a result.
 */
export function ForEngineers({ children, label = "For engineers" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group mt-2 text-[13px] text-zinc-500">
      <summary className="cursor-pointer select-none rounded text-zinc-500 hover:text-zinc-700">{label}</summary>
      <div className="mt-2 space-y-1 font-mono text-[12px] text-zinc-500 [overflow-wrap:anywhere]">{children}</div>
    </details>
  );
}
