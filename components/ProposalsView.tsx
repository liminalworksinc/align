"use client";
import { useEffect, useRef, useState } from "react";
import type { Proposal, SimulationRun, StateView, TestStatus } from "@/lib/types";
import type { ViewProps } from "./props";
import { activeProposal, currentGoal } from "./select";
import { Badge, Button, OWNER_LABEL, STATE_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { ProofStrip } from "./ProofStrip";

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

function TestStatusBadge({ status }: { status: TestStatus }) {
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

  return (
    <div className="flex min-h-0 gap-5">
      <aside className="w-72 shrink-0" aria-label="Proposal inbox">
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
                    <div className="text-[16px] font-semibold text-zinc-900">Change to Security&apos;s goal ({p.target_goal_version})</div>
                    <div className="text-[14px] text-zinc-500">
                      {OWNER_LABEL[p.proposing_owner]} · {fmtTime(p.created_at)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StateBadge state={p.state} />
                      <Badge tone={p.test_status === "TESTED" ? "neutral" : "amber"}>{STATE_LABEL[p.test_status] ?? p.test_status}</Badge>
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
          <Detail {...props} p={active} busy={busy} run={run} />
        ) : (
          <Card tone="readonly">
            <p className="text-[18px] font-semibold text-zinc-900">No proposals to your goal yet.</p>
            <p className="mt-1 text-[16px] text-zinc-600">
              When Product proposes a change to Security&apos;s goal, it shows up here for you to decide on.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}

type Run = <T>(path: string, body?: unknown) => Promise<T | null>;

// ---------------------------------------------------------------------------------------------

function Composer(props: ViewProps & { busy: boolean; run: Run; onSent: () => void }) {
  const { s, attached } = props;
  const secGoal = currentGoal(s, "security");
  const ceo = currentGoal(s, "ceo");
  const kr2 = ceo?.measures.find((m) => m.id === "KR2");
  const oldMeasure = secGoal?.measures.find((m) => m.id === "S-M1")?.text ?? OLD_MEASURE_FALLBACK;

  const [measure, setMeasure] = useState(DEFAULT_MEASURE);
  const [rationale, setRationale] = useState(DEFAULT_RATIONALE);
  const [commitment, setCommitment] = useState(DEFAULT_COMMITMENT);

  const planSel = attached ?? { plan_id: "p-beta", plan_version: 1, simulation_refs: [] as string[] };
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
      <h1 className="font-display text-[28px] font-normal leading-[1.1] text-zinc-900">Propose a change to Security&apos;s goal</h1>

      <Section title="Security's goal today" right={<Badge tone="neutral">Security&apos;s goal · view only — you can propose a change, not edit it</Badge>}>
        <Card tone="readonly">
          {secGoal ? (
            <>
              <div className="text-[15px] text-zinc-600">
                Owner <span className="font-semibold text-zinc-900">{OWNER_LABEL.security}</span> · version{" "}
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
          ) : (
            <p className="text-[16px] text-zinc-500">You can&apos;t see Security&apos;s goal right now.</p>
          )}
        </Card>
      </Section>

      <Section title="The CEO's new requirement">
        <Card tone="readonly">
          <div className="text-[15px] text-zinc-600">
            Set by CEO · view only · CEO goal ({ceo?.version ?? "—"}) {ceo?.changed && <Badge tone="amber">changed today</Badge>}
          </div>
          <p className="mt-1 text-[16px] text-zinc-900">{kr2?.text ?? "The CEO's new requirement isn't available right now."}</p>
        </Card>
      </Section>

      <Section title="What you're proposing">
        <Card>
          <p className="text-[16px] text-red-700/80 line-through decoration-red-400" aria-label={`Remove Security's current target: ${oldMeasure}`}>
            <span aria-hidden className="font-mono font-bold no-underline">− </span>
            {oldMeasure}
          </p>
          <label className="mt-3 block">
            <span className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-violet-800">
              <span aria-hidden className="font-mono">+</span> New target for Security
            </span>
            <textarea className={inputCls} rows={3} value={measure} onChange={(e) => setMeasure(e.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why</span>
            <textarea className={inputCls} rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">What Product will do in return</span>
            <textarea className={inputCls} rows={2} value={commitment} onChange={(e) => setCommitment(e.target.value)} />
          </label>
        </Card>
      </Section>

      <Section title="Test results">
        {attached ? (
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[16px]">
              <PlanLabel id={attached.plan_id} />
              <span className="text-zinc-600">Result once sent:</span>
              <TestStatusBadge status={expectation} />
            </div>
            <RunList runs={runs} missing={missing} />
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
                Test both plans
              </Button>
            </div>
          </Card>
        )}
        <p className="mt-2 text-[15px] text-zinc-700">
          Plan that will be sent: <PlanLabel id={planSel.plan_id} />
        </p>
      </Section>

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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSend}>
          {props.busy ? "Sending…" : `Send proposal to ${OWNER_LABEL.security}`}
        </Button>
        {!commitment.trim() && <span className="text-[15px] text-amber-900">▲ Say what Product will do in return</span>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

interface TimelineRow {
  key: string;
  actor: string;
  action: string;
  at: string;
}

function timelineFor(s: StateView, p: Proposal): TimelineRow[] {
  const fromAudit = s.audit.filter((a) => a.target === p.id);
  if (fromAudit.length) return fromAudit.map((a) => ({ key: a.id, actor: a.actor, action: a.action, at: a.at }));
  const rows: TimelineRow[] = [{ key: "c", actor: p.proposing_owner, action: "propose", at: p.created_at }];
  p.counter_versions.forEach((c) => rows.push({ key: c.version, actor: c.by, action: "counter", at: c.at }));
  if (p.product_ack_at) rows.push({ key: "ack", actor: "product", action: "acknowledge", at: p.product_ack_at });
  const acc = s.acceptances.find((a) => a.proposal_id === p.id);
  if (acc) rows.push({ key: "rat", actor: "security", action: "ratify", at: acc.ratified_at });
  return rows;
}

const ACTION_LABEL: Record<string, string> = {
  propose: "proposed the change",
  counter: "asked for changes",
  acknowledge: "accepted Security's changes and confirmed what Product will do",
  ratify: "approved the change to its goal",
  reject: "declined the proposal",
};

function Detail(props: ViewProps & { p: Proposal; busy: boolean; run: Run }) {
  const { s, me, p, busy } = props;
  const isSecurity = me.actor === "security";
  const isProduct = me.actor === "product";
  const target = s.goals.find((g) => g.id === p.target_goal_id);
  const oldMeasure = target?.measures.find((m) => m.id === "S-M1")?.text ?? OLD_MEASURE_FALLBACK;
  const runs = s.simulations.filter((r) => p.simulation_refs.includes(r.id));
  const missing = p.simulation_refs.filter((r) => !s.simulations.some((x) => x.id === r));
  const latestText = p.counter_versions.at(-1)?.proposed_measure_text ?? p.proposed_measure_text;
  const acc = s.acceptances.find((a) => a.proposal_id === p.id) ?? null;
  const deliveries = (s.sessions ?? [])
    .flatMap((x) => (x.directives ?? []).filter((d) => d.event_id === `accept:${p.id}`))
    .sort((a, b) => a.delivered_at.localeCompare(b.delivered_at));
  const canDecide = p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT";
  const [ratifyWhy, setRatifyWhy] = useState("Beta customers' issues now come first, and the critical security ticket stays off-limits.");

  // Seeing the ratified record counts as "accepted version seen" for this session (server dedupes per actor).
  const marked = useRef<string | null>(null);
  const { mark } = props;
  useEffect(() => {
    if (p.state === "RATIFIED" && marked.current !== p.id) {
      marked.current = p.id;
      mark("saw_accepted_version");
    }
  }, [p.state, p.id, mark]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[28px] font-normal leading-[1.1] text-zinc-900">Proposed change to Security&apos;s goal ({p.target_goal_version})</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StateBadge state={p.state} />
          <TestStatusBadge status={p.test_status} />
        </div>
        <p className="mt-1 text-[15px] text-zinc-600">
          From {OWNER_LABEL[p.proposing_owner]} to {OWNER_LABEL[p.recipient_owner]} · sent {fmtTime(p.created_at)}
        </p>
      </header>

      {/* Role-specific action / status area */}
      {isProduct && p.state === "COUNTERED" && (
        <Card tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge tone="amber">Security asked for changes</Badge>
              <p className="mt-1 text-[16px] text-amber-950">
                {OWNER_LABEL.security} changed the proposed target ({p.counter_versions.at(-1)?.version}). See what changed below.
              </p>
            </div>
            <Button disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/acknowledge`, {})}>
              {busy ? "Working…" : "Accept Security's changes and confirm what Product will do"}
            </Button>
          </div>
        </Card>
      )}
      {isProduct && p.state === "PENDING_SECURITY" && (
        <Card tone="readonly">
          <p className="text-[16px] text-zinc-800">
            <Badge tone="amber">Waiting for {OWNER_LABEL.security}</Badge>
          </p>
        </Card>
      )}
      {isProduct && p.state === "ACKNOWLEDGED_BY_PRODUCT" && (
        <Card tone="readonly">
          <Badge tone="amber">You accepted the changes · waiting for {OWNER_LABEL.security} to approve</Badge>
        </Card>
      )}
      {isProduct && (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT" || p.state === "COUNTERED") && (
        <p className="text-[15px] text-zinc-500">Only Security can approve a change to Security&apos;s goal.</p>
      )}

      {isSecurity && p.state === "COUNTERED" && (
        <Card tone="readonly">
          <Badge tone="amber">Waiting for Product to accept your changes</Badge>
        </Card>
      )}
      {isSecurity && canDecide && (
        <Card tone="violet">
          <h2 className="mb-3 text-[18px] font-bold text-zinc-900">Your decision</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block">
                <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why you&apos;re approving</span>
                <input className={inputCls} value={ratifyWhy} onChange={(e) => setRatifyWhy(e.target.value)} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={busy || !canDecide} onClick={() => void props.run(`/api/proposals/${p.id}/accept`, { rationale: ratifyWhy })}>
                  {busy ? "Working…" : "Approve the change to my goal"}
                </Button>
                <Button kind="danger" disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/reject`, {})}>
                  Decline
                </Button>
              </div>
            </div>
            <CounterForm key={`${p.id}:${p.counter_versions.length}`} p={p} latestText={latestText} busy={busy} run={props.run} />
          </div>
        </Card>
      )}

      {p.state === "REJECTED" && (
        <Card tone="readonly">
          <StateBadge state="REJECTED" />
          <p className="mt-1 text-[16px] text-zinc-700">{OWNER_LABEL.security} declined this proposal. Security&apos;s goal stays as it was.</p>
        </Card>
      )}

      {p.state === "RATIFIED" && acc && (
        <Section title="What was decided">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Approved: Security&apos;s goal ({acc.accepted_version})</Badge>
              <TestStatusBadge status={acc.test_status} />
            </div>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[16px]">
              <dt className="text-zinc-500">Approved by</dt>
              <dd className="text-zinc-900">
                {OWNER_LABEL[acc.ratified_by]} at {fmtTime(acc.ratified_at)}
              </dd>
              <dt className="text-zinc-500">Accepted by</dt>
              <dd className="text-zinc-900">
                {OWNER_LABEL[acc.acknowledged_by]} {acc.acknowledged_via === "authored_in_proposal" ? "(wrote what it will do into its proposal)" : ""} at {fmtTime(acc.acknowledged_at)}
              </dd>
              <dt className="text-zinc-500">What happens next</dt>
              <dd className="text-zinc-900">
                Security&apos;s AI agent follows the {planName(acc.plan_ref.plan_id).toLowerCase()}. Product tags beta issues as they come in and
                publishes what&apos;s in the beta.
              </dd>
              {acc.rationale && (
                <>
                  <dt className="text-zinc-500">Why</dt>
                  <dd className="text-zinc-900">{acc.rationale}</dd>
                </>
              )}
              <dt className="text-zinc-500">Plan</dt>
              <dd>
                <PlanLabel id={acc.plan_ref.plan_id} />
              </dd>
              <dt className="text-zinc-500">Agent delivery</dt>
              <dd className="text-zinc-900">
                {deliveries.length
                  ? `${deliveries.length} agent ${deliveries.length === 1 ? "session" : "sessions"} · first delivered ${fmtTime(deliveries[0].delivered_at)} · acted on: ${deliveries.filter((d) => d.acted_at).length}`
                  : "Not delivered to an agent session yet"}
              </dd>
            </dl>
            <p className="mt-3 text-[15px] text-zinc-600">
              Both teams agreeing doesn&apos;t prove the beta launch will work. A passed test only covers the practice tickets.
            </p>
            <div className="mt-3">
              <Button onClick={() => props.go("goals")}>Back to goals</Button>
            </div>
          </Card>
        </Section>
      )}
      {p.state === "RATIFIED" && <ProofStrip s={s} />}

      <Section title="What changed">
        <Card>
          <ol className="space-y-3">
            <li className="text-[16px] text-red-700/80 line-through decoration-red-400">
              <span aria-hidden className="font-mono font-bold">− </span>
              {oldMeasure}
              <span className="sr-only"> (removed)</span>
            </li>
            <li className={p.counter_versions.length ? "text-zinc-500" : "text-zinc-900"}>
              <div className="text-[14px] font-semibold text-zinc-600">
                + v2 · proposed by {OWNER_LABEL[p.proposing_owner]} at {fmtTime(p.created_at)}
                {p.counter_versions.length > 0 && " (replaced by Security's changes)"}
              </div>
              <p className="text-[16px]">{p.proposed_measure_text}</p>
            </li>
            {p.counter_versions.map((c, i) => {
              const latest = i === p.counter_versions.length - 1;
              return (
                <li key={c.version} className={latest ? "rounded-lg bg-violet-50 p-2 ring-1 ring-violet-300" : "text-zinc-500"}>
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-zinc-600">
                    + {c.version} · changes asked for by {OWNER_LABEL[c.by]} at {fmtTime(c.at)}
                    {latest && <Badge tone="violet">latest version</Badge>}
                    {c.changes_plan && <Badge tone="amber">needs a new test: changes how the agent works</Badge>}
                  </div>
                  <p className="text-[16px] text-zinc-900">{c.proposed_measure_text}</p>
                  {c.rationale && <p className="text-[15px] text-zinc-600">Why: {c.rationale}</p>}
                </li>
              );
            })}
          </ol>
        </Card>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Why">
          <p className="text-[16px] text-zinc-900">{p.rationale || "—"}</p>
        </Section>
        <Section title="What Product will do in return">
          <p className="text-[16px] text-zinc-900">{p.reciprocal_commitment}</p>
        </Section>
      </div>

      <Section title="Plan and test results">
        <p className="mb-2 text-[16px] text-zinc-800">
          <PlanLabel id={p.plan_ref.plan_id} />
        </p>
        <p className="mb-2 text-[15px] text-zinc-600">A passed test covers the practice tickets only. It doesn&apos;t predict the beta launch.</p>
        <RunList runs={runs} missing={missing} />
      </Section>

      <Section title="Who did what, when">
        <ol className="space-y-1.5 border-l-2 border-zinc-200 pl-4">
          {timelineFor(s, p).map((t) => (
            <li key={t.key} className="text-[16px] text-zinc-800">
              <span className="text-zinc-500">{fmtTime(t.at)}</span> · <span className="font-semibold">{OWNER_LABEL[t.actor] ?? t.actor}</span>{" "}
              {ACTION_LABEL[t.action] ?? t.action}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function CounterForm({ p, latestText, busy, run }: { p: Proposal; latestText: string; busy: boolean; run: Run }) {
  const [text, setText] = useState(latestText.includes(COUNTER_SUFFIX.trim()) ? latestText : latestText + COUNTER_SUFFIX);
  const [why, setWhy] = useState("Keep the critical security ticket off-limits.");
  const [changesPlan, setChangesPlan] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && text.trim()) void run(`/api/proposals/${p.id}/counter`, { proposed_measure_text: text, rationale: why, changes_plan: changesPlan });
      }}
      className="space-y-2"
    >
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Or ask for changes: your version of the target</span>
        <textarea className={inputCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Why you want these changes</span>
        <input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-[15px] text-zinc-800">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-violet-700 focus-visible:outline-2 focus-visible:outline-violet-600"
          checked={changesPlan}
          onChange={(e) => setChangesPlan(e.target.checked)}
        />
        <span>These changes alter how the agent works (the test must be run again before anyone can say it passed)</span>
      </label>
      <Button type="submit" kind="secondary" disabled={busy || !text.trim()}>
        {busy ? "Working…" : "Ask for changes"}
      </Button>
    </form>
  );
}
