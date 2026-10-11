"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { SimulationRun, StateView } from "@/lib/types";
import type { ViewProps } from "./props";
import { comparablePair } from "./select";
import { Badge, Button, Mono, StateBadge } from "./ui";
import { CheckList, TICKET_LABEL, rowLabel, ticketOf, useEvidence } from "./EvidenceView";

const BASELINE_CMD = "scripts/run-plan.sh p-throughput@1";
const CANDIDATE_CMD = "scripts/run-plan.sh p-beta@1";
const INTERRUPT_CMD = "scripts/run-plan.sh p-beta@1 interruption";

const COMPARE_FIELDS: { key: "mission_id" | "seed_version" | "checks_version"; label: string }[] = [
  { key: "mission_id", label: "mission" },
  { key: "seed_version", label: "seed" },
  { key: "checks_version", label: "checks" },
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
    ? "Only the Product Director can attach a plan to a proposal."
    : !candidate
      ? "No candidate run yet. Run the candidate plan in a fresh Sparta world first."
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
          <h2 id="scenario-title" className="text-[22px] font-bold tracking-tight">
            Scenario Studio · Sparta test
          </h2>
          <p className="text-[15px] text-zinc-600">Same mission, seed and checks. Only the team triage plan differs.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Scenario Studio (Escape)"
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
            title="Current plan · p-throughput@1"
            subtitle="Security goal v1: throughput"
            run={shownBaseline}
            comparable={!!baseline}
            emptyText={
              <>
                No comparable baseline run yet. Run <Mono>{BASELINE_CMD}</Mono> (fresh Sparta world).
              </>
            }
          />
          <RunColumn
            {...props}
            title="Candidate · p-beta@1"
            subtitle="proposed beta-first, protects P0"
            run={candidate}
            comparable
            emptyText={
              <>
                No candidate run yet. Run <Mono>{CANDIDATE_CMD}</Mono> (fresh Sparta world).
              </>
            }
          />
        </div>

        <InterruptionRow run={interruption} {...props} />

        <div className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-950 ring-1 ring-amber-300">
          <span className="font-bold">Assumptions. </span>
          Synthetic ticket operations only. Tests one ticket-triage behavior, not company strategy, staffing, calendar, release launch or ROI. Evidence is unsigned; reproduce
          with the README command.
        </div>
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-zinc-200 bg-white px-6 py-4">
        <p className="text-[14px] text-zinc-600">
          {ctaReason ??
            (candidatePassed
              ? `Attaches ${candidate!.plan_id}@${candidate!.plan_version} and ${[baseline, candidate, interruption].filter(Boolean).length} run reference(s).`
              : "Candidate did not pass in Sparta. Attaching marks the proposal as untested.")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {!candidatePassed && candidate && isProduct && <Badge tone="amber">UNTESTED</Badge>}
          <Button onClick={attach} disabled={!!ctaReason}>
            {candidate && !candidatePassed ? "Attach (UNTESTED: candidate did not pass)" : "Attach tested plan to proposal"}
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function ComparabilityStrip({ baseline, candidate }: { baseline?: SimulationRun; candidate?: SimulationRun }) {
  const rows = (
    <div className="mt-2 grid grid-cols-[110px_1fr_1fr] gap-x-3 gap-y-1 font-mono text-[13px]">
      <span className="font-sans text-[13px] font-semibold uppercase tracking-wide text-zinc-500"> </span>
      <span className="font-sans text-[13px] font-semibold uppercase tracking-wide text-zinc-500">baseline</span>
      <span className="font-sans text-[13px] font-semibold uppercase tracking-wide text-zinc-500">candidate</span>
      {COMPARE_FIELDS.map((f) => {
        const differs = baseline && candidate && baseline[f.key] !== candidate[f.key];
        return (
          <div key={f.key} className="contents">
            <span className="font-sans text-[14px] text-zinc-600">{f.label}</span>
            <span className={differs ? "font-semibold text-amber-900" : ""}>{baseline?.[f.key] ?? "—"}</span>
            <span className={differs ? "font-semibold text-amber-900" : ""}>{candidate?.[f.key] ?? "—"}</span>
          </div>
        );
      })}
    </div>
  );

  if (!baseline || !candidate) {
    const missing = [!baseline && "baseline (p-throughput@1)", !candidate && "candidate (p-beta@1)"].filter(Boolean).join(" and ");
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300">
        <div className="flex items-center gap-2 text-[16px] font-semibold text-amber-950">
          <Badge tone="amber">Comparison incomplete</Badge> Missing {missing} run.
        </div>
        {rows}
      </div>
    );
  }
  const diffs = COMPARE_FIELDS.filter((f) => baseline[f.key] !== candidate[f.key]).map((f) => f.label);
  if (diffs.length) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300">
        <div className="flex items-center gap-2 text-[16px] font-semibold text-amber-950">
          <Badge tone="amber">Not comparable</Badge> {diffs.join(", ")} differ{diffs.length === 1 ? "s" : ""} between baseline and candidate.
        </div>
        {rows}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-300">
      <div className="text-[16px] font-semibold text-zinc-900">Same mission · same seed · same checks ✓</div>
      {rows}
    </div>
  );
}

function RunColumn(
  props: ViewProps & { title: string; subtitle: string; run?: SimulationRun; comparable: boolean; emptyText: ReactNode },
) {
  const { run, s } = props;
  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-white ring-1 ring-zinc-200" aria-label={props.title}>
      <div className="border-b border-zinc-200 px-4 py-3">
        <h3 className="font-mono text-[15px] font-bold">{props.title}</h3>
        <p className="text-[14px] text-zinc-600">({props.subtitle})</p>
      </div>
      {!run ? (
        <div className="p-4 text-[15px] leading-relaxed text-zinc-700">
          <Badge tone="amber">NO RUN</Badge>
          <p className="mt-2">{props.emptyText}</p>
          <p className="mt-2 text-[14px] text-zinc-500">Results appear here automatically once the evidence file is ingested. Nothing is shown until a real run exists.</p>
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
        <span className="text-[14px] text-zinc-600">
          exit <span className="font-mono text-zinc-900">{run.exit_code}</span>
        </span>
        <span className="text-[14px] text-zinc-600">
          plan <span className="font-mono text-zinc-900">{run.plan_hash.slice(0, 12) || "—"}</span>
        </span>
        {!props.comparable && <Badge tone="amber">not comparable</Badge>}
        {planDrift && <Badge tone="amber">plan changed since run: STALE</Badge>}
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
        <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-500">Shared case · ticket 4 (beta incident)</div>
        <p className="mb-2 text-[15px]">
          {beta ? (
            <>
              Changed: <span className="font-mono text-[14px]">{beta.fields.length ? beta.fields.join(", ") : "no tracked field diff"}</span>
            </>
          ) : (
            <span className="font-semibold text-zinc-700">Not touched by the agent.</span>
          )}
        </p>
        <CheckList checks={kr2} empty="No KR2 checks in this evidence." />
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
        <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-500">Protected P0 · ticket 1 (security incident)</div>
        <p className="text-[15px]">
          {p0Ok === undefined ? (
            <span className="text-amber-800">Not graded in this evidence.</span>
          ) : p0Ok ? (
            <span>
              <span aria-hidden className="font-bold text-emerald-700">✓ </span>Unchanged, private note intact.
            </span>
          ) : (
            <span className="font-semibold text-red-800">✕ Modified: protected P0 was touched.</span>
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
          Open evidence
        </Button>
        <span className="ml-2 font-mono text-[12px] text-zinc-500">{run.id}</span>
      </div>
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
      <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-500">Execution timeline</div>
      <ol className="max-h-80 overflow-y-auto rounded-lg ring-1 ring-zinc-200" tabIndex={0} aria-label="Execution timeline">
        {!ev || ev.status === "loading" ? (
          <li className="px-3 py-2 text-[14px] text-zinc-500" role="status">
            Loading agent trace…
          </li>
        ) : ev.status === "error" ? (
          <li className="px-3 py-2 text-[14px] text-amber-800" role="alert">
            Agent trace unavailable: {ev.error}
          </li>
        ) : planSteps.length === 0 ? (
          <li className="px-3 py-2 text-[14px] text-zinc-500">No agent plan text recorded.</li>
        ) : (
          planSteps.map((t, i) => (
            <li key={`plan-${i}`} className="flex gap-2 border-b border-zinc-100 px-3 py-2 text-[14px]">
              <span className="w-[120px] shrink-0 font-semibold text-violet-800">agent plan</span>
              <span className="min-w-0 text-zinc-700" title={t}>
                {t.length > 180 ? `${t.slice(0, 180)}…` : t}
              </span>
            </li>
          ))
        )}
        {run.trace.length === 0 && <li className="px-3 py-2 text-[14px] text-zinc-500">No connector requests recorded.</li>}
        {run.trace.map((r) => {
          const k = rowLabel(r);
          const t = ticketOf(r.path);
          const hitsP0 = t === "1" && k.label === "scoped mutation";
          const color = k.tone === "amber" ? "text-amber-800" : k.tone === "violet" ? "text-violet-800" : "text-zinc-600";
          return (
            <li key={r.seq} className={`flex gap-2 border-b border-zinc-100 px-3 py-1.5 text-[14px] ${r.injected ? "bg-amber-50" : hitsP0 ? "bg-red-50" : ""}`}>
              <span className={`w-[120px] shrink-0 font-semibold ${hitsP0 ? "text-red-800" : color}`}>{k.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={`${r.method} ${r.path}${t && TICKET_LABEL[t] ? ` · ${TICKET_LABEL[t]}` : ""}`}>
                {r.method} {r.path}
              </span>
              <span className={`shrink-0 font-mono text-[13px] ${r.status >= 400 ? "text-amber-800" : "text-zinc-500"}`}>{r.status}</span>
            </li>
          );
        })}
        <li className="bg-zinc-50 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold">
            Independent grader verdict <StateBadge state={run.verdict} />
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
        <span className="font-semibold">Interruption scenario (injected connector failure):</span> no run yet. Optional: <Mono>{INTERRUPT_CMD}</Mono>
      </div>
    );
  }
  const injected = run.trace.filter((r) => r.injected).length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-[15px] ring-1 ring-zinc-200">
      <span className="font-semibold">Interruption scenario (injected connector failure):</span>
      <StateBadge state={run.verdict} />
      <span>
        exit <span className="font-mono">{run.exit_code}</span>
      </span>
      <span>
        injected requests <span className="font-mono">{injected}</span>
      </span>
      <span className="text-[14px] text-zinc-600">Bounded retry: transient connector errors (429/5xx) get at most 3 attempts with the same idempotency key; then the agent stops with a nonzero exit instead of guessing.</span>
      <Button
        kind="ghost"
        onClick={() => {
          select({ kind: "sim", id: run.id });
          go("evidence");
        }}
      >
        Open evidence
      </Button>
    </div>
  );
}
