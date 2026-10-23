"use client";
import { useEffect, useRef, useState } from "react";
import { companyMeasureId, conflictMeasureId, labelsFor, poss } from "@/lib/labels";
import type { BriefOption } from "@/lib/types";
import type { ViewProps } from "./props";
import { comparablePair, currentGoal, priorVersion } from "./select";
import { Button, OWNER_LABEL, STATE_LABEL, fmtTime } from "./ui";
import { CARD, Check, Chip, Collapsible, Lbl, Pill, type PillTone } from "./v6/kit";

// v6 "Ways forward". Northstar shows its brief as stored (ranked options, what could prove it wrong, cited evidence).
// Custom scenarios have no generated options, so the ranked list is replaced by an honest empty state.

const HINT: Record<BriefOption["rank"], string> = {
  P0: "P0 is the change to propose. It can be tried on practice tickets before anyone signs off.",
  P1: "P1 is a constraint on any plan, not a proposal by itself.",
  P2: "P2 is Product's own call. No proposal needed; it becomes part of what you offer.",
};

const truthTone = (state: string): PillTone => (state === "UNKNOWN" ? "amber" : state === "PROPOSED" || state === "INFERRED" ? "violet" : "grey");

export function BriefDrawer(props: ViewProps & { onClose: () => void }) {
  const { s, me, onClose, mark } = props;
  const L = labelsFor(s);
  const b = s.brief;
  const [choice, setChoice] = useState<BriefOption["rank"]>("P0");
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    mark("brief_reviewed");
  }, [mark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const alike = b.alike_status === "retrieved" && b.alike_ref ? b.alike_ref : null;
  const isProduct = me.actor === "product";
  const accepted = s.acceptances.length > 0;

  // Work completed ≠ goal achieved, from state: the owning team's measure (before any approval) and the company requirement.
  const sec = currentGoal(s, "security");
  const secBefore = accepted && sec ? (priorVersion(s, sec) ?? sec) : sec;
  const oldMeasure = secBefore?.measures.find((m) => m.id === conflictMeasureId(s))?.text;
  const requirement = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s))?.text;
  const { baseline } = comparablePair(s);
  const basePassed = baseline?.checks.filter((c) => c.passed).length ?? 0;

  const propose = () => {
    onClose();
    props.go("proposals");
  };

  return (
    <div aria-labelledby="brief-title" className="flex h-full w-full flex-col bg-[var(--al-bg)]">
      <header className="flex items-center gap-2.5 border-b border-zinc-200 px-6 py-4">
        <Button kind="ghost" onClick={onClose}>
          <span aria-hidden>←</span> Goals
        </Button>
        <span className="ml-auto">
          <Pill tone="violet">Suggestion · you choose</Pill>
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5 text-[15px]">
        <div>
          <Lbl>
            Ways forward · {L.team.product} → {L.team.security} dependency
          </Lbl>
          <h2 id="brief-title" className="mt-1.5 text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-zinc-900">
            {L.northstar ? b.headline : `${L.person.ceo} changed what ${L.team.product} needs. ${poss(L.team.security)} measure hasn't changed.`}
          </h2>
        </div>

        <div className={`${CARD} grid grid-cols-[1fr_auto_1fr] items-center gap-4 !bg-zinc-50 px-[18px] py-3.5`}>
          <div>
            <Lbl className="!text-red-700">Work completed</Lbl>
            <div className="text-[15px] text-zinc-900">
              {oldMeasure ?? "Not shared"}
              {L.northstar && baseline && (
                <span className="block text-[13.5px] text-zinc-500">
                  The current plan reports done; {basePassed} of {baseline.checks.length} checks passed.
                </span>
              )}
            </div>
          </div>
          <span aria-label="does not equal" className="font-mono text-[12.5px] text-zinc-600">
            ≠
          </span>
          <div>
            <Lbl className="!text-amber-700">Goal achieved</Lbl>
            <div className="text-[15px] text-zinc-900">
              {requirement ?? "Not shared"}
              <span className="block text-[13.5px] text-zinc-500">{accepted ? `${L.team.security} has since approved an updated goal.` : "Not met by the current measure."}</span>
            </div>
          </div>
        </div>

        {L.northstar ? (
          <div role="radiogroup" aria-label="Options, in suggested order" className="flex flex-col gap-2.5">
            {b.priorities.map((o) => {
              const on = choice === o.rank;
              return (
                <button
                  key={o.rank}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setChoice(o.rank)}
                  className={`flex w-full items-start gap-3.5 rounded-[14px] border bg-white px-[18px] py-4 text-left text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)] ${on ? "border-violet-500" : "border-zinc-200"}`}
                >
                  <Pill tone={on ? "violet" : "grey"}>{o.rank}</Pill>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <b className="text-[16px]">{o.label}</b>
                    <span className="text-[14px] text-zinc-700">{o.reason}</span>
                    <span className="text-[13.5px] text-zinc-500">If this waits: {o.delay_consequence}</span>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip>owner {L.team[o.owner]}</Chip>
                      <Chip tone={o.capacity === "unknown" ? "amber" : undefined}>time available {o.capacity === "unknown" ? STATE_LABEL.UNKNOWN.toLowerCase() : "known"}</Chip>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-[13px] text-zinc-500">{o.owner === me.actor ? "you" : (OWNER_LABEL[o.owner] ?? o.owner)}</span>
                </button>
              );
            })}
            <p className="text-[13.5px] text-zinc-500">The order is only a suggestion. Whoever owns the goal decides.</p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-zinc-300 px-[18px] py-3.5 text-zinc-700">
            <span>No ranked options in this scenario</span>
            <span className="block text-[13px] text-zinc-500">
              Align doesn&apos;t write options for you here. {L.team.product} writes the change as a proposal; {L.team.security} decides.
            </span>
          </div>
        )}

        {L.northstar && (
          <div>
            <Collapsible title="What could prove this wrong">
              <div className="flex flex-col gap-1.5">
                {b.disconfirmers.map((d) => (
                  <Check key={d} kind="no">
                    {d}
                  </Check>
                ))}
                {b.unknowns.map((u) => (
                  <Check key={u} kind="no">
                    {u} <Pill tone="amber" small>{STATE_LABEL.UNKNOWN}</Pill>
                  </Check>
                ))}
              </div>
            </Collapsible>
            <Collapsible title="Cited evidence">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[14.5px]">
                {b.evidence_refs.map((e) => (
                  <div key={`${e.ref}-${e.label}`} className="contents">
                    <span>
                      <Pill tone={truthTone(e.state)} small>
                        {STATE_LABEL[e.state] ?? e.state}
                      </Pill>
                    </span>
                    <span className="text-zinc-900">{e.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-[10px] border border-zinc-200 bg-zinc-50 p-3">
                {alike ? (
                  <>
                    <div className="mb-1 text-[15px] font-semibold text-zinc-900">Earlier team decision (saved by Alike, our AI-agent memory tool)</div>
                    <p className="mb-1 text-[14px] text-zinc-800">{alike.summary}</p>
                    <p className="mb-2 text-[13px] text-zinc-500">
                      Saved at {fmtTime(alike.recorded_at)} (time as reported by the AI session that saved it), then found again by a new AI session. Alike passed
                      the decision along; it didn&apos;t write the plan.
                    </p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-[14px]">
                      <div>
                        <Lbl>Before</Lbl>
                        <div className="text-zinc-700">{alike.plan_before}</div>
                      </div>
                      <span className="pt-4 text-zinc-400" aria-hidden>
                        →
                      </span>
                      <div>
                        <Lbl>After</Lbl>
                        <div className="text-zinc-900">{alike.plan_after}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-[14px] text-zinc-700">
                    <Pill tone="amber" small>
                      {b.alike_status === "pending" ? "Pending" : "Not available"}
                    </Pill>
                    Earlier team decision (saved by Alike): not found, so nothing here relies on it.
                  </span>
                )}
              </div>
            </Collapsible>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-200 px-6 py-4">
        <span className="min-w-0 flex-1 text-[14px] text-zinc-500">
          {L.northstar ? HINT[choice] : `Not sandbox-tested. ${L.team.product} can still propose the change; ${L.team.security} approves it knowing that.`}
        </span>
        {L.northstar && (
          <Button kind="secondary" onClick={() => props.openDrawer("scenario")}>
            Test in Scenario Studio
          </Button>
        )}
        {isProduct ? (
          <Button onClick={propose} disabled={L.northstar && choice !== "P0"}>
            {L.northstar ? `Propose ${choice} to ${L.person.security}` : `Propose a change to ${poss(L.team.security)} goal`}
          </Button>
        ) : (
          <Button disabled>Only {L.team.product} can propose</Button>
        )}
      </footer>
    </div>
  );
}
