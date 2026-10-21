"use client";
import { useEffect, type ReactNode } from "react";
import { companyMeasureId, decisionMeasureId, labelsFor, poss, type Labels } from "@/lib/labels";
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
  const kr2 = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s));
  const ceoChangeOpen = Boolean(kr2 && rel?.status === "UNKNOWN" && !s.timer?.started_at);
  const { mark } = props;
  // Landing here while the CEO's change is unresolved is seeing that change: start the time-to-agreement clock.
  useEffect(() => {
    if (ceoChangeOpen) mark("ceo_change_viewed");
  }, [ceoChangeOpen, mark]);
  const L = labelsFor(s);
  if (!L.northstar) return <CustomDecision props={props} L={L} />;

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

// ---- Custom scenario: the same decision path, built only from the operator's own setup. ----
// No sandbox runs and no agents exist here, so nothing below mentions tests passing or agents acting.

function CustomDecision({ props, L }: { props: ViewProps; L: Labels }) {
  const { s, me } = props;
  const isProduct = me.actor === "product";
  const asking = L.team.product;
  const owning = L.team.security;
  const owner = L.person.security;
  const rel = depRelation(s);
  const acc = accepted(s);
  const prop = activeProposal(s);
  const open = prop && !["RATIFIED", "REJECTED"].includes(prop.state);
  const requirement = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s));
  const plan = s.plans.find((p) => p.plan_id === s.scenario_config?.plan_id && p.plan_version === s.scenario_config?.plan_version);

  // 1 · Agreement reached
  if (acc && rel?.status === "ACCEPTED") {
    const goal = s.goals.find((g) => g.id === acc.new_goal_id);
    const newTarget = goal?.measures.find((m) => m.id === decisionMeasureId(s, acc))?.text ?? goal?.objective ?? "";
    return (
      <div className="flex flex-col gap-4">
        <Header label="Decision record" right={<Badge tone="neutral">Agreement reached</Badge>} />
        <div className="al-in">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">
            {poss(owning)} updated goal ({acc.accepted_version}) is now the shared plan for both teams.
          </h1>
          <p className="mt-2 max-w-[680px] text-[16px] text-zinc-700">
            The previous version is kept.{acc.ratified_at ? ` Approved by ${owner} at ${fmtTime(acc.ratified_at)}.` : ""}
          </p>
        </div>
        {/* The approved target shows once, at the top of the old-plan panel (and in the header card). */}
        <ul aria-label="What this record shows" className="flex flex-col gap-1.5 rounded-[14px] border border-zinc-200 bg-white p-[18px] text-[17px] text-zinc-900">
          <li>
            <span className="font-semibold">Decision:</span> recorded
          </li>
          <li>
            <span className="font-semibold">Work done:</span> not verified yet
          </li>
          <li>
            <span className="font-semibold">Outcome:</span> not measured yet
          </li>
        </ul>
        <OldPlanWork s={s} L={L} owningIds={acc.affected_work_item_ids ?? []} askingIds={acc.asking_work_item_ids ?? []} revision={newTarget} viewer={me.actor} />
        <ProofStrip s={s} />
      </div>
    );
  }

  // 2 · A proposal is in progress
  if (open && prop) {
    const needsMe = isProduct ? prop.state === "COUNTERED" : ["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(prop.state);
    const latest = prop.counter_versions.at(-1);
    const title = isProduct
      ? prop.state === "PENDING_SECURITY"
        ? `Proposal sent to ${owner}. Only ${owning} can approve a change to its goal.`
        : prop.state === "COUNTERED"
          ? `${owning} asked for changes to your proposal.`
          : `You accepted ${poss(owning)} changes. Waiting for ${owning} to approve.`
      : prop.state === "COUNTERED"
        ? `Your requested changes are with ${asking}.`
        : prop.state === "ACKNOWLEDGED_BY_PRODUCT"
          ? `${asking} accepted your changes. Approve to make it the shared plan.`
          : `${asking} proposes a change to your goal.`;
    return (
      <div className="flex flex-col gap-4">
        <Header label="Next decision" right={<StateBadge state={prop.state} labels={L} />} />
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">{title}</h1>
          <p className="mt-2 max-w-[680px] text-[16px] text-zinc-700">Both of you see the same proposal and the same changes. Every version is kept.</p>
        </div>
        <div className="grid grid-cols-2 gap-[18px] rounded-[14px] border border-zinc-200 bg-zinc-50 p-[18px]">
          <div className="flex flex-col gap-2">
            <span className="al-lbl">
              {poss(asking)} proposed target for {owning}
            </span>
            <p className="text-[16px] text-zinc-900">{prop.proposed_measure_text}</p>
            <span className="self-start">
              <Badge tone="amber">Not sandbox-tested</Badge>
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="al-lbl">What {asking} will do in return</span>
            <p className="text-[16px] text-zinc-900">{prop.reciprocal_commitment}</p>
          </div>
        </div>
        {latest && (
          <div className="al-in flex flex-col gap-1.5 rounded-[14px] border border-amber-700 p-[18px]">
            <span className="flex items-center gap-2.5">
              <Badge tone="amber">Changes from {owning}</Badge>
              <span className="text-[14px] text-zinc-500">{fmtTime(latest.at)}</span>
            </span>
            <p className="text-[16px] text-zinc-900">{latest.proposed_measure_text}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          {needsMe ? (
            <Button onClick={() => props.go("proposals")}>Review and decide →</Button>
          ) : (
            <span className="text-[16px] text-zinc-600">Nothing for you to do until {isProduct ? owning : asking} responds.</span>
          )}
        </div>
      </div>
    );
  }

  // Nothing to decide until the company requirement creates the dependency.
  if (!rel || !requirement) {
    return (
      <div className="flex flex-col gap-4">
        <Header label="Next decision" />
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Nothing needs your decision right now.</h1>
        <p className="max-w-[680px] text-[16px] text-zinc-700">When the company goal changes, anything that affects your team shows up here first.</p>
      </div>
    );
  }

  // 3 · Open decision: the owning team's current goal vs the company's new requirement
  const ownerGoal = currentGoal(s, "security");
  return (
    <div className="flex flex-col gap-5">
      <Header label={`Should ${owning} change its goal?`} right={<Badge tone="amber">Needs your judgment</Badge>} />
      <div>
        <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.015em] text-zinc-900">
          The company goal changed. {poss(owning)} goal didn&apos;t.
        </h1>
        <p className="mt-2.5 max-w-[760px] text-[18px] leading-relaxed text-zinc-700">{rel.label}</p>
      </div>
      {/* The new requirement is already in the company strip above; this card shows only what it collides with. */}
      <div>
        <article className="flex flex-col gap-3 rounded-[14px] border border-zinc-200 bg-zinc-50 p-5">
          <span className="al-lbl">
            {poss(owning)} goal today{ownerGoal ? ` · ${ownerGoal.version}` : ""}
          </span>
          <p className="text-[20px] font-semibold leading-snug text-zinc-900">{ownerGoal?.objective ?? "Unknown"}</p>
          {ownerGoal?.measures.map((m) => (
            <span key={m.id} className="text-[16px] text-zinc-700">
              {m.text}
            </span>
          ))}
        </article>
      </div>
      {plan && (
        <article className="flex flex-col gap-2 rounded-[14px] border border-violet-700 bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="al-lbl !text-violet-700">Proposed plan</span>
            <span className="ml-auto">
              <Badge tone="amber">Not sandbox-tested</Badge>
            </span>
          </div>
          <h3 className="text-[22px] font-semibold leading-snug text-zinc-900">{plan.title}</h3>
          {plan.text && <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-zinc-800">{plan.text}</p>}
        </article>
      )}
      <div className="flex flex-wrap items-center gap-5 rounded-[14px] border border-zinc-300 bg-white px-5 py-4">
        <div className="min-w-[280px] flex-1">
          <div className="text-[18px] font-semibold text-zinc-900">{owning} owns the decision.</div>
          <div className="text-[16px] text-zinc-700">
            {asking} can propose the change. Only {owner} can approve a change to {poss(owning)} goal.
          </div>
        </div>
        {isProduct ? (
          <Button onClick={() => props.go("proposals")}>Propose the change →</Button>
        ) : (
          <span className="text-[16px] text-zinc-600">{asking} hasn&apos;t proposed it yet. When they do, you decide here.</span>
        )}
      </div>
    </div>
  );
}

/**
 * Work still on the old plan, always expanded: the owning team's items tied to the goal that changed, then the
 * asking team's own items to check against what it committed to. The approved revision shows once, above both.
 */
function OldPlanWork({
  s,
  L,
  owningIds,
  askingIds,
  revision,
  viewer,
}: {
  s: ViewProps["s"];
  L: Labels;
  owningIds: string[];
  askingIds: string[];
  revision: string;
  viewer: ViewProps["me"]["actor"];
}) {
  // "your" only when the asking team itself is looking; everyone else reads whose commitment it is.
  const commitment = viewer === "product" ? "check against your new commitment" : `check against ${poss(L.team.product)} new commitment`;
  const find = (ids: string[]) => ids.map((id) => s.work_items.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => Boolean(w));
  const owning = find(owningIds);
  const asking = find(askingIds);
  const row = "flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-zinc-50 p-3.5 ring-1 ring-zinc-200";
  return (
    <section aria-label="Work still on the old plan" className="rounded-[14px] border border-amber-700 bg-white p-[18px]">
      <div className="al-lbl mb-3 !text-amber-700">Work still on the old plan</div>
      <div className="mb-3 flex flex-col gap-1 rounded-[10px] bg-amber-50 px-3.5 py-3 ring-1 ring-amber-300">
        <span className="al-lbl">Approved revision</span>
        <span className="text-[17px] leading-snug text-zinc-900">{revision}</span>
      </div>
      {owning.length === 0 && asking.length === 0 ? (
        <p className="text-[16px] text-zinc-700">No work items were tied to this goal</p>
      ) : (
        <div className="flex flex-col gap-4">
          {owning.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="al-lbl">{L.team.security}</span>
              <ul className="flex flex-col gap-2.5">
                {owning.map((w) => (
                  <li key={w.id} className={row}>
                    <span className="text-[17px] font-semibold leading-snug text-zinc-900">{w.task}</span>
                    <Badge tone="amber">needs update → {L.person[w.owner]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {asking.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="al-lbl">{L.team.product}</span>
              <ul className="flex flex-col gap-2.5">
                {asking.map((w) => (
                  <li key={w.id} className={row}>
                    <span className="text-[17px] font-semibold leading-snug text-zinc-900">{w.task}</span>
                    <Badge tone="neutral">{commitment}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
