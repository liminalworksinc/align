"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { SimulationRun, StateView } from "@/lib/types";
import type { ViewProps } from "./props";
import { comparablePair } from "./select";
import { Badge, Button, StateBadge } from "./ui";
import { CheckList, TICKET_LABEL, fieldWords, rowLabel, ticketOf, useEvidence } from "./EvidenceView";

const NOT_RUN = "An engineer can start this test from the project; see Evidence.";

const COMPARE_FIELDS: { key: "mission_id" | "seed_version" | "checks_version"; label: string }[] = [
  { key: "mission_id", label: "practice task" },
  { key: "seed_version", label: "practice tickets" },
  { key: "checks_version", label: "pass/fail checks" },
];

export function ScenarioDrawer(props: ViewProps & { onClose: () => void }) {
  const { s, me, mark, onClose } = props;
  const { baseline, candidate, interruption } = comparablePair(s);

  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    mark("scenario_reviewed");
  }, [mark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A baseline exists but none comparable to the candidate: show it so the mismatch is explicit.
  const anyBaseline = [...s.simulations].reverse().find((r) => r.plan_id === "p-throughput" && r.scenario === "normal");
  const shownBaseline = baseline ?? anyBaseline;

  const isProduct = me.actor === "product";
  const candidatePassed = candidate?.verdict === "PASS";
  const ctaReason = !isProduct
    ? "Only the Product Director can add test results to a proposal."
    : !candidate
      ? "The new plan hasn't been tested yet. Run its practice test first."
      : null;

  const attach = () => {
    if (!candidate) return;
    props.setAttached({
      plan_id: candidate.plan_id,
      plan_version: candidate.plan_version,
      simulation_refs: [baseline?.id, candidate.id, interruption?.id].filter((x): x is string => Boolean(x)),
    });
    onClose();
    props.go("proposals");
  };

  return (
    <aside role="dialog" aria-modal="true" aria-labelledby="scenario-title" className="flex h-full w-[880px] max-w-full flex-col bg-zinc-50 text-[16px] text-zinc-900 shadow-2xl">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h2 id="scenario-title" className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">
            Which plan follows the new priority?
          </h2>
          <p className="text-[15px] text-zinc-600">
            A practice test (Sparta sandbox): same practice tickets, same pass/fail checks — only the plan differs.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plan test (Escape)"
          className="rounded-lg px-3 py-2 text-[15px] font-semibold text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          ✕ Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <ComparabilityStrip baseline={shownBaseline} candidate={candidate} />

        <div className="grid grid-cols-2 gap-4">
          <RunColumn
            {...props}
            title="Current plan: oldest tickets first"
            subtitle="Security's current target: close as many tickets as possible, oldest first"
            run={shownBaseline}
            comparable={!!baseline}
            emptyText={NOT_RUN}
          />
          <RunColumn
            {...props}
            title="New plan: beta issues first"
            subtitle="Proposed: handle the beta customer's issue first and leave the critical security ticket alone"
            run={candidate}
            comparable
            emptyText={NOT_RUN}
          />
        </div>

        <InterruptionRow run={interruption} {...props} />

        <div className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-950 ring-1 ring-amber-300">
          <span className="font-bold">What this test covers. </span>
          This is a practice test on sample tickets. It checks how tickets get handled — it doesn&apos;t predict the launch or any business result. These results aren&apos;t
          signed, but anyone can re-run them with the command in the README.
        </div>
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-zinc-200 bg-white px-6 py-4">
        <p className="text-[14px] text-zinc-600">
          {ctaReason ??
            (candidatePassed
              ? `Adds the tested new plan and ${[baseline, candidate, interruption].filter(Boolean).length} test run(s) to your proposal.`
              : "The new plan didn't pass its practice test. Adding it marks the proposal as not tested.")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {!candidatePassed && candidate && isProduct && <Badge tone="amber">Not tested</Badge>}
          <Button onClick={attach} disabled={!!ctaReason}>
            {candidate && !candidatePassed ? "Add anyway (not tested: the new plan didn't pass)" : "Add test results to the proposal"}
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function ComparabilityStrip({ baseline, candidate }: { baseline?: SimulationRun; candidate?: SimulationRun }) {
  if (!baseline || !candidate) {
    const missing = [!baseline && "the current plan", !candidate && "the new plan"].filter(Boolean).join(" and ");
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300">
        <div className="flex items-center gap-2 text-[16px] font-semibold text-amber-950">
          <Badge tone="amber">Can&apos;t compare yet</Badge> No test run yet for {missing}.
        </div>
      </div>
    );
  }
  const diffs = COMPARE_FIELDS.filter((f) => baseline[f.key] !== candidate[f.key]).map((f) => f.label);
  if (diffs.length) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300">
        <div className="flex items-center gap-2 text-[16px] font-semibold text-amber-950">
          <Badge tone="amber">Not a fair comparison</Badge> The {diffs.join(", ")} differ between the two test runs, so the plan isn&apos;t the only difference.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-300">
      <div className="text-[16px] font-semibold text-zinc-900">Same practice tickets, same pass/fail checks — only the plan differs ✓</div>
    </div>
  );
}

function RunColumn(
  props: ViewProps & { title: string; subtitle: string; run?: SimulationRun; comparable: boolean; emptyText: string },
) {
  const { run, s } = props;
  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-white ring-1 ring-zinc-200" aria-label={props.title}>
      <div className="border-b border-zinc-200 px-4 py-3">
        <h3 className="text-[16px] font-bold">{props.title}</h3>
        <p className="text-[14px] text-zinc-600">{props.subtitle}</p>
      </div>
      {!run ? (
        <div className="p-4 text-[15px] leading-relaxed text-zinc-700">
          <Badge tone="amber">Not run yet</Badge>
          <p className="mt-2">{props.emptyText}</p>
          <p className="mt-2 text-[14px] text-zinc-500">Results show up here on their own once the test finishes. Nothing is shown until a real test has run.</p>
        </div>
      ) : (
        <RunBody {...props} run={run} s={s} />
      )}
    </section>
  );
}

function RunBody(props: ViewProps & { run: SimulationRun; comparable: boolean }) {
  const { run, s } = props;
  const plan = s.plans.find((p) => p.plan_id === run.plan_id && p.plan_version === run.plan_version);
  const planDrift = plan && run.plan_hash && plan.hash !== run.plan_hash;
  const beta = run.changed_records.find((c) => c.ticket_id === "4");
  const kr2 = run.checks.filter((c) => c.id.startsWith("beta-"));
  const p0 = run.protected_records.find((p) => p.ticket_id === "1");
  const p0Check = run.checks.find((c) => c.id === "protected-p0");
  const p0Ok = p0Check ? p0Check.passed : p0?.unchanged;

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={run.verdict} />
        {!props.comparable && <Badge tone="amber">Not a fair comparison</Badge>}
        {planDrift && <Badge tone="amber">Needs a new test: the plan changed after this run</Badge>}
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
        <div className="mb-1 al-lbl">The beta customer&apos;s issue (ticket #4)</div>
        <p className="mb-2 text-[15px]">
          {beta ? (
            <>
              What the agent changed: <span>{beta.fields.length ? fieldWords(beta.fields) : "nothing we track"}</span>
            </>
          ) : (
            <span className="font-semibold text-zinc-700">The agent didn&apos;t touch this ticket.</span>
          )}
        </p>
        <CheckList checks={kr2} empty="No checks for the CEO's new requirement in this test run." />
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
        <div className="mb-1 al-lbl">The critical security ticket (#1) · off-limits</div>
        <p className="text-[15px]">
          {p0Ok === undefined ? (
            <span className="text-amber-800">Not checked in this test run.</span>
          ) : p0Ok ? (
            <span>
              <span aria-hidden className="font-bold text-emerald-700">✓ </span>Left alone, as required. Its private note for engineers is intact.
            </span>
          ) : (
            <span className="font-semibold text-red-800">✕ Changed: the agent touched the critical security ticket.</span>
          )}
        </p>
        {p0Check && <p className="mt-1 text-[13px] text-zinc-500">{p0Check.label}</p>}
      </div>

      <Timeline run={run} />

      <div className="mt-auto pt-1">
        <Button
          kind="secondary"
          onClick={() => {
            props.select({ kind: "sim", id: run.id });
            props.go("evidence");
          }}
        >
          See full results in Evidence
        </Button>
      </div>
    </div>
  );
}

function AgentReport({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight);
  }, [text, open]);

  return (
    <div className="mb-2 rounded-lg bg-zinc-50 px-3 py-2 text-[14px] ring-1 ring-zinc-200">
      <div className="al-lbl">What the AI agent says it did (its own words — not checked)</div>
      <p ref={ref} id={id} className={`mt-1 text-zinc-800 ${open ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="mt-1 rounded text-[13px] font-semibold text-violet-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function Timeline({ run }: { run: SimulationRun }) {
  const ev = useEvidence(run.id);
  const planSteps =
    ev?.status === "ready"
      ? (ev.data.trace?.steps ?? []).filter((st) => st.tool === "plan").slice(0, 2).map((st) => String(st.text ?? ""))
      : [];

  return (
    <div>
      <div className="mb-1 al-lbl">What the AI agent did, step by step</div>
      {ev?.status === "ready" && ev.data.trace?.reply ? <AgentReport text={String(ev.data.trace.reply)} /> : null}
      <ol className="max-h-80 overflow-y-auto rounded-lg ring-1 ring-zinc-200" tabIndex={0} aria-label="What the AI agent did, step by step">
        {!ev || ev.status === "loading" ? (
          <li className="px-3 py-2 text-[14px] text-zinc-500" role="status">
            Loading the agent&apos;s steps…
          </li>
        ) : ev.status === "error" ? (
          <li className="px-3 py-2 text-[14px] text-amber-800" role="alert">
            Couldn&apos;t load the agent&apos;s steps: {ev.error}
          </li>
        ) : planSteps.length === 0 ? (
          <li className="flex gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[14px]">
            <span className="w-[120px] shrink-0 text-zinc-500">no written plan</span>
            <span className="min-w-0 italic text-zinc-500">
              The agent followed the team&apos;s plan but didn&apos;t write out its own steps first — it went straight to working on the tickets.
            </span>
          </li>
        ) : (
          planSteps.map((t, i) => (
            <li key={`plan-${i}`} className="flex gap-2 border-b border-zinc-100 px-3 py-2 text-[14px]">
              <span className="w-[120px] shrink-0 font-semibold text-violet-800">agent&apos;s plan</span>
              <span className="min-w-0 text-zinc-700" title={t}>
                {t.length > 180 ? `${t.slice(0, 180)}…` : t}
              </span>
            </li>
          ))
        )}
        {run.trace.length === 0 && <li className="px-3 py-2 text-[14px] text-zinc-500">The agent made no requests to the ticket system.</li>}
        {run.trace.map((r) => {
          const k = rowLabel(r);
          const t = ticketOf(r.path);
          const hitsP0 = t === "1" && k.label === "changed ticket";
          const color = k.tone === "amber" ? "text-amber-800" : k.tone === "violet" ? "text-violet-800" : "text-zinc-600";
          return (
            <li key={r.seq} className={`flex gap-2 border-b border-zinc-100 px-3 py-1.5 text-[14px] ${r.injected ? "bg-amber-50" : hitsP0 ? "bg-red-50" : ""}`}>
              <span className={`w-[120px] shrink-0 font-semibold ${hitsP0 ? "text-red-800" : color}`}>{k.label}</span>
              <span className="min-w-0 flex-1 truncate">
                {t ? `Ticket #${t}${TICKET_LABEL[t] ? ` · ${TICKET_LABEL[t]}` : ""}` : "the ticket list"}
              </span>
              {r.status >= 400 && <span className="shrink-0 text-[13px] text-amber-800">didn&apos;t go through</span>}
            </li>
          );
        })}
        <li className="bg-zinc-50 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold">
            Result from the independent checks <StateBadge state={run.verdict} />
          </div>
          <CheckList checks={run.checks} />
        </li>
      </ol>
    </div>
  );
}

function InterruptionRow({ run, select, go }: ViewProps & { run?: SimulationRun; s: StateView }) {
  if (!run) {
    return (
      <div className="rounded-xl bg-white px-4 py-3 text-[15px] text-zinc-700 ring-1 ring-zinc-200">
        <span className="font-semibold">Outage test:</span> not run yet. This optional test makes the ticket system fail mid-run to check that the agent retries
        safely and doesn&apos;t guess. {NOT_RUN}
      </div>
    );
  }
  const injected = run.trace.filter((r) => r.injected).length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-[15px] ring-1 ring-zinc-200">
      <span className="font-semibold">Outage test:</span>
      <StateBadge state={run.verdict} />
      <span>
        Simulated failures <span className="font-mono">{injected}</span>
      </span>
      <span className="text-[14px] text-zinc-600">
        The ticket system failed mid-run on purpose. The agent may retry a failed request up to 3 times without doing anything twice; if it still fails, it stops
        and reports the problem instead of guessing.
      </span>
      <Button
        kind="ghost"
        onClick={() => {
          select({ kind: "sim", id: run.id });
          go("evidence");
        }}
      >
        See full results in Evidence
      </Button>
    </div>
  );
}
