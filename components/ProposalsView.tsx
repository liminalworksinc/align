"use client";
import { useEffect, useRef, useState } from "react";
import type { Proposal, SimulationRun, StateView, TestStatus } from "@/lib/types";
import type { ViewProps } from "./props";
import { activeProposal, currentGoal } from "./select";
import { Badge, Button, Mono, OWNER_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { ProofStrip } from "./ProofStrip";

const DEFAULT_MEASURE =
  "Observability-beta incidents triaged per launch-readiness policy (urgent, obs-beta tag, private investigation note, public acknowledgment), protecting P0 non-beta incidents";
const DEFAULT_RATIONALE =
  "CEO KR2 changed today; the current throughput measure does not require beta triage. Sparta shows the current plan fails and the candidate passes the same checks.";
const DEFAULT_COMMITMENT =
  "Product tags every beta issue obs-beta at intake and publishes the exact beta scope by Wednesday; Product defers ticket dashboard polish.";
const COUNTER_SUFFIX = " while existing P0 non-beta incidents and their private notes remain untouched";
const OLD_MEASURE_FALLBACK = "Tickets triaged per day, oldest first (throughput)";

const OPEN_STATES = ["PENDING_SECURITY", "COUNTERED", "ACKNOWLEDGED_BY_PRODUCT", "DRAFT"];

const inputCls =
  "w-full rounded-lg bg-white px-3 py-2 text-[16px] leading-relaxed text-zinc-900 ring-1 ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600";

const short = (x: string, n = 8) => (x ? x.slice(0, n) : "—");

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
  if (status === "TESTED") return <Badge tone="neutral">TESTED: candidate passed same checks as failing baseline</Badge>;
  if (status === "STALE") return <Badge tone="amber">STALE: counter changed the executable plan — rerun required before any verified claim</Badge>;
  return <Badge tone="amber">UNTESTED: no comparable passing run attached</Badge>;
}

function VerdictBadge({ verdict }: { verdict: SimulationRun["verdict"] }) {
  // A FAIL baseline is a real failed check (red). A PASS is shown neutral here; green is reserved for the narrow verified outcome.
  return verdict === "FAIL" ? <Badge tone="red">FAIL</Badge> : <Badge tone="neutral">PASS</Badge>;
}

function RunList({ runs, missing }: { runs: SimulationRun[]; missing?: string[] }) {
  if (!runs.length && !missing?.length) return <p className="text-[16px] text-zinc-500">No Sparta runs referenced.</p>;
  return (
    <ul className="space-y-2">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-[15px] ring-1 ring-zinc-200">
          <VerdictBadge verdict={r.verdict} />
          <span className="font-semibold text-zinc-900">
            {r.plan_id}@{r.plan_version}
          </span>
          <span className="text-zinc-600">{r.scenario}</span>
          <span className="text-zinc-500">
            mission <Mono>{short(r.mission_id)}</Mono> · seed <Mono>{short(r.seed_version)}</Mono> · checks <Mono>{short(r.checks_version)}</Mono>
          </span>
          <span className="text-zinc-500">
            run <Mono>{short(r.id, 12)}</Mono>
          </span>
        </li>
      ))}
      {missing?.map((m) => (
        <li key={m} className="text-[15px] text-amber-900">
          ▲ Run <Mono>{m}</Mono> not found in this workspace
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
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">Inbox</h2>
          {isProduct && !openOne && !showComposer && (
            <Button kind="secondary" onClick={() => setComposing(true)}>
              New proposal
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
                    <div className="text-[16px] font-semibold text-zinc-900">Security goal {p.target_goal_version} change</div>
                    <div className="text-[14px] text-zinc-500">
                      {OWNER_LABEL[p.proposing_owner]} · {fmtTime(p.created_at)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StateBadge state={p.state} />
                      <Badge tone={p.test_status === "TESTED" ? "neutral" : "amber"}>{p.test_status}</Badge>
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
              When the Product Director proposes a change to the Security goal it will appear here for your decision.
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
      <h1 className="text-[24px] font-bold text-zinc-900">Propose a change to Security&apos;s goal</h1>

      <Section title="Current Security goal" right={<Badge tone="neutral">Shared · read-only — you can propose, not edit</Badge>}>
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
                    <Mono>{m.id}</Mono> {m.text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[16px] text-zinc-500">Security goal not visible in this session.</p>
          )}
        </Card>
      </Section>

      <Section title="Inherited CEO criterion">
        <Card tone="readonly">
          <div className="text-[15px] text-zinc-600">
            CEO goal {ceo?.version ?? "—"} · <Mono>KR2</Mono> {ceo?.changed && <Badge tone="amber">changed today</Badge>}
          </div>
          <p className="mt-1 text-[16px] text-zinc-900">{kr2?.text ?? "KR2 not available"}</p>
        </Card>
      </Section>

      <Section title="Proposed measure change">
        <Card>
          <p className="text-[16px] text-red-700/80 line-through decoration-red-400" aria-label={`Remove: S-M1 ${oldMeasure}`}>
            <span aria-hidden className="font-mono font-bold no-underline">− </span>S-M1 {oldMeasure}
          </p>
          <label className="mt-3 block">
            <span className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-violet-800">
              <span aria-hidden className="font-mono">+</span> Proposed measure (candidate)
            </span>
            <textarea className={inputCls} rows={3} value={measure} onChange={(e) => setMeasure(e.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Rationale</span>
            <textarea className={inputCls} rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Product&apos;s reciprocal commitment</span>
            <textarea className={inputCls} rows={2} value={commitment} onChange={(e) => setCommitment(e.target.value)} />
          </label>
        </Card>
      </Section>

      <Section title="Attached test">
        {attached ? (
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[16px]">
              <span className="font-semibold text-zinc-900">
                {attached.plan_id}@{attached.plan_version}
              </span>
              <span className="text-zinc-600">Server will compute:</span>
              <TestStatusBadge status={expectation} />
            </div>
            <RunList runs={runs} missing={missing} />
          </Card>
        ) : (
          <Card tone="amber">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone="amber">No tested plan attached</Badge>
                <p className="mt-1 text-[15px] text-amber-900">
                  Sending now attaches p-beta@1 without runs; the proposal will be UNTESTED.
                </p>
              </div>
              <Button kind="secondary" onClick={() => props.openDrawer("scenario")}>
                Open Scenario Studio
              </Button>
            </div>
          </Card>
        )}
        <p className="mt-2 text-[15px] text-zinc-700">
          Exact plan sent:{" "}
          <Mono>
            {planSel.plan_id}@{planSel.plan_version}
          </Mono>{" "}
          · hash <Mono>{plan?.hash ? `${plan.hash.slice(0, 12)}…` : "unknown"}</Mono>
        </p>
      </Section>

      <Section title="Prior decision (Alike)">
        {alike ? (
          <Card tone="readonly">
            <div className="text-[15px] text-zinc-600">
              Decision <Mono>{alike.decision_id}</Mono> · recorded {fmtTime(alike.recorded_at)}
            </div>
            <p className="mt-1 text-[16px] text-zinc-900">{alike.summary}</p>
          </Card>
        ) : (
          <p className="text-[16px] text-zinc-600">Alike rationale: not retrieved (no claim made)</p>
        )}
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSend}>
          {props.busy ? "Sending…" : `Send proposal to ${OWNER_LABEL.security}`}
        </Button>
        {!commitment.trim() && <span className="text-[15px] text-amber-900">▲ A reciprocal commitment is required</span>}
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
  counter: "countered with revised terms",
  acknowledge: "acknowledged revised terms and Product commitment",
  ratify: "ratified the goal revision",
  reject: "rejected the proposal",
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
  const canDecide = p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT";
  const [ratifyWhy, setRatifyWhy] = useState("Beta triage condition added; P0 non-beta incidents protected (S-M2).");

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
        <h1 className="text-[24px] font-bold text-zinc-900">Proposal to Security goal {p.target_goal_version}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StateBadge state={p.state} />
          <TestStatusBadge status={p.test_status} />
        </div>
        <p className="mt-1 text-[15px] text-zinc-600">
          From {OWNER_LABEL[p.proposing_owner]} to {OWNER_LABEL[p.recipient_owner]} · sent {fmtTime(p.created_at)} ·{" "}
          <Mono>{p.id}</Mono>
        </p>
      </header>

      {/* Role-specific action / status area */}
      {isProduct && p.state === "COUNTERED" && (
        <Card tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge tone="amber">Security countered</Badge>
              <p className="mt-1 text-[16px] text-amber-950">
                {OWNER_LABEL.security} revised the measure ({p.counter_versions.at(-1)?.version}). Review the diff below.
              </p>
            </div>
            <Button disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/acknowledge`, {})}>
              {busy ? "Working…" : "Acknowledge revised terms and Product commitment"}
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
          <Badge tone="amber">Acknowledged · waiting for {OWNER_LABEL.security} to ratify</Badge>
        </Card>
      )}
      {isProduct && (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT" || p.state === "COUNTERED") && (
        <p className="text-[15px] text-zinc-500">Only the Security owner can ratify Security&apos;s goal.</p>
      )}

      {isSecurity && p.state === "COUNTERED" && (
        <Card tone="readonly">
          <Badge tone="amber">Waiting for Product to acknowledge your revised terms</Badge>
        </Card>
      )}
      {isSecurity && canDecide && (
        <Card tone="violet">
          <h2 className="mb-3 text-[18px] font-bold text-zinc-900">Your decision</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block">
                <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Ratification rationale</span>
                <input className={inputCls} value={ratifyWhy} onChange={(e) => setRatifyWhy(e.target.value)} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={busy || !canDecide} onClick={() => void props.run(`/api/proposals/${p.id}/accept`, { rationale: ratifyWhy })}>
                  {busy ? "Working…" : "Ratify my goal revision"}
                </Button>
                <Button kind="danger" disabled={busy} onClick={() => void props.run(`/api/proposals/${p.id}/reject`, {})}>
                  Reject
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
          <p className="mt-1 text-[16px] text-zinc-700">{OWNER_LABEL.security} rejected this proposal. The Security goal is unchanged.</p>
        </Card>
      )}

      {p.state === "RATIFIED" && acc && (
        <Section title="Acceptance record">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">ACCEPTED: Security goal {acc.accepted_version}</Badge>
              <TestStatusBadge status={acc.test_status} />
            </div>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[16px]">
              <dt className="text-zinc-500">Ratified by</dt>
              <dd className="text-zinc-900">
                {OWNER_LABEL[acc.ratified_by]} at {fmtTime(acc.ratified_at)}
              </dd>
              <dt className="text-zinc-500">Acknowledged by</dt>
              <dd className="text-zinc-900">
                {OWNER_LABEL[acc.acknowledged_by]} at {fmtTime(acc.acknowledged_at)}
              </dd>
              <dt className="text-zinc-500">Next work</dt>
              <dd className="text-zinc-900">{acc.next_work}</dd>
              {acc.rationale && (
                <>
                  <dt className="text-zinc-500">Rationale</dt>
                  <dd className="text-zinc-900">{acc.rationale}</dd>
                </>
              )}
              <dt className="text-zinc-500">Plan</dt>
              <dd>
                <Mono>
                  {acc.plan_ref.plan_id}@{acc.plan_ref.plan_version}
                </Mono>{" "}
                · hash <Mono>{short(acc.plan_ref.plan_hash, 12)}</Mono>
              </dd>
            </dl>
            <div className="mt-3">
              <Button onClick={() => props.go("goals")}>Return to Goals</Button>
            </div>
          </Card>
        </Section>
      )}
      {p.state === "RATIFIED" && <ProofStrip s={s} />}

      <Section title="Measure diff">
        <Card>
          <ol className="space-y-3">
            <li className="text-[16px] text-red-700/80 line-through decoration-red-400">
              <span aria-hidden className="font-mono font-bold">− </span>S-M1 {oldMeasure}
              <span className="sr-only"> (removed)</span>
            </li>
            <li className={p.counter_versions.length ? "text-zinc-500" : "text-zinc-900"}>
              <div className="text-[14px] font-semibold text-zinc-600">
                + v2 · proposed by {OWNER_LABEL[p.proposing_owner]} at {fmtTime(p.created_at)}
                {p.counter_versions.length > 0 && " (superseded by counter)"}
              </div>
              <p className="text-[16px]">{p.proposed_measure_text}</p>
            </li>
            {p.counter_versions.map((c, i) => {
              const latest = i === p.counter_versions.length - 1;
              return (
                <li key={c.version} className={latest ? "rounded-lg bg-violet-50 p-2 ring-1 ring-violet-300" : "text-zinc-500"}>
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-zinc-600">
                    + {c.version} · counter by {OWNER_LABEL[c.by]} at {fmtTime(c.at)}
                    {latest && <Badge tone="violet">latest terms</Badge>}
                    {c.changes_plan && <Badge tone="amber">changes tested plan</Badge>}
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
        <Section title="Rationale">
          <p className="text-[16px] text-zinc-900">{p.rationale || "—"}</p>
        </Section>
        <Section title="Product's reciprocal commitment">
          <p className="text-[16px] text-zinc-900">{p.reciprocal_commitment}</p>
        </Section>
      </div>

      <Section title="Tested plan and runs">
        <p className="mb-2 text-[16px] text-zinc-800">
          <Mono>
            {p.plan_ref.plan_id}@{p.plan_ref.plan_version}
          </Mono>{" "}
          · hash <Mono>{short(p.plan_ref.plan_hash, 12)}</Mono>
        </p>
        <RunList runs={runs} missing={missing} />
      </Section>

      <Section title="Sources">
        <ul className="flex flex-wrap gap-2">
          {p.source_refs.map((r) => (
            <li key={r}>
              <Mono>{r}</Mono>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Timeline">
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
  const [why, setWhy] = useState("Protect P0 security queue (S-M2).");
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
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Counter: revised measure</span>
        <textarea className={inputCls} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Counter rationale</span>
        <input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-[15px] text-zinc-800">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-violet-700 focus-visible:outline-2 focus-visible:outline-violet-600"
          checked={changesPlan}
          onChange={(e) => setChangesPlan(e.target.checked)}
        />
        <span>This counter changes the tested plan&apos;s parameters (marks test STALE)</span>
      </label>
      <Button type="submit" kind="secondary" disabled={busy || !text.trim()}>
        {busy ? "Working…" : "Counter"}
      </Button>
    </form>
  );
}
