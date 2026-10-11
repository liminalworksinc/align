"use client";
import { useEffect, type ReactNode } from "react";
import type { SimulationRun } from "@/lib/types";
import type { ViewProps } from "./props";
import { AuthorityStrip } from "./AuthorityStrip";
import { ProofStrip } from "./ProofStrip";
import { accepted, activeProposal, comparablePair, currentGoal } from "./select";
import { depRelation } from "./TeamLens";
import { Badge, Button, OWNER_LABEL, StateBadge, fmtTime } from "./ui";

function passed(r?: SimulationRun) {
  return r ? r.checks.filter((c) => c.passed).length : 0;
}

/** Did the run leave the critical security ticket alone? undefined when the evidence doesn't say. */
function leftCriticalAlone(r?: SimulationRun) {
  const c = r?.checks.find((x) => x.id === "protected-p0");
  return c ? c.passed : undefined;
}

function PlanCard({
  props,
  run,
  label,
  name,
  recommended,
}: {
  props: ViewProps;
  run?: SimulationRun;
  label: string;
  name: string;
  recommended?: boolean;
}) {
  const ok = run?.verdict === "PASS";
  const alone = leftCriticalAlone(run);
  return (
    <article
      className={`flex flex-col gap-3 rounded-[14px] border p-5 ${recommended ? "border-violet-700 bg-white shadow-[inset_0_0_0_1px_var(--al-accent)]" : "border-zinc-200 bg-zinc-50"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`al-lbl ${recommended ? "!text-violet-700" : ""}`}>{label}</span>
        {run && <span className="ml-auto"><StateBadge state={run.verdict} /></span>}
      </div>
      <h3 className="text-[22px] font-semibold leading-snug text-zinc-900">{name}</h3>
      {run ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className={`text-[56px] font-semibold leading-none tracking-[-0.02em] ${ok ? "text-emerald-700" : "text-red-700"}`}>
              {passed(run)} / {run.checks.length}
            </span>
            <span className="text-[16px] text-zinc-700">checks passed</span>
          </div>
          <p className={`text-[16px] font-medium ${alone === false ? "text-red-700" : "text-zinc-900"}`}>
            {alone === false ? "✕ Changed the critical security ticket it had to leave alone" : alone ? "✓ Left the critical security ticket alone" : "Critical security ticket: not checked"}
          </p>
        </>
      ) : (
        <p className="text-[16px] text-zinc-700">
          <StateBadge state="UNTESTED" /> Not tested yet in the practice sandbox.
        </p>
      )}
      <div className="mt-auto pt-1">
        <button onClick={() => props.openDrawer("scenario")} className="text-[14px] font-semibold text-violet-700 hover:underline">
          See every check →
        </button>
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
  const ceoChangeOpen = Boolean(kr2 && rel?.status === "UNKNOWN" && !s.timer?.started_at);
  const { mark } = props;
  // Landing here while the CEO's change is unresolved is seeing that change: start the time-to-agreement clock.
  useEffect(() => {
    if (ceoChangeOpen) mark("ceo_change_viewed");
  }, [ceoChangeOpen, mark]);

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
        <AuthorityStrip s={s} />
        {goal && (
          <div className="rounded-[14px] border border-zinc-200 bg-zinc-50 p-[18px]">
            <div className="al-lbl mb-1">Security&apos;s new target</div>
            <p className="text-[15px] text-zinc-900">{goal.measures.find((m) => m.id === "S-M3")?.text ?? goal.objective}</p>
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
        <AuthorityStrip s={s} />
        <div className="grid grid-cols-2 gap-[18px] rounded-[14px] border border-zinc-200 bg-zinc-50 p-[18px]">
          <div className="flex flex-col gap-2">
            <span className="al-lbl">Product&apos;s proposed target for Security</span>
            <p className="text-[15px] text-zinc-900">{prop.proposed_measure_text}</p>
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
    <div className="flex flex-col gap-5">
      <Header label="Should Security change what its AI works on next?" right={<Badge tone="amber">Needs your judgment</Badge>} />
      <div>
        <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.015em] text-zinc-900">
          Your company&apos;s priorities changed. Your agent&apos;s plan didn&apos;t.
        </h1>
        <p className="mt-2.5 max-w-[760px] text-[17px] leading-relaxed text-zinc-700">
          The CEO now requires beta customers&apos; issues to be handled first. Security&apos;s approved plan still prioritizes ticket volume, oldest first.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <PlanCard props={props} run={baseline} label="Current plan · running now" name="Oldest tickets first" />
        <PlanCard props={props} run={candidate} recommended label="Tested alternative" name="Beta customers' issues first" />
      </div>
      <p className="text-[14px] text-zinc-500">
        Same practice tickets, same pass/fail checks, in a sandbox. It shows how each plan handles tickets, not whether the launch will succeed.
      </p>
      <div className="flex flex-wrap items-center gap-5 rounded-[14px] border border-zinc-300 bg-white px-5 py-4">
        <div className="min-w-[280px] flex-1">
          <div className="text-[18px] font-semibold text-zinc-900">Security owns the decision.</div>
          <div className="text-[15px] text-zinc-700">Product can propose the tested change. Only Security can approve its own commitment.</div>
        </div>
        {isProduct ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="ghost" onClick={() => props.openDrawer("brief")}>
              Review the conflict with Security
            </Button>
            <Button onClick={propose}>{candPassed ? "Propose the tested change →" : "Propose the change (not tested yet) →"}</Button>
          </div>
        ) : (
          <span className="text-[15px] text-zinc-600">
            Product hasn&apos;t proposed it yet. When they do, you decide here.
          </span>
        )}
      </div>
    </div>
  );
}
