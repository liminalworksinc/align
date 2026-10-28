"use client";
import type { Labels } from "@/lib/labels";
import type { Acceptance, Actor, Proposal } from "@/lib/types";
import { nextStep, stages } from "./nextStep";
import { Button } from "./ui";

/** Custom only: where this proposal stands, one step per turn (Tool Concepts v2 §04). The viewer's own step says "you". */
export function ProgressStrip({ p, acc, L, viewer }: { p: Proposal; acc: Acceptance | null; L: Labels; viewer: string }) {
  if (L.northstar) return null;
  const steps = stages(p, acc);
  return (
    <ol aria-label="Where this proposal stands" className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => {
        const tone =
          st.state === "now"
            ? "border-violet-700 bg-violet-50 text-zinc-900"
            : st.state === "done"
              ? "border-zinc-200 bg-white text-zinc-700"
              : st.state === "stopped"
                ? "border-red-700 bg-white text-red-700"
                : "border-dashed border-zinc-300 bg-transparent text-zinc-500";
        const mark = st.state === "done" ? "✓" : st.state === "stopped" ? "✕" : String(i + 1);
        return (
          <li
            key={st.key}
            aria-current={st.state === "now" ? "step" : undefined}
            className={`flex min-w-[9.5rem] flex-1 basis-[9.5rem] flex-col gap-0.5 rounded-[10px] border px-3 py-2 ${tone}`}
          >
            <span className="font-mono text-[11px] font-bold tracking-[0.06em]">
              {mark} {st.state === "now" ? (st.who === viewer ? "YOU, NOW" : "NOW") : st.state === "later" ? "NEXT" : ""}
            </span>
            <span className="text-[14px] font-semibold leading-snug">{L.person[st.who]}</span>
            <span className="text-[13px] leading-snug">{st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Custom only: after a hand-off, who acts next, with a one-click switch for a solo tester (replaces the "Testing on
 *  your own? Use Switch team…" sentence). Without a switch handler it falls back to naming the team. */
export function NextStepAction({ p, viewer, L, onSwitch }: { p: Proposal; viewer: string; L: Labels; onSwitch?: (r: Actor) => void }) {
  const step = nextStep(p, viewer, L);
  if (!step) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-2.5 text-[15px] text-zinc-600">
      <span>
        Next: <span className="font-semibold text-zinc-900">{L.person[step.who]}</span> {step.does}.
      </span>
      {onSwitch ? (
        <Button kind="ghost" onClick={() => onSwitch(step.who)}>
          {`Act as ${L.role[step.who]} →`}
        </Button>
      ) : (
        <span>Switch team to act as {L.role[step.who]}.</span>
      )}
    </div>
  );
}
