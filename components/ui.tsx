"use client";
import type { ReactNode, Ref } from "react";
import { customStateLabel, type Labels } from "@/lib/labels";

export type Tone = "violet" | "amber" | "neutral" | "red" | "green" | "blue";

// v6 pills: rounded, tone text + tone border + tinted tone fill. Neutral is the v6 grey pill.
const TONES: Record<Tone, string> = {
  violet: "text-violet-700 border-violet-700 bg-violet-50",
  amber: "text-amber-700 border-amber-700 bg-amber-50",
  neutral: "text-zinc-700 border-zinc-200 bg-zinc-50",
  red: "text-red-700 border-red-700 bg-red-50",
  green: "text-emerald-700 border-emerald-700 bg-emerald-50",
  blue: "text-sky-800 border-sky-800 bg-sky-50",
};

const ICONS: Record<Tone, string> = { violet: "◆", amber: "▲", neutral: "●", red: "✕", green: "✓", blue: "ⓘ" };

/** `wrap` lets a long badge (a sentence, not a status word) wrap inside its pill instead of running off the edge. In a
 *  narrow container (@max-md:, a container query: the nearest @container under 28rem, i.e. a custom workspace's main
 *  column on a phone; Northstar's main is not a container) every badge may wrap, so none runs off the screen. */
export function Badge({ tone, children, icon = true, wrap = false }: { tone: Tone; children: ReactNode; icon?: boolean; wrap?: boolean }) {
  const fit = wrap ? "min-w-0 whitespace-normal rounded-[14px]" : "shrink-0 whitespace-nowrap rounded-full @max-md:min-w-0 @max-md:shrink @max-md:whitespace-normal";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 border px-2.5 py-[3px] font-mono text-[12px] font-bold leading-[1.3] tracking-[0.04em] ${fit} ${TONES[tone]}`}>
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
  wrap = false,
  ref,
  shell = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  /** A long label wraps inside the button at any width (not only in a narrow custom main column). */
  wrap?: boolean;
  ref?: Ref<HTMLButtonElement>;
  /** In a custom workspace's sidebar or header (no @container there): 44px tall on a phone viewport (below 768px). */
  shell?: boolean;
}) {
  const k = {
    // v6 .btn.p: Liminal magenta fill, near-black text.
    primary: "border-transparent bg-violet-700 text-black hover:brightness-112",
    // v6 .btn.s: outlined on card-border-2, hover lifts the surface.
    secondary: "border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-100",
    danger: "border-red-700 bg-transparent text-red-700 hover:bg-red-50",
    // v6 .btn.g: no border, mid ink, brightens on hover.
    ghost: "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
  }[kind];
  // Disabled: a faded magenta fill left near-black text at ~1.7:1 on the dark page, so the primary button turns into a
  // neutral surface with readable mid-grey text instead; the outlined kinds keep the plain fade.
  const off = kind === "primary" ? "disabled:bg-zinc-200 disabled:text-zinc-600" : "disabled:opacity-40";
  // @max-md: is a CONTAINER query, not the 768px viewport breakpoint: it applies when the nearest @container is under
  // 28rem (about 420-448px). The only one a Button sits in is a custom workspace's main column (CUSTOM_MAIN), which is
  // that narrow on a phone; there a long label wraps instead of running off the screen. Northstar's main is not a
  // container, so it is unchanged. There it is also 44px tall: the root font is 15px, so min-h-11 is only 41.25px.
  // `shell` is the same for the custom sidebar and header, which sit in no container: a viewport variant instead.
  const fit = wrap ? "min-h-[44px] max-w-full whitespace-normal py-2 text-left" : "whitespace-nowrap";
  return (
    <button ref={ref} type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 ${fit} rounded-[10px] border px-[18px] @max-md:min-h-[44px] ${shell ? "max-md:min-h-[44px] " : ""}@max-md:max-w-full @max-md:whitespace-normal @max-md:py-2 @max-md:text-left text-[15px] font-semibold transition duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] ${k} disabled:cursor-not-allowed ${off} disabled:hover:brightness-100`}>
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="al-lbl">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-px font-mono text-[12.5px] text-zinc-700 [overflow-wrap:anywhere]">{children}</code>;
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
