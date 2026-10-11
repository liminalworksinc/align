"use client";
import { useEffect, useRef, useState } from "react";
import type { Proposal, SimulationRun, StateView, TestStatus } from "@/lib/types";
import type { ViewProps } from "./props";
import { activeProposal, currentGoal } from "./select";
import { Badge, Button, OWNER_LABEL, STATE_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { ProofStrip } from "./ProofStrip";
import { SpartaProof } from "./SpartaProof";

/** Split free text into short bullet lines: one per sentence, and "Lead: a, b, and c" becomes a lead line with sub-items. */
function toBullets(text: string): { lead: string; items: string[] }[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(": ");
      if (i < 0) return { lead: s, items: [] };
      const items = s
        .slice(i + 2)
        .split(/,\s*(?:and\s+)?|\s+and\s+(?=[a-z])/)
        .map((x) => x.trim())
        .filter(Boolean);
      return items.length > 1 ? { lead: s.slice(0, i), items } : { lead: s, items: [] };
    });
}

function Bullets({ text, marker = "●" }: { text: string; marker?: string }) {
  const lines = toBullets(text);
  if (!lines.length) return <p className="text-[16px] text-zinc-500">—</p>;
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2 text-[16px] leading-snug text-zinc-900">
          <span aria-hidden className="mt-0.5 text-[12px] text-zinc-500">
            {marker}
          </span>
          <div>
            {l.lead}
            {l.items.length > 0 && (
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {l.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 text-[15px] ring-1 ring-zinc-200">
                    <span aria-hidden className="text-violet-700">
                      ◆
                    </span>
                    {it.charAt(0).toUpperCase() + it.slice(1)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Where the proposal is in its four steps. Security may approve straight away, which skips step 3. */
function Stepper({ p }: { p: Proposal }) {
  const countered = p.counter_versions.length > 0;
  const steps = [
    { label: "Product proposes", done: true },
    { label: "Security reviews", done: p.state !== "PENDING_SECURITY" && p.state !== "DRAFT" },
    {
      label: countered ? "Product accepts Security's changes" : "Product confirms its part",
      done: p.state === "ACKNOWLEDGED_BY_PRODUCT" || p.state === "RATIFIED",
      skipped: p.state === "RATIFIED" && !countered,
    },
    { label: p.state === "REJECTED" ? "Security declined" : "Security approves its goal", done: p.state === "RATIFIED" || p.state === "REJECTED" },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Progress of this proposal">
      {steps.map((st, i) => {
        const now = i === current;
        const cls = now
          ? "bg-violet-50 ring-violet-400 text-violet-900"
          : st.done
            ? "bg-white ring-zinc-300 text-zinc-900"
            : "bg-zinc-50 ring-zinc-200 text-zinc-500";
        return (
          <li key={i} aria-current={now ? "step" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] ring-1 ${cls}`}>
            <span aria-hidden className="font-mono text-[13px]">
              {st.done ? "●" : now ? "◆" : "○"}
            </span>
            <span className="font-semibold">
              {i + 1}. {st.label}
              {"skipped" in st && st.skipped && <span className="font-normal text-zinc-500"> (not needed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Propose a change to Security&apos;s goal</h1>

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
          <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Today Security is measured on</div>
          <p className="mt-0.5 text-[16px] text-zinc-500 line-through decoration-zinc-400" aria-label={`Replace Security's current target: ${oldMeasure}`}>
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Proposed change to Security&apos;s goal ({p.target_goal_version})</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StateBadge state={p.state} />
          <TestStatusBadge status={p.test_status} />
        </div>
        <p className="mt-1 text-[15px] text-zinc-600">
          From {OWNER_LABEL[p.proposing_owner]} to {OWNER_LABEL[p.recipient_owner]} · sent {fmtTime(p.created_at)}
        </p>
        <div className="mt-3">
          <Stepper p={p} />
        </div>
      </header>

      {/* Role-specific action / status area */}
      {isProduct && p.state === "COUNTERED" && (
        <Card tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge tone="amber">Security asked for changes</Badge>
              <p className="mt-1 text-[16px] text-amber-950">
                {OWNER_LABEL.security} edited the new target
                {p.counter_versions.at(-1)?.rationale ? `: "${p.counter_versions.at(-1)?.rationale}"` : "."} The change is highlighted below.
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
          <div className="grid gap-4 2xl:grid-cols-2">
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
            <ul className="mt-3 space-y-2 text-[16px] text-zinc-900">
              <li className="flex gap-2">
                <span aria-hidden className="text-zinc-500">●</span>
                <span>
                  <strong>{OWNER_LABEL[acc.ratified_by]}</strong> approved the new goal at {fmtTime(acc.ratified_at)}
                  {acc.rationale ? `: "${acc.rationale}"` : ""}
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-zinc-500">●</span>
                <span>
                  <strong>{OWNER_LABEL[acc.acknowledged_by]}</strong>{" "}
                  {acc.acknowledged_via === "authored_in_proposal" ? "committed to its part in the proposal" : "accepted Security's changes"} at{" "}
                  {fmtTime(acc.acknowledged_at)}
                </span>
              </li>
            </ul>
            <h4 className="mt-4 mb-1.5 al-lbl">What happens next</h4>
            <ol className="space-y-1.5 text-[16px] text-zinc-900">
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

      <Section title="What changes in Security's goal">
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.4fr]">
          <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Before</div>
            <p className="mt-1 text-[17px] text-zinc-500 line-through decoration-zinc-400">{oldMeasure}</p>
            <p className="mt-2 text-[14px] text-zinc-500">Counts tickets closed. Beta issues wait in line behind older ones.</p>
          </div>
          <div aria-hidden className="hidden items-center text-[28px] text-violet-700 lg:flex">
            →
          </div>
          <div className="rounded-xl bg-violet-50 p-4 ring-1 ring-violet-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-violet-800">
                {p.state === "RATIFIED" ? "Now agreed" : "Proposed"}
              </span>
              {p.counter_versions.length > 0 && <Badge tone="violet">Includes Security&apos;s edit</Badge>}
              {p.counter_versions.at(-1)?.changes_plan && <Badge tone="amber">Changes how the agent works: needs a new test</Badge>}
            </div>
            <div className="mt-2">
              <Bullets text={latestText} />
            </div>
          </div>
        </div>

        {p.counter_versions.length > 0 && (
          <ol className="mt-3 space-y-2 border-l-2 border-zinc-200 pl-4 text-[15px]">
            <li className="text-zinc-700">
              <span className="font-semibold">{OWNER_LABEL[p.proposing_owner]}</span> proposed the first version at {fmtTime(p.created_at)}
            </li>
            {p.counter_versions.map((c, i) => {
              const prev = i === 0 ? p.proposed_measure_text : p.counter_versions[i - 1].proposed_measure_text;
              const added = addedText(prev, c.proposed_measure_text);
              return (
                <li key={c.version} className="text-zinc-700">
                  <span className="font-semibold">{OWNER_LABEL[c.by]}</span> edited it at {fmtTime(c.at)}
                  {added ? (
                    <>
                      , adding: <mark className="rounded bg-violet-100 px-1 text-violet-900">{added}</mark>
                    </>
                  ) : (
                    <>: new wording above</>
                  )}
                  {c.rationale && <div className="text-zinc-500">Why: {c.rationale}</div>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Why Product is asking">
          <Bullets text={p.rationale || ""} />
        </Section>
        <Section title="What Product will do in return">
          <Bullets text={p.reciprocal_commitment} marker="◆" />
        </Section>
      </div>

      <Section title="Proof from Sparta: both plans on the same practice tickets">
        {runs.length ? (
          <SpartaProof runs={runs} onOpenTest={() => props.openDrawer("scenario")} />
        ) : (
          <RunList runs={runs} missing={missing} />
        )}
        {missing.length > 0 && runs.length > 0 && <RunList runs={[]} missing={missing} />}
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
