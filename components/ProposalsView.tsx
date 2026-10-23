"use client";
import { useEffect, useRef, useState } from "react";
import { CONDITIONS_UNCONFIRMED, companyMeasureId, conditionsUnconfirmedNote, conflictMeasureId, labelsFor, poss, type Labels } from "@/lib/labels";
import type { Proposal, SimulationRun, StateView, TestStatus } from "@/lib/types";
import type { ViewProps } from "./props";
import { activeProposal, currentGoal, priorVersion } from "./select";
import { Badge, Button, OWNER_LABEL, STATE_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { api } from "./useAlign";
import { nextStepHint } from "./nextStep";
import { ProofStrip } from "./ProofStrip";
import { SpartaProof } from "./SpartaProof";
import { STALE_APPROVAL_NOTE, agreementStatus, approvedStale, launchLine } from "./launch";
import { Chip, Collapsible, InkPill, Lbl, Msg, NumberedLines, Old, Option, conditionLines } from "./v6/thread";

/** Mirrors lib/flow.ts MAX_CONDITIONS (the server refuses longer conditions). */
const MAX_CONDITIONS = 1000;

/** Who speaks for a slot or role. Northstar keeps OWNER_LABEL; custom scenarios use the operator's names. */
function whoFor(L: Labels) {
  return (k: string) => (L.northstar ? (OWNER_LABEL[k] ?? k) : ((L.person as Record<string, string>)[k] ?? k));
}

/** Text the counter added to the previous version, when it only appended (e.g. "and its private notes stay untouched too"). */
function addedText(prev: string, next: string): string | null {
  const base = prev.replace(/[.\s]+$/, "");
  return next.startsWith(base) && next.length > base.length ? next.slice(base.length).replace(/^[,\s]+/, "") : null;
}

const DEFAULT_MEASURE =
  "Beta customers' issues are handled first: marked urgent, tagged as beta, a private note for engineers, and a reply to the customer. The critical security ticket is not touched";
const DEFAULT_RATIONALE =
  "The CEO changed a requirement today: the beta launch comes first. Security's current target only counts how many tickets get closed, oldest first, so beta issues wait in line. The attached practice test runs the current plan and the new plan on the same practice tickets, with the same pass/fail checks.";
const DEFAULT_COMMITMENT =
  "Product will tag every beta issue as beta when it comes in and publish exactly what is in the beta by Wednesday. Product will postpone the ticket dashboard polish.";
const COUNTER_SUFFIX = ", and its private notes stay untouched too";
const OLD_MEASURE_FALLBACK = "Close as many tickets as possible per day, oldest first";

/** Plain names for the two plans; the plan id stays as a small secondary reference. */
const PLAN_NAME: Record<string, string> = {
  "p-beta": "New plan: beta issues first",
  "p-throughput": "Current plan: oldest tickets first",
};
const planName = (id: string) => PLAN_NAME[id] ?? id;
const RUN_KIND: Record<string, string> = {
  normal: "Normal run",
  interruption: "Outage test: the ticket system failed mid-run",
};

const OPEN_STATES = ["PENDING_SECURITY", "COUNTERED", "ACKNOWLEDGED_BY_PRODUCT", "DRAFT"];

const inputCls =
  "w-full rounded-lg bg-white px-3 py-2 text-[16px] leading-relaxed text-zinc-900 ring-1 ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600";

/** Mirrors lib/flow.ts testStatusFor so the composer can show what the server will compute. */
function expectedStatus(s: StateView, plan: { plan_id: string; plan_version: number; plan_hash: string }, refs: string[]): TestStatus {
  const runs = s.simulations.filter((r) => refs.includes(r.id));
  const pass = runs.find(
    (r) => r.plan_id === plan.plan_id && r.plan_version === plan.plan_version && r.plan_hash === plan.plan_hash && r.verdict === "PASS",
  );
  if (!pass) return "UNTESTED";
  const comparable = runs.some(
    (r) =>
      r.verdict === "FAIL" &&
      r.plan_id !== plan.plan_id &&
      r.mission_id === pass.mission_id &&
      r.seed_version === pass.seed_version &&
      r.checks_version === pass.checks_version,
  );
  return comparable ? "TESTED" : "UNTESTED";
}

function TestStatusBadge({ status, L }: { status: TestStatus; L?: Labels }) {
  if (L && !L.sandbox && status !== "TESTED") return <Badge tone="amber">Not sandbox-tested</Badge>;
  if (status === "TESTED") return <Badge tone="neutral">Tested: the new plan passed the same checks the current plan failed</Badge>;
  if (status === "STALE")
    return <Badge tone="amber">Needs a new test: the changes alter how the agent works, so no one can say it passed until it runs again</Badge>;
  return <Badge tone="amber">Not tested: no matching passed test is attached</Badge>;
}

function VerdictBadge({ verdict }: { verdict: SimulationRun["verdict"] }) {
  // A FAIL baseline is a real failed check (red). A PASS is shown neutral here; green is reserved for the narrow verified outcome.
  return verdict === "FAIL" ? <Badge tone="red">Failed</Badge> : <Badge tone="neutral">Passed</Badge>;
}

function PlanLabel({ id }: { id: string }) {
  return <span className="font-semibold text-zinc-900">{planName(id)}</span>;
}

function RunList({ runs, missing }: { runs: SimulationRun[]; missing?: string[] }) {
  if (!runs.length && !missing?.length) return <p className="text-[16px] text-zinc-500">No test runs attached.</p>;
  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-[15px] ring-1 ring-zinc-200">
          <VerdictBadge verdict={r.verdict} />
          <span className="font-semibold text-zinc-900">{planName(r.plan_id)}</span>
          <span className="text-zinc-600">{RUN_KIND[r.scenario] ?? r.scenario}</span>
          {r.checks.length > 0 && (
            <span className="text-zinc-500">
              {r.checks.filter((c) => c.passed).length} of {r.checks.length} checks passed
            </span>
          )}
        </li>
      ))}
      {missing?.map((m) => (
        <li key={m} className="text-[15px] text-amber-900">
          ▲ One of the attached test runs couldn&apos;t be found
        </li>
      ))}
    </ul>
  );
}

function Card({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "readonly" | "amber" | "violet" }) {
  const c = {
    plain: "bg-white ring-zinc-200",
    readonly: "bg-zinc-50 ring-zinc-200",
    amber: "bg-amber-50 ring-amber-300",
    violet: "bg-violet-50 ring-violet-300",
  }[tone];
  return <div className={`rounded-xl p-4 ring-1 ${c}`}>{children}</div>;
}

/** Custom scenarios: the operator's inline plan, in place of the Sparta and Alike sections. Plain text only. */
function PlanSection({ s, planId, planVersion }: { s: StateView; planId: string; planVersion: number }) {
  const plan = s.plans.find((x) => x.plan_id === planId && x.plan_version === planVersion);
  return (
    <Section title="The plan">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-semibold text-zinc-900">{plan?.title ?? "No plan was set up"}</span>
          <Badge tone="amber">Not sandbox-tested</Badge>
        </div>
        {plan?.text && <p className="mt-2 whitespace-pre-wrap text-[16px] leading-relaxed text-zinc-900">{plan.text}</p>}
        <p className="mt-2 text-[16px] text-zinc-600">This plan has no sandbox test. Approving it means approving it as not sandbox-tested.</p>
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------

export function ProposalsView(props: ViewProps) {
  const { s, me, selection } = props;
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async <T,>(path: string, body: unknown = {}) => {
    setBusy(true);
    try {
      return await props.act<T>(path, body);
    } finally {
      setBusy(false);
    }
  };

  const list = [...s.proposals].reverse();
  const openOne = s.proposals.find((p) => OPEN_STATES.includes(p.state)) ?? null;
  const selected = selection?.kind === "proposal" ? s.proposals.find((p) => p.id === selection.id) : undefined;
  const active = selected ?? activeProposal(s);
  const isProduct = me.actor === "product";
  const showComposer = isProduct && !openOne && (composing || !active);
  const L = labelsFor(s);
  const who = whoFor(L);

  return (
    <div className={L.northstar ? "flex min-h-0 gap-5" : "flex min-h-0 flex-col gap-5 @[56rem]:flex-row"}>
      <aside className={L.northstar ? "w-72 shrink-0" : "w-full shrink-0 @[56rem]:w-72"} aria-label="Proposal inbox">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="al-lbl">Inbox</h2>
          {isProduct && !openOne && !showComposer && (
            <Button kind="secondary" onClick={() => setComposing(true)}>
              Propose a change
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="rounded-lg bg-zinc-50 p-3 text-[15px] text-zinc-500 ring-1 ring-zinc-200">No proposals yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((p) => {
              const isSel = !showComposer && active?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      props.select({ kind: "proposal", id: p.id });
                    }}
                    aria-current={isSel ? "true" : undefined}
                    className={`w-full rounded-lg p-3 text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${
                      isSel ? "bg-violet-50 ring-violet-400" : "bg-white ring-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    {L.northstar ? (
                      <div className="text-[16px] font-semibold text-zinc-900">Change to Security&apos;s goal ({p.target_goal_version})</div>
                    ) : (
                      <div className="text-[16px] font-semibold text-zinc-900">
                        Change to {poss(L.team.security)} goal ({p.target_goal_version})
                      </div>
                    )}
                    <div className="text-[14px] text-zinc-500">
                      {who(p.proposing_owner)} · {fmtTime(p.created_at)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StateBadge state={p.state} labels={L} />
                      {L.sandbox ? (
                        <Badge tone={p.test_status === "TESTED" ? "neutral" : "amber"}>{STATE_LABEL[p.test_status] ?? p.test_status}</Badge>
                      ) : (
                        <TestStatusBadge status={p.test_status} L={L} />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        {showComposer ? (
          <Composer {...props} busy={busy} run={run} onSent={() => setComposing(false)} />
        ) : active ? (
          // Keyed on state and revision count so Detail's local state (the untested tick) never carries over to a new revision.
          <Detail key={`${active.id}:${active.state}:${active.counter_versions.length}`} {...props} p={active} busy={busy} run={run} />
        ) : (
          <Card tone="readonly">
            <p className="text-[18px] font-semibold text-zinc-900">No proposals to your goal yet.</p>
            {L.northstar ? (
              <p className="mt-1 text-[16px] text-zinc-600">
                When Product proposes a change to Security&apos;s goal, it shows up here for you to decide on.
              </p>
            ) : (
              <p className="mt-1 text-[16px] text-zinc-600">
                When {L.team.product} proposes a change to {poss(L.team.security)} goal, it shows up here for you to decide on.
              </p>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

type Run = <T>(path: string, body?: unknown) => Promise<T | null>;

// ---------------------------------------------------------------------------------------------

function Composer(props: ViewProps & { busy: boolean; run: Run; onSent: () => void }) {
  const { s } = props;
  const L = labelsFor(s);
  const attached = L.northstar ? props.attached : null; // custom scenarios have no Sparta picker
  const secGoal = currentGoal(s, "security");
  const ceo = currentGoal(s, "ceo");
  const kr2 = ceo?.measures.find((m) => m.id === companyMeasureId(s));
  const oldMeasure = secGoal?.measures.find((m) => m.id === conflictMeasureId(s))?.text ?? (L.northstar ? OLD_MEASURE_FALLBACK : "—");

  const [measure, setMeasure] = useState(L.northstar ? DEFAULT_MEASURE : "");
  const [rationale, setRationale] = useState(L.northstar ? DEFAULT_RATIONALE : "");
  const [commitment, setCommitment] = useState(L.northstar ? DEFAULT_COMMITMENT : "");

  const customPlan = L.northstar ? undefined : s.plans[0];
  const planSel =
    attached ??
    (customPlan
      ? { plan_id: customPlan.plan_id, plan_version: customPlan.plan_version, simulation_refs: [] as string[] }
      : { plan_id: "p-beta", plan_version: 1, simulation_refs: [] as string[] });
  const plan = s.plans.find((p) => p.plan_id === planSel.plan_id && p.plan_version === planSel.plan_version);
  const runs = s.simulations.filter((r) => planSel.simulation_refs.includes(r.id));
  const missing = planSel.simulation_refs.filter((r) => !s.simulations.some((x) => x.id === r));
  const expectation = plan
    ? expectedStatus(s, { plan_id: plan.plan_id, plan_version: plan.plan_version, plan_hash: plan.hash }, planSel.simulation_refs)
    : "UNTESTED";
  const alike = s.brief.alike_status === "retrieved" ? s.brief.alike_ref : null;

  const send = async () => {
    const out = await props.run<Proposal>("/api/proposals", {
      proposed_measure_text: measure,
      rationale,
      reciprocal_commitment: commitment,
      plan_id: planSel.plan_id,
      plan_version: planSel.plan_version,
      simulation_refs: planSel.simulation_refs,
    });
    if (out) {
      props.setAttached(null);
      props.onSent();
      props.select({ kind: "proposal", id: out.id });
    }
  };

  const canSend = !props.busy && measure.trim() !== "" && commitment.trim() !== "";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) void send();
      }}
    >
      {L.northstar ? (
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Propose a change to Security&apos;s goal</h1>
      ) : (
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Propose a change to {poss(L.team.security)} goal</h1>
      )}

      <Section
        title={L.northstar ? "Security's goal today" : `${poss(L.team.security)} goal today`}
        right={
          L.northstar ? (
            <Badge tone="neutral">Security&apos;s goal · view only — you can propose a change, not edit it</Badge>
          ) : (
            <span className="ml-3 min-w-0">
              <Badge tone="neutral">{poss(L.team.security)} goal · view only — you can propose a change, not edit it</Badge>
            </span>
          )
        }
      >
        <Card tone="readonly">
          {secGoal ? (
            <>
              <div className="text-[15px] text-zinc-600">
                Owner <span className="font-semibold text-zinc-900">{L.northstar ? OWNER_LABEL.security : L.person.security}</span> · version{" "}
                <span className="font-semibold text-zinc-900">{secGoal.version}</span>
              </div>
              <p className="mt-1 text-[18px] font-semibold text-zinc-900">{secGoal.objective}</p>
              <ul className="mt-2 space-y-1">
                {secGoal.measures.map((m) => (
                  <li key={m.id} className="text-[16px] text-zinc-800">
                    {m.text}
                  </li>
                ))}
              </ul>
            </>
          ) : L.northstar ? (
            <p className="text-[16px] text-zinc-500">You can&apos;t see Security&apos;s goal right now.</p>
          ) : (
            <p className="text-[16px] text-zinc-500">You can&apos;t see {poss(L.team.security)} goal right now.</p>
          )}
        </Card>
      </Section>

      {L.northstar ? (
        <Section title="The CEO's new requirement">
          <Card tone="readonly">
            <div className="text-[15px] text-zinc-600">
              Set by CEO · view only · CEO goal ({ceo?.version ?? "—"}) {ceo?.changed && <Badge tone="amber">changed today</Badge>}
            </div>
            <p className="mt-1 text-[16px] text-zinc-900">{kr2?.text ?? "The CEO's new requirement isn't available right now."}</p>
          </Card>
        </Section>
      ) : (
        <Section title={`${poss(L.team.ceo)} new requirement`}>
          <Card tone="readonly">
            <div className="text-[16px] text-zinc-600">
              Set by {L.person.ceo} · view only · company goal ({ceo?.version ?? "—"})
            </div>
            <p className="mt-1 text-[16px] text-zinc-900">{kr2?.text ?? "The new requirement isn't available right now."}</p>
          </Card>
        </Section>
      )}

      <Section title="What you're proposing">
        <Card>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
            {L.northstar ? "Today Security is measured on" : `Today ${L.team.security} is measured on`}
          </div>
          <p
            className="mt-0.5 text-[16px] text-zinc-500 line-through decoration-zinc-400"
            aria-label={L.northstar ? `Replace Security's current target: ${oldMeasure}` : `Replace ${poss(L.team.security)} current target: ${oldMeasure}`}
          >
            {oldMeasure}
          </p>
          <label className="mt-3 block">
            <span className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-violet-800">
              <span aria-hidden className="font-mono">+</span> {L.northstar ? "New target for Security" : `New target for ${L.team.security}`}
            </span>
            <textarea className={inputCls} rows={3} maxLength={300} value={measure} onChange={(e) => setMeasure(e.target.value)} />
            {measure.length >= 300 && <span className="mt-1 block text-[14px] text-amber-700">Keep the new target under 300 characters.</span>}
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why</span>
            <textarea className={inputCls} rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">
              {L.northstar ? "What Product will do in return" : `What ${L.team.product} will do in return`}
            </span>
            <textarea className={inputCls} rows={2} value={commitment} onChange={(e) => setCommitment(e.target.value)} />
          </label>
        </Card>
      </Section>

      {!L.northstar && <PlanSection s={s} planId={planSel.plan_id} planVersion={planSel.plan_version} />}
      {L.northstar && (
      <Section title="Test results from Sparta">
        {attached ? (
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[16px]">
              <PlanLabel id={attached.plan_id} />
              <span className="text-zinc-600">Result once sent:</span>
              <TestStatusBadge status={expectation} />
            </div>
            {runs.length ? <SpartaProof runs={runs} onOpenTest={() => props.openDrawer("scenario")} /> : <RunList runs={runs} missing={missing} />}
          </Card>
        ) : (
          <Card tone="amber">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone="amber">No test results added</Badge>
                <p className="mt-1 text-[15px] text-amber-900">
                  If you send now, the new plan goes without any test runs, and the proposal will show as not tested.
                </p>
              </div>
              <Button kind="secondary" onClick={() => props.openDrawer("scenario")}>
                Test which plan follows the new priority
              </Button>
            </div>
          </Card>
        )}
        <p className="mt-2 text-[15px] text-zinc-700">
          Plan that will be sent: <PlanLabel id={planSel.plan_id} />
        </p>
      </Section>
      )}

      {L.northstar && (
      <Section title="Earlier team decision (saved by Alike, our AI-agent memory tool)">
        {alike ? (
          <Card tone="readonly">
            <div className="text-[15px] text-zinc-600">Saved {fmtTime(alike.recorded_at)}</div>
            <p className="mt-1 text-[16px] text-zinc-900">{alike.summary}</p>
          </Card>
        ) : (
          <p className="text-[16px] text-zinc-600">No earlier team decision was found, so nothing is shown here.</p>
        )}
      </Section>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSend}>
          {props.busy ? "Sending…" : `Send proposal to ${L.northstar ? OWNER_LABEL.security : L.person.security}`}
        </Button>
        {!measure.trim() && !L.northstar && <span className="text-[16px] text-amber-900">▲ Write the new target</span>}
        {!commitment.trim() &&
          (L.northstar ? (
            <span className="text-[15px] text-amber-900">▲ Say what Product will do in return</span>
          ) : (
            <span className="text-[16px] text-amber-900">▲ Say what {L.team.product} will do in return</span>
          ))}
      </div>
    </form>
  );
}


// ---------------------------------------------------------------------------------------------
// Review: the proposal as a message thread (v6). Each version of the target is shown once, in the bubble that
// introduced it; the owner answers below. Every action here is the same call and payload as before v6.

/** Plain run name for a test pill: which plan, which run, and the verdict with its checks. */
function runPill(r: SimulationRun, proposedPlan: string): { text: string; tone: "green" | "red" } {
  const side = r.plan_id === proposedPlan ? "New plan" : "Current plan";
  const kind = r.scenario === "normal" ? "" : " (outage test)";
  const n = r.checks.length ? ` ${r.checks.filter((c) => c.passed).length}/${r.checks.length}` : "";
  return { text: `${side}${kind}: ${r.verdict === "PASS" ? "passed" : "failed"}${n}`, tone: r.verdict === "PASS" ? "green" : "red" };
}

type Answer = "accept" | "acceptIf" | "counter" | "decline";

function Detail(props: ViewProps & { p: Proposal; busy: boolean; run: Run }) {
  const { s, me, p, busy } = props;
  const isSecurity = me.actor === "security";
  const isProduct = me.actor === "product";
  const L = labelsFor(s);
  const who = whoFor(L);
  const own = L.team.security;
  const ask = L.team.product;
  const target = s.goals.find((g) => g.id === p.target_goal_id);
  const oldMeasure = target?.measures.find((m) => m.id === conflictMeasureId(s))?.text ?? (L.northstar ? OLD_MEASURE_FALLBACK : "—");
  const runs = s.simulations.filter((r) => p.simulation_refs.includes(r.id));
  const missing = p.simulation_refs.filter((r) => !s.simulations.some((x) => x.id === r));
  const latestText = p.counter_versions.at(-1)?.proposed_measure_text ?? p.proposed_measure_text;
  const acc = s.acceptances.find((a) => a.proposal_id === p.id) ?? null;
  const canDecide = p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT";
  const [ratifyWhy, setRatifyWhy] = useState(L.northstar ? "Beta customers' issues now come first, and the critical security ticket stays off-limits." : "");
  // An untested custom plan, or stale evidence in any scenario, is approved only with this explicit acknowledgement
  // (sent as accept_untested). The server refuses either approval without it.
  const needsAck = (!L.northstar && p.test_status !== "TESTED") || p.test_status === "STALE";
  const [ackUntested, setAckUntested] = useState(false);
  // Custom: what the owning team made its approval depend on: its conditions field only, as on the decision record.
  const lastCounter = p.counter_versions.at(-1);
  const conditions = L.northstar ? "" : (lastCounter?.conditions?.trim() ?? "");
  const hint = nextStepHint(p, me.actor, L);
  const [answer, setAnswer] = useState<Answer>("accept");

  const ceo = currentGoal(s, "ceo");
  const ceoPrev = priorVersion(s, ceo);
  const companyNow = ceo?.measures.find((m) => m.id === companyMeasureId(s))?.text;
  const companyBefore = ceoPrev?.measures.find((m) => m.id === companyMeasureId(s))?.text;

  // Seeing the ratified record counts as "accepted version seen" for this session (server dedupes per actor).
  const marked = useRef<string | null>(null);
  const { mark } = props;
  useEffect(() => {
    if (p.state === "RATIFIED" && marked.current !== p.id) {
      marked.current = p.id;
      mark("saw_accepted_version");
    }
  }, [p.state, p.id, mark]);

  const footer = "flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4";

  return (
    <div className="max-w-[880px] space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={p.state} labels={L} />
          <TestStatusBadge status={p.test_status} L={L} />
        </div>
        {L.northstar ? (
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Proposed change to Security&apos;s goal ({p.target_goal_version})</h1>
        ) : (
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">
            Proposed change to {poss(own)} goal ({p.target_goal_version})
          </h1>
        )}
        <p className="text-[15px] text-zinc-600">
          From {who(p.proposing_owner)} to {who(p.recipient_owner)} · sent {fmtTime(p.created_at)}
        </p>
      </header>

      <ol className="space-y-3.5" aria-label="Conversation about this proposal">
        <Msg name={who(p.proposing_owner)} tag={<Chip>proposal · {p.target_goal_version}</Chip>} at={fmtTime(p.created_at)} me={me.actor === p.proposing_owner}>
          <p className="text-[15px]">
            <Lbl>Current</Lbl>
            <Old>{oldMeasure}</Old>
          </p>
          <p className="text-[15px] text-zinc-900">
            <Lbl accent>Proposed</Lbl>
            {p.proposed_measure_text}
          </p>
          {p.rationale && (
            <p className="text-[14px] text-zinc-600">
              <b className="text-zinc-700">Why:</b> {p.rationale}
            </p>
          )}
          <p className="text-[14px] text-zinc-600">
            <b className="text-zinc-700">In return:</b> {p.reciprocal_commitment || "—"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {L.sandbox && runs.length > 0
              ? runs.map((r) => {
                  const pill = runPill(r, p.plan_ref.plan_id);
                  return (
                    <Badge key={r.id} tone={pill.tone}>
                      {pill.text}
                    </Badge>
                  );
                })
              : <TestStatusBadge status={p.test_status} L={L} />}
          </div>
        </Msg>

        {p.counter_versions.map((c, i) => {
          const prev = i === 0 ? p.proposed_measure_text : p.counter_versions[i - 1].proposed_measure_text;
          const added = addedText(prev, c.proposed_measure_text);
          const same = c.proposed_measure_text.trim() === prev.trim();
          const lines = L.northstar ? [] : conditionLines(c.conditions);
          return (
            <Msg
              key={c.version}
              name={who(c.by)}
              tag={<Badge tone="amber">{lines.length && same ? "accept if" : "counter"} · {c.version}</Badge>}
              at={fmtTime(c.at)}
              tone="counter"
              me={me.actor === c.by}
            >
              {same ? (
                <p className="text-[15px] text-zinc-700">Kept the target as proposed.</p>
              ) : added ? (
                <p className="text-[15px] text-zinc-900">
                  …<mark className="rounded bg-violet-100 px-1 text-violet-900">{added}</mark>
                </p>
              ) : (
                <p className="text-[15px] text-zinc-900">
                  <Lbl accent>Revised</Lbl>
                  {c.proposed_measure_text}
                </p>
              )}
              {c.rationale && <p className="text-[14px] text-zinc-600">Why: {c.rationale}</p>}
              {L.northstar && c.changes_plan && <Badge tone="amber">Changes how the agent works: needs a new test</Badge>}
              {lines.length > 0 && (
                <div className="mt-1 space-y-1.5 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="al-lbl !text-[11px]">Conditions</span>
                    <Badge tone="amber">{CONDITIONS_UNCONFIRMED}</Badge>
                  </div>
                  <NumberedLines lines={lines} />
                  <p className="text-[13px] text-zinc-500">{conditionsUnconfirmedNote(lines.length)}</p>
                </div>
              )}
            </Msg>
          );
        })}

        {p.product_ack_at && lastCounter && (
          <Msg name={who(p.proposing_owner)} tag={<Chip>acknowledged {lastCounter.version}</Chip>} at={fmtTime(p.product_ack_at)} me={me.actor === p.proposing_owner}>
            <p className="text-[15px] text-zinc-900">
              {L.northstar
                ? "Accepted Security's changes and confirmed what Product will do."
                : `Accepted ${poss(own)} changes and confirmed what ${ask} will do.`}
            </p>
          </Msg>
        )}

        {p.state === "RATIFIED" && acc && (
          <Msg name={who(acc.ratified_by)} tag={<InkPill>ratified · goal {acc.accepted_version}</InkPill>} at={fmtTime(acc.ratified_at)} tone="ratified" me={me.actor === acc.ratified_by}>
            <div className="flex flex-wrap items-center gap-2">
              {L.northstar ? (
                <Badge tone="neutral">Approved: Security&apos;s goal ({acc.accepted_version})</Badge>
              ) : (
                <Badge tone="neutral">
                  {agreementStatus(acc)}: {poss(own)} goal ({acc.accepted_version})
                </Badge>
              )}
              <TestStatusBadge status={acc.test_status} L={L.northstar ? undefined : L} />
            </div>
            {acc.rationale && <p className="text-[15px] text-zinc-900">&ldquo;{acc.rationale}&rdquo;</p>}
            <p className="text-[14px] text-zinc-600">
              {target?.version ? `${target.version} kept as superseded. ` : ""}
              {acc.acknowledged_via === "authored_in_proposal"
                ? `${who(acc.acknowledged_by)} committed to its part in the proposal.`
                : `${who(acc.acknowledged_by)} accepted the changes at ${fmtTime(acc.acknowledged_at)}.`}
            </p>
            {!L.northstar && acc.test_status !== "TESTED" && (
              <p className="text-[14px] text-zinc-600">Approved without a sandbox test: the plan was not run before approval.</p>
            )}
            {L.northstar && approvedStale(s, acc) && <p className="text-[14px] text-amber-800">{STALE_APPROVAL_NOTE}</p>}
            {L.northstar && (
              <ol className="mt-1 space-y-1 text-[15px] text-zinc-900" aria-label="What happens next">
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">1</span> Security&apos;s AI agent switches to the{" "}
                  {planName(acc.plan_ref.plan_id).toLowerCase()}
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">2</span> Product tags beta issues as they come in
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">3</span> Product publishes what&apos;s in the beta
                </li>
              </ol>
            )}
            <p className="text-[14px] text-zinc-600">
              {L.northstar
                ? "Both teams agreeing doesn't prove the beta launch will work. A passed test only covers the practice tickets."
                : launchLine(acc, L)}
            </p>
            <div>
              {L.northstar ? (
                <Button kind="secondary" onClick={() => props.go("goals")}>
                  Back to goals
                </Button>
              ) : (
                <Button kind="secondary" onClick={() => props.go("decision")}>
                  See the decision
                </Button>
              )}
            </div>
          </Msg>
        )}

        {p.state === "REJECTED" && (
          <Msg name={who(p.recipient_owner)} tag={<Badge tone="red">declined</Badge>} tone="declined" me={me.actor === p.recipient_owner}>
            {L.northstar ? (
              <p className="text-[15px] text-zinc-700">{OWNER_LABEL.security} declined this proposal. Security&apos;s goal stays as it was.</p>
            ) : (
              <p className="text-[15px] text-zinc-700">
                {L.person.security} declined this proposal. {poss(own)} goal stays as it was.
              </p>
            )}
          </Msg>
        )}
      </ol>

      {p.state === "RATIFIED" && L.sandbox && <ProofStrip s={s} />}

      <div>
        <Collapsible title="Evidence">
          {L.northstar ? (
            <div className="space-y-2">
              {runs.length ? <SpartaProof runs={runs} onOpenTest={() => props.openDrawer("scenario")} /> : <RunList runs={runs} missing={missing} />}
              {missing.length > 0 && runs.length > 0 && <RunList runs={[]} missing={missing} />}
            </div>
          ) : (
            <PlanSection s={s} planId={p.plan_ref.plan_id} planVersion={p.plan_ref.plan_version} />
          )}
        </Collapsible>
        <Collapsible title="What changed upstream">
          <div className="space-y-2 text-[15px]">
            <p className="text-[14px] text-zinc-600">
              {L.northstar ? "Set by CEO" : `Set by ${L.person.ceo}`} · company goal ({ceo?.version ?? "—"})
            </p>
            {companyBefore && companyBefore !== companyNow && (
              <p>
                <Old>{companyBefore}</Old>
              </p>
            )}
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-zinc-900 ring-1 ring-amber-300">
              {companyNow ?? (L.northstar ? "The CEO's new requirement isn't available right now." : "The new requirement isn't available right now.")}
            </p>
          </div>
        </Collapsible>
      </div>

      {/* Role-gated answer and footers: each control is one the server accepts from this role in this state. */}
      {isSecurity && canDecide && (
        <section className="space-y-3 border-t border-zinc-200 pt-4" aria-labelledby={`decide-${p.id}`}>
          <h2 id={`decide-${p.id}`} className="al-lbl">
            Your decision
          </h2>
          {p.state === "ACKNOWLEDGED_BY_PRODUCT" && (
            <p className="text-[15px] text-zinc-700">
              {who(p.proposing_owner)} accepted your changes. Approve to make them {L.northstar ? "Security's" : poss(own)} goal.
            </p>
          )}
          <div role="radiogroup" aria-label="Your answer" className="flex flex-wrap gap-2.5">
            <Option on={answer === "accept"} title="Accept" sub="as written" onPick={() => setAnswer("accept")} />
            {!L.northstar && <Option on={answer === "acceptIf"} title="Accept if…" sub="with conditions" onPick={() => setAnswer("acceptIf")} />}
            <Option on={answer === "counter"} title="Counter" sub="edit the measure" onPick={() => setAnswer("counter")} />
            <Option on={answer === "decline"} title="Decline" sub="keep your goal as it is" onPick={() => setAnswer("decline")} />
          </div>

          {answer === "accept" && (
            <div className="al-in space-y-3">
              <label className="block">
                <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why you&apos;re approving</span>
                <input className={inputCls} value={ratifyWhy} onChange={(e) => setRatifyWhy(e.target.value)} />
              </label>
              {conditions && (
                <div aria-label="Your conditions" className="space-y-1.5 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-zinc-800">You asked for:</span>
                    <Badge tone="amber">{CONDITIONS_UNCONFIRMED}</Badge>
                  </div>
                  <NumberedLines lines={conditionLines(conditions)} />
                </div>
              )}
              {needsAck && (
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[16px] text-amber-950 ring-1 ring-amber-300">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-violet-700 focus-visible:outline-2 focus-visible:outline-violet-600"
                    checked={ackUntested}
                    onChange={(e) => setAckUntested(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">
                      {L.northstar
                        ? "The sandbox test no longer matches this plan. I'm approving it without a passing test."
                        : "I'm approving this plan without a sandbox test"}
                    </span>
                    <span className="block text-[16px] text-amber-900">
                      {L.northstar
                        ? "The decision record will say it was approved without a passing test."
                        : "The decision record will say it was approved as not sandbox-tested."}
                    </span>
                  </span>
                </label>
              )}
              <Button
                disabled={busy || !canDecide || (needsAck && !ackUntested)}
                onClick={() =>
                  void props.run(
                    `/api/proposals/${p.id}/accept`,
                    needsAck ? { rationale: ratifyWhy, accept_untested: true } : { rationale: ratifyWhy },
                  )
                }
              >
                {busy ? "Working…" : "Approve the change to my goal"}
              </Button>
            </div>
          )}
          {answer === "acceptIf" && !L.northstar && (
            <AcceptIfForm key={`${p.id}:${p.counter_versions.length}`} p={p} latestText={latestText} busy={busy} run={props.run} ask={ask} />
          )}
          {answer === "counter" && <CounterForm key={`${p.id}:${p.counter_versions.length}`} p={p} latestText={latestText} busy={busy} run={props.run} L={L} />}
          {answer === "decline" && (
            <div className="al-in space-y-3">
              <p className="text-[15px] text-zinc-700">
                {L.northstar ? "Security's goal stays as it was." : `${poss(own)} goal stays as it was.`} {who(p.proposing_owner)} sees that you declined.
              </p>
              <Button kind="danger" disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/reject`, {})}>
                {busy ? "Working…" : "Decline this proposal"}
              </Button>
            </div>
          )}

          <p className="rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-600 ring-1 ring-zinc-200">
            Agreement between two teams is not approval to launch.{" "}
            {L.northstar ? "Launch approval stays with the CEO." : `${L.person.leadership} decides the launch.`}
          </p>
        </section>
      )}

      {isSecurity && p.state === "COUNTERED" && (
        <div className={footer}>
          <Badge tone="amber">{L.northstar ? "Waiting for Product to accept your changes" : `Waiting for ${ask} to accept your changes`}</Badge>
          {hint && <p className="w-full text-[15px] text-zinc-600">{hint}</p>}
        </div>
      )}

      {isProduct && p.state === "COUNTERED" && (
        <div className={footer}>
          <span className="min-w-0 flex-1 text-[15px] text-zinc-700">
            {who(p.recipient_owner)} asked for changes. Accept them to send the proposal back for final approval.
          </span>
          <Button disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/acknowledge`, {})}>
            {busy ? "Working…" : L.northstar ? "Accept Security's changes and confirm what Product will do" : `Accept ${poss(own)} changes and confirm what ${ask} will do`}
          </Button>
        </div>
      )}

      {isProduct && (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT") && (
        <div className={footer}>
          {p.state === "PENDING_SECURITY" ? (
            <Badge tone="amber">Waiting for {who("security")}</Badge>
          ) : (
            <Badge tone="amber">You accepted the changes · waiting for {who("security")} to approve</Badge>
          )}
          <span className="min-w-0 flex-1 text-[15px] text-zinc-500">
            {L.northstar ? "Only Security can approve a change to Security's goal." : `Only ${own} can approve a change to ${poss(own)} goal.`}
          </span>
          <TryApprove key={`${p.id}:${p.state}`} p={p} owner={own} />
          {hint && <p className="w-full text-[15px] text-zinc-600">{hint}</p>}
        </div>
      )}
    </div>
  );
}

/** The refusal demo: a non-owner tries the real accept endpoint. The server answers 403 and nothing changes; the
 *  button then says so. It never goes through props.run, so no global error banner and no state refresh. */
function TryApprove({ p, owner }: { p: Proposal; owner: string }) {
  const [out, setOut] = useState<{ kind: "refused" | "other"; text: string } | null>(null);
  const [trying, setTrying] = useState(false);
  const attempt = async () => {
    setTrying(true);
    try {
      await api(`/api/proposals/${p.id}/accept`, { body: { rationale: "" } });
      setOut({ kind: "other", text: "The server accepted this. It should have refused it." });
    } catch (e) {
      const status = (e as { status?: number }).status;
      setOut(status === 403 ? { kind: "refused", text: `Handed back: only ${owner} can approve this` } : { kind: "other", text: (e as Error).message });
    } finally {
      setTrying(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button kind="secondary" disabled={trying} onClick={() => void attempt()}>
        {`Try to approve (only ${owner} can)`}
      </Button>
      {out && (
        <span role="status" className={`text-[15px] ${out.kind === "refused" ? "font-semibold text-zinc-800" : "text-amber-800"}`}>
          {out.text}
        </span>
      )}
    </span>
  );
}

/** Accept if…: the existing counter, with the target unchanged and the conditions field written one per line. */
function AcceptIfForm({ p, latestText, busy, run, ask }: { p: Proposal; latestText: string; busy: boolean; run: Run; ask: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [why, setWhy] = useState("");
  const joined = [...items, draft.trim()].filter(Boolean).join("\n");
  const tooLong = joined.length > MAX_CONDITIONS;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setItems((xs) => [...xs, t]);
    setDraft("");
  };
  return (
    <form
      className="al-in space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !joined || tooLong) return;
        void run(`/api/proposals/${p.id}/counter`, { proposed_measure_text: latestText, rationale: why, conditions: joined });
      }}
    >
      <div className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <span className="al-lbl">I&apos;ll accept if</span>
        {items.length > 0 && (
          <ol className="space-y-1.5">
            {items.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] text-zinc-900">
                <span className="grid h-[22px] min-w-[22px] flex-none place-items-center rounded-full bg-zinc-100 px-1.5 text-[12px] font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap">{c}</span>
                <Button kind="ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex gap-2">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">Add a condition</span>
            <input
              className={inputCls}
              placeholder="Add a condition…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </label>
          <Button kind="secondary" disabled={!draft.trim()} onClick={add}>
            Add
          </Button>
        </div>
        {tooLong && <span className="block text-[14px] text-amber-700">Keep the conditions to {MAX_CONDITIONS} characters or fewer.</span>}
      </div>
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why (optional)</span>
        <input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !joined || tooLong}>
          {busy ? "Working…" : `Send my conditions to ${ask}`}
        </Button>
        <span className="text-[14px] text-zinc-500">The target stays as proposed. {ask} accepts the conditions, then you give the final approval.</span>
      </div>
    </form>
  );
}

function CounterForm({ p, latestText, busy, run, L }: { p: Proposal; latestText: string; busy: boolean; run: Run; L: Labels }) {
  const [text, setText] = useState(
    !L.northstar ? latestText : latestText.includes(COUNTER_SUFFIX.trim()) ? latestText : latestText + COUNTER_SUFFIX,
  );
  const [why, setWhy] = useState(L.northstar ? "Keep the critical security ticket off-limits." : "");
  const [changesPlan, setChangesPlan] = useState(false);
  const [conditions, setConditions] = useState("");
  const lines = conditionLines(conditions);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !text.trim()) return;
        // Custom plans have no agent run, so the counter carries only the wording and the reason.
        if (L.northstar) void run(`/api/proposals/${p.id}/counter`, { proposed_measure_text: text, rationale: why, changes_plan: changesPlan });
        else void run(`/api/proposals/${p.id}/counter`, { proposed_measure_text: text, rationale: why, ...(conditions.trim() ? { conditions } : {}) });
      }}
      className="al-in space-y-3"
    >
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Ask for changes: your version of the target</span>
        <textarea className={inputCls} rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        {text.length >= 300 && <span className="mt-1 block text-[14px] text-amber-700">Keep the new target under 300 characters.</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why you want these changes</span>
        <input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      {!L.northstar && (
        <label className="block">
          <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Conditions (optional)</span>
          <span className="mb-1 block text-[14px] text-zinc-500">What your approval depends on, one per line.</span>
          <textarea className={inputCls} rows={2} maxLength={MAX_CONDITIONS} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </label>
      )}
      {lines.length > 1 && <NumberedLines lines={lines} />}
      {L.northstar && (
        <label className="flex items-start gap-2 text-[15px] text-zinc-800">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-violet-700 focus-visible:outline-2 focus-visible:outline-violet-600"
            checked={changesPlan}
            onChange={(e) => setChangesPlan(e.target.checked)}
          />
          <span>These changes alter how the agent works (the test must be run again before anyone can say it passed)</span>
        </label>
      )}
      <Button type="submit" kind="secondary" disabled={busy || !text.trim()}>
        {busy ? "Working…" : "Ask for changes"}
      </Button>
    </form>
  );
}
