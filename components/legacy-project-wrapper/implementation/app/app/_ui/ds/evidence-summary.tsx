"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { ChangeRequest, Goal } from "../types";
import { changeFacts, FACT_WORD, goalFacts, type Delivery, type Fact } from "./evidence-facts.mts";
import { EvidenceLabel } from "./evidence-label";
import { useRead } from "./read";

// EvidenceSummary (LIM-2472 direction 9b5b870f): the one renderer for "the evidence behind this item", so Home's rows,
// the goal lines and the review never say it differently. The facts come from evidence-facts.mts; this file only reads
// what they need and draws them.
//   inline: one line for a list row, strongest fact first, as chips that never split icon from word; whatever doesn't
//           fit becomes "+N more" (measured, so it holds at 320).
//   full:   every fact, each chip with its sentence.
// Reads, only when the caller hasn't passed them: a launched request's GET …/value; a goal's approved requests
// (GET …/goals/<goal>/change-requests?state=approved) for its newest launch, then that launch's …/value.

type ValueRead = Delivery & { goal?: unknown };

export type EvidenceSummaryProps = {
  ws: string;
  variant?: "inline" | "full";
  /** inline: the most chips shown before "+N more" (fewer when they don't fit). Default 2, for NeedRow's evidence slot. */
  max?: number;
} & (
  | { cr: ChangeRequest; goal?: never; value?: Delivery | null; launched?: never }
  | {
      goal: Goal;
      cr?: never;
      value?: never;
      launched?: { version: number; value: Delivery | null } | null;
      /** Goal lines: omit facts of pure absence (no agent time); a launched version's Not observed delivery stays. */
      quiet?: boolean;
    }
);

function Chip({ f, detail }: { f: Fact; detail?: string }) {
  return <EvidenceLabel kind={f.kind} size="s" detail={detail} />;
}

/** The newest launched version on a goal and its delivery, unless the caller passed it. */
function useGoalLaunch(ws: string, goal: Goal | undefined, skip: boolean) {
  const crs = useRead<{ change_requests: ChangeRequest[] }>(goal && !skip ? `/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests?state=approved` : null);
  const cr = (crs.data?.change_requests ?? []).filter((c) => c.launch === "launched" && c.version).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
  const value = useRead<ValueRead>(goal && cr ? `/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests/${cr.id}/value` : null);
  if (skip || !goal) return { launched: undefined, loading: false };
  if (crs.loading) return { launched: undefined, loading: true };
  if (!cr) return { launched: null, loading: false };
  return { launched: { version: cr.version!, value: value.status === 0 ? (value.data ?? null) : null }, loading: value.loading };
}

/** Fits chips on one line: how many of them show before "+N more", re-measured when the row's width changes. */
function useFit(count: number, max: number) {
  const box = useRef<HTMLSpanElement | null>(null);
  const probe = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(Math.min(count, max));
  useLayoutEffect(() => {
    const el = box.current;
    const p = probe.current;
    if (!el || !p) return;
    const measure = () => {
      const kids = [...p.children] as HTMLElement[];
      const chips = kids.slice(0, count).map((k) => k.offsetWidth);
      const more = kids[count]?.offsetWidth ?? 0;
      const gap = 6;
      const room = el.clientWidth;
      let k = Math.min(count, max);
      const width = (m: number) => chips.slice(0, m).reduce((s, w) => s + w, 0) + Math.max(0, m - 1) * gap + (m < count ? gap + more : 0);
      while (k > 1 && width(k) > room) k--;
      setShown(k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, max]);
  return { box, probe, shown };
}

function Inline({ facts, max }: { facts: Fact[]; max: number }) {
  const { box, probe, shown } = useFit(facts.length, max);
  const hidden = facts.length - shown;
  return (
    <span ref={box} data-evidence-summary="inline" className="relative flex w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden whitespace-nowrap">
      {facts.slice(0, shown).map((f, i) => (
        // The strongest chip may shrink when even it and "+N more" don't fit: its detail ends in an ellipsis (the full
        // words stay in the text and the title); the icon and the word never shrink or split.
        <span key={i} title={`${FACT_WORD[f.kind]}: ${f.short}`} className={`flex ${i === 0 ? "min-w-0 shrink" : "shrink-0"} [&>[data-evidence]]:flex-nowrap [&>[data-evidence]>span:nth-child(2)]:truncate`}>
          <Chip f={f} detail={f.short} />
        </span>
      ))}
      {hidden > 0 && (
        <span className="shrink-0 text-[12px] text-(--text-3)" title={facts.slice(shown).map((f) => `${FACT_WORD[f.kind]}: ${f.short}`).join("; ")}>
          +{hidden} more
        </span>
      )}
      {/* The measuring copy: every chip at its natural width and the widest "+N more", never seen or read out. */}
      <span ref={probe} aria-hidden="true" className="invisible absolute top-0 left-0 flex flex-nowrap gap-1.5">
        {facts.map((f, i) => (
          <span key={i} className="shrink-0">
            <Chip f={f} detail={f.short} />
          </span>
        ))}
        <span className="shrink-0 text-[12px]">+{facts.length} more</span>
      </span>
    </span>
  );
}

function Full({ facts }: { facts: Fact[] }) {
  return (
    <ul data-evidence-summary="full" className="flex flex-col gap-2">
      {facts.map((f, i) => (
        <li key={i} className="flex min-w-0 flex-col items-start gap-1 text-[14px] sm:flex-row sm:items-baseline sm:gap-2">
          <span className="shrink-0">
            <Chip f={f} />
          </span>
          <span className="min-w-0 text-(--text-2) [overflow-wrap:anywhere]">{f.long}</span>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceSummary(props: EvidenceSummaryProps) {
  const { ws, variant = "inline", max = 2 } = props;
  const cr = props.cr;
  const needValue = !!cr && cr.launch === "launched" && !!cr.version && props.value === undefined;
  const value = useRead<ValueRead>(needValue ? `/api/v2/workspaces/${ws}/goals/${cr!.goal.id}/change-requests/${cr!.id}/value` : null);
  const g = useGoalLaunch(ws, props.goal, props.launched !== undefined);

  const loading = (needValue && value.loading) || g.loading;
  if (loading) return <span className="text-[12px] leading-5 text-(--text-3)">Reading evidence…</span>;
  const facts = cr
    ? changeFacts(cr, props.value !== undefined ? props.value : needValue ? (value.status === 0 ? (value.data ?? null) : null) : undefined)
    : props.goal
      ? goalFacts(props.goal, props.launched !== undefined ? props.launched : g.launched, { quiet: props.quiet })
      : [];
  if (!facts.length) return null;
  return variant === "full" ? <Full facts={facts} /> : <Inline facts={facts} max={max} />;
}
