"use client";
import type { ReactNode } from "react";
import type { SimulationRun } from "@/lib/types";
import type { ViewProps } from "./props";
import { ProofStrip } from "./ProofStrip";
import { accepted, activeProposal, comparablePair, currentGoal } from "./select";
import { depRelation } from "./TeamLens";
import { Badge, Button, OWNER_LABEL, STATE_LABEL, StateBadge, fmtTime } from "./ui";

const PLAN_NAME: Record<string, string> = {
  "p-throughput": "Current plan: oldest tickets first",
  "p-beta": "New plan: beta issues first",
};

function passed(r?: SimulationRun) {
  return r ? r.checks.filter((c) => c.passed).length : 0;
}

/** Did the run leave the critical security ticket alone? undefined when the evidence doesn't say. */
function leftCriticalAlone(r?: SimulationRun) {
  const c = r?.checks.find((x) => x.id === "protected-p0");
  return c ? c.passed : undefined;
}

function Point({ ok, children }: { ok: boolean | undefined; children: ReactNode }) {
  const mark = ok === undefined ? "–" : ok ? "✓" : "✕";
  const cls = ok === undefined ? "bg-zinc-100 text-zinc-500" : ok ? "bg-emerald-700 text-black" : "bg-red-700 text-black";
  return (
    <li className="flex items-start gap-2.5 text-[14px] leading-snug text-zinc-900">
      <span aria-hidden className={`mt-px grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold ${cls}`}>
        {mark}
      </span>
      {children}
    </li>
  );
}

function PlanCard({
  props,
  run,
  tag,
  recommended,
  points,
  summary,
}: {
  props: ViewProps;
  run?: SimulationRun;
  tag: ReactNode;
  recommended?: boolean;
  points: ReactNode;
  summary: string;
}) {
  const name = run ? PLAN_NAME[run.plan_id] ?? "Team plan" : recommended ? PLAN_NAME["p-beta"] : PLAN_NAME["p-throughput"];
  return (
    <article
      className={`flex flex-col gap-3 rounded-[14px] border p-[18px] ${recommended ? "border-violet-700 bg-white shadow-[inset_0_0_0_1px_var(--al-accent)]" : "border-zinc-200 bg-zinc-50"}`}
    >
      <div className="flex items-center gap-2">{tag}</div>
      <h3 className="text-[19px] font-semibold leading-snug text-zinc-900">{name}</h3>
      <p className="text-[14px] text-zinc-600">{summary}</p>
      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">Practice test</span>
          {run ? (
            <span className="flex items-center gap-2 text-[13px] text-zinc-500">
              <StateBadge state={run.verdict} /> {passed(run)} of {run.checks.length} checks
            </span>
          ) : (
            <StateBadge state="UNTESTED" />
          )}
        </div>
        <ul className="flex flex-col gap-2">{points}</ul>
      </div>
      <div className="mt-auto pt-1">
        <Button kind="secondary" onClick={() => props.openDrawer("scenario")}>
          See the test results
        </Button>
      </div>
    </article>
  );
}

function Header({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="al-lbl !text-[13px] !text-violet-700">{label}</span>
      <span className="ml-auto">{right}</span>
    </div>
  );
}

export function DecisionView(props: ViewProps) {
  const { s, me } = props;
  const isProduct = me.actor === "product";
  const rel = depRelation(s);
  const acc = accepted(s);
  const prop = activeProposal(s);
  const open = prop && !["RATIFIED", "REJECTED"].includes(prop.state);
  const { baseline, candidate, interruption } = comparablePair(s);
  const kr2 = currentGoal(s, "ceo")?.measures.find((m) => m.id === "KR2");

  // 1 · Agreement reached
  if (acc && rel?.status === "ACCEPTED") {
    const goal = s.goals.find((g) => g.id === acc.new_goal_id);
    return (
      <div className="flex flex-col gap-4">
        <Header label="Decision record" right={<Badge tone="neutral">Agreement reached</Badge>} />
        <div className="al-in">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">
            Security&apos;s updated goal ({acc.accepted_version}) is now the shared plan for both teams.
          </h1>
          <p className="mt-2 max-w-[680px] text-[15px] text-zinc-700">
            Handling beta customers&apos; issues moves to the top of Security&apos;s list. The previous version is kept.
            {acc.ratified_at ? ` Approved at ${fmtTime(acc.ratified_at)}.` : ""}
          </p>
        </div>
        {goal && (
          <div className="rounded-[14px] border border-zinc-200 bg-zinc-50 p-[18px]">
            <div className="al-lbl mb-1">Security&apos;s goal now</div>
            <p className="text-[15px] text-zinc-900">{goal.objective}</p>
          </div>
        )}
        <ProofStrip s={s} />
        <div className="flex flex-wrap gap-2.5">
          <Button kind="secondary" onClick={() => props.go("goals")}>
            See how the goals connect
          </Button>
          <Button kind="ghost" onClick={() => props.go("evidence")}>
            See the full record
          </Button>
        </div>
      </div>
    );
  }

  // 2 · A proposal is in progress
  if (open && prop) {
    const needsMe = isProduct ? prop.state === "COUNTERED" : ["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(prop.state);
    const latest = prop.counter_versions.at(-1);
    const title = isProduct
      ? prop.state === "PENDING_SECURITY"
        ? `Proposal sent to ${OWNER_LABEL.security}. Only Security can approve a change to its goal.`
        : prop.state === "COUNTERED"
          ? "Security asked for changes to your proposal."
          : "You accepted Security's changes. Waiting for Security to approve."
      : prop.state === "COUNTERED"
        ? "Your requested changes are with Product."
        : prop.state === "ACKNOWLEDGED_BY_PRODUCT"
          ? "Product accepted your changes. Approve to make it the shared plan."
          : "Product proposes a change to your goal.";
    return (
      <div className="flex flex-col gap-4">
        <Header label="Next decision" right={<StateBadge state={prop.state} />} />
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">{title}</h1>
          <p className="mt-2 max-w-[680px] text-[15px] text-zinc-700">
            Both of you see the same proposal, the same changes and the same test results. Every version is kept.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-[18px] rounded-[14px] border border-zinc-200 bg-zinc-50 p-[18px]">
          <div className="flex flex-col gap-2">
            <span className="al-lbl">New target for Security</span>
            <p className="text-[15px] text-zinc-900">{latest?.proposed_measure_text ?? prop.proposed_measure_text}</p>
            <span className="self-start">
              <StateBadge state={prop.test_status} />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="al-lbl">What Product will do in return</span>
            <p className="text-[15px] text-zinc-900">{prop.reciprocal_commitment}</p>
          </div>
        </div>
        {latest && (
          <div className="al-in flex flex-col gap-1.5 rounded-[14px] border border-amber-700 p-[18px]">
            <span className="flex items-center gap-2.5">
              <Badge tone="amber">Changes from Security</Badge>
              <span className="text-[13px] text-zinc-500">{fmtTime(latest.at)}</span>
            </span>
            <p className="text-[15px] text-zinc-900">{latest.proposed_measure_text}</p>
            <span className="text-[13px] text-zinc-500">
              {latest.changes_plan ? "These changes alter how the agent works, so the test must run again." : "Wording only. How the agent works is unchanged, so the test still counts."}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button kind={needsMe ? "primary" : "secondary"} onClick={() => props.go("proposals")}>
            {needsMe ? "Review and decide →" : "Open the proposal"}
          </Button>
          {!needsMe && <span className="text-[14px] text-zinc-500">Nothing for you to do until {isProduct ? "Security" : "Product"} responds.</span>}
        </div>
      </div>
    );
  }

  // Nothing to decide until the CEO's change creates the dependency.
  if (!rel || !kr2) {
    return (
      <div className="flex flex-col gap-4">
        <Header label="Next decision" />
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Nothing needs your decision right now.</h1>
        <p className="max-w-[680px] text-[15px] text-zinc-700">
          When the CEO changes the company goal, anything that affects your team shows up here first.
        </p>
        <div>
          <Button kind="secondary" onClick={() => props.go("goals")}>
            See how the goals connect
          </Button>
        </div>
      </div>
    );
  }

  // 3 · Open decision: current plan vs recommended plan
  const baseAlone = leftCriticalAlone(baseline);
  const candAlone = leftCriticalAlone(candidate);
  const candPassed = candidate?.verdict === "PASS";
  const propose = () => {
    if (candidate)
      props.setAttached({
        plan_id: candidate.plan_id,
        plan_version: candidate.plan_version,
        simulation_refs: [baseline?.id, candidate.id, interruption?.id].filter((x): x is string => Boolean(x)),
      });
    props.go("proposals");
  };
  return (
    <div className="flex flex-col gap-4">
      <Header label="Next decision" right={<Badge tone="amber">Needs your judgment</Badge>} />
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">
          {isProduct
            ? "Security's AI agents are busy with work that doesn't move the CEO's new goal."
            : "The CEO's new requirement isn't covered by your current plan."}
        </h1>
        <p className="mt-2 max-w-[720px] text-[15px] text-zinc-700">
          {isProduct
            ? "Security's plan was set before the CEO's change. Align found a tested alternative based on the goals, Security's constraints and the open beta customer issue. You can't change Security's goal, but you can propose it."
            : "Compare both plans on the same practice test. Only you can change your goal; Product can propose a change."}
        </p>
      </div>
      <div className="grid grid-cols-[1fr_44px_1fr] items-stretch">
        <PlanCard
          props={props}
          run={baseline}
          tag={<Badge tone="neutral" icon={false}>Running now</Badge>}
          summary="The AI agent works through the queue oldest first. The beta customer's issue waits at normal priority."
          points={
            <>
              <Point ok={false}>Doesn&apos;t mention the beta</Point>
              <Point ok={baseAlone}>{baseAlone === false ? "Touched the critical security ticket it should leave alone" : "Left the critical security ticket alone"}</Point>
              <Point ok={undefined}>Rewards closing tickets, not launch readiness</Point>
            </>
          }
        />
        <div className="grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full border border-zinc-200 bg-zinc-100 font-mono text-[12px] font-bold">vs</span>
        </div>
        <PlanCard
          props={props}
          run={candidate}
          recommended
          tag={
            <>
              <Badge tone="violet">Recommended</Badge>
              <span className="ml-auto text-[13px] text-zinc-500">Based on the goals and test results</span>
            </>
          }
          summary="Beta customers' issues first: marked urgent, tagged as beta, a private note for engineers and a reply to the customer. Other tickets untouched."
          points={
            <>
              <Point ok={candPassed ? true : undefined}>Meets the CEO&apos;s new requirement{candPassed ? " in the practice test" : " (not shown by a passed test yet)"}</Point>
              <Point ok={candAlone}>{candAlone === false ? "Touched the critical security ticket" : "Left the critical security ticket alone"}</Point>
              <Point ok={interruption ? interruption.verdict === "PASS" : undefined}>
                {interruption ? `Recovered safely when the ticket system failed mid-run` : "Outage test not run yet"}
              </Point>
            </>
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        {isProduct ? (
          <>
            <Button onClick={propose}>Propose the recommended plan to Security →</Button>
            <Button kind="ghost" onClick={() => props.openDrawer("brief")}>
              See all options
            </Button>
            <span className="text-[13px] text-zinc-500">Creates a proposal. Security decides; nothing changes for them until they approve.</span>
          </>
        ) : (
          <span className="text-[14px] text-zinc-500">
            {rel ? `Status: ${STATE_LABEL[rel.status] ?? rel.status}. ` : ""}Product hasn&apos;t proposed a change yet. When they do, it shows up here.
          </span>
        )}
      </div>
    </div>
  );
}
