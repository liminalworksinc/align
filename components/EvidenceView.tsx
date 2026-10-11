"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { CheckResult, SimulationRun, TraceRow } from "@/lib/types";
import type { ViewProps } from "./props";
import { api } from "./useAlign";
import { tally } from "./select";
import { Badge, Mono, OWNER_LABEL, Section, StateBadge, fmtDuration, fmtTime } from "./ui";

/* ------------------------------------------------------------------ */
/* Shared evidence helpers (also used by ScenarioDrawer)              */
/* ------------------------------------------------------------------ */

export type AgentStep =
  | { at: string; tool: "plan"; text: string }
  | { at: string; tool: string; input?: unknown; ok?: boolean; error?: string; text?: string };

export interface AgentTrace {
  plan_ref?: string;
  plan_sha256?: string;
  run_label?: string | null;
  world_id?: string | null;
  model?: string | null;
  steps?: AgentStep[];
  reply?: string | null;
  error?: string | null;
}

export interface EvidencePayload {
  run: SimulationRun;
  report: Record<string, unknown> | null;
  trace: AgentTrace | null;
}

type EvidenceState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: EvidencePayload };

// Evidence files are immutable per run id, so a module-level cache is safe.
const cache = new Map<string, Promise<EvidencePayload>>();
function loadEvidence(id: string) {
  let p = cache.get(id);
  if (!p) {
    p = api<EvidencePayload>(`/api/evidence/${encodeURIComponent(id)}`);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Lazy-load /api/evidence/:id (run + raw Sparta report + agent trace). */
export function useEvidence(id: string | null | undefined): EvidenceState | null {
  const [state, setState] = useState<{ id: string; st: EvidenceState } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadEvidence(id).then(
      (data) => live && setState({ id, st: { status: "ready", data } }),
      (e: Error) => live && setState({ id, st: { status: "error", error: e.message } }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (!id) return null;
  if (!state || state.id !== id) return { status: "loading" };
  return state.st;
}

export const TICKET_LABEL: Record<string, string> = {
  "1": "protected P0 security incident",
  "2": "routine: API key rotation",
  "3": "routine: SSO docs question",
  "4": "observability beta incident",
};

export function ticketOf(path: string): string | null {
  const m = path.match(/\/tickets\/(\d+)/);
  return m ? m[1] : null;
}

export function rowLabel(r: TraceRow): { label: string; tone: "neutral" | "violet" | "amber" } {
  if (r.injected) return { label: "injected interruption", tone: "amber" };
  if (r.method === "GET") return { label: "read", tone: "neutral" };
  if (r.method === "PUT" || r.method === "POST" || r.method === "PATCH") return { label: "scoped mutation", tone: "violet" };
  return { label: r.method.toLowerCase(), tone: "neutral" };
}

export function CheckList({ checks, empty = "No checks recorded in this evidence." }: { checks: CheckResult[]; empty?: string }) {
  if (!checks.length) return <p className="text-[15px] text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-1">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-[15px] leading-snug">
          <span aria-hidden className={`mt-0.5 font-bold ${c.passed ? "text-emerald-700" : "text-red-700"}`}>
            {c.passed ? "✓" : "✕"}
          </span>
          <span className="min-w-0">
            <span className={c.passed ? "text-zinc-900" : "font-semibold text-red-800"}>{c.label}</span>{" "}
            <span className="font-mono text-[12px] text-zinc-500">{c.id}</span>
            <span className="sr-only">{c.passed ? " passed" : " failed"}</span>
            {c.detail && !c.passed && <span className="block text-[13px] text-zinc-600">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RequestLog({ rows, maxHeight = "max-h-72" }: { rows: TraceRow[]; maxHeight?: string }) {
  if (!rows.length) return <p className="text-[15px] text-zinc-500">No connector requests recorded.</p>;
  return (
    <div className={`${maxHeight} overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed text-zinc-100`} tabIndex={0} aria-label="Sparta request log">
      {rows.map((r) => {
        const t = ticketOf(r.path);
        const kind = rowLabel(r);
        return (
          <div key={r.seq} className={`flex gap-3 whitespace-nowrap ${r.injected ? "text-amber-300" : ""}`}>
            <span className="w-8 shrink-0 text-right text-zinc-500">{r.seq}</span>
            <span className="w-14 shrink-0">{r.method}</span>
            <span className={`w-10 shrink-0 ${r.status >= 400 ? "text-amber-300" : "text-zinc-400"}`}>{r.status}</span>
            <span className="shrink-0">{r.path}</span>
            <span className="text-zinc-500">
              {kind.label}
              {t && TICKET_LABEL[t] ? ` · ${TICKET_LABEL[t]}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function planLabel(r: SimulationRun) {
  return `${r.plan_id}@${r.plan_version}`;
}

/* ------------------------------------------------------------------ */
/* Evidence view                                                      */
/* ------------------------------------------------------------------ */

export function EvidenceView(props: ViewProps) {
  const { mark } = props;
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    mark("evidence_opened");
  }, [mark]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 text-[16px] text-zinc-900">
      <header className="mb-6">
        <h1 className="font-display text-[30px] font-normal leading-[1.1]">Evidence</h1>
        <p className="mt-1 text-[16px] text-zinc-600">
          Decision record, Sparta runs, audit log and coordination timer. Sparta evidence is unsigned: each run is reproducible with the README command, not cryptographically proven.
        </p>
      </header>
      <DecisionRecord {...props} />
      <SpartaRuns {...props} />
      <AuditLog {...props} />
      <TimerPanel {...props} />
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-5 ring-1 ring-zinc-200 ${className}`}>{children}</div>;
}

function ChainStep({ title, who, at, children, tone = "neutral" }: { title: string; who?: string; at?: string | null; children: ReactNode; tone?: "neutral" | "amber" | "violet" }) {
  const dot = tone === "amber" ? "bg-amber-500" : tone === "violet" ? "bg-violet-600" : "bg-zinc-400";
  return (
    <li className="relative pb-5 pl-8 last:pb-0">
      <span aria-hidden className="absolute left-[7px] top-6 bottom-0 w-px bg-zinc-200" />
      <span aria-hidden className={`absolute left-0 top-1.5 h-4 w-4 rounded-full ring-4 ring-white ${dot}`} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-[16px] font-semibold">{title}</h4>
        {who && <span className="text-[14px] text-zinc-600">{who}</span>}
        {at !== undefined && <span className="font-mono text-[13px] text-zinc-500">{at ? `${fmtTime(at)} · ${at}` : "—"}</span>}
      </div>
      <div className="mt-1 text-[16px] leading-relaxed text-zinc-800">{children}</div>
    </li>
  );
}

function DecisionRecord({ s, select }: ViewProps) {
  const proposal = s.proposals.at(-1) ?? null;
  const acceptance = proposal ? ([...s.acceptances].reverse().find((a) => a.proposal_id === proposal.id) ?? null) : null;
  const secV1 =
    s.goals.find((g) => g.owner_id === "security" && g.version === "v1") ?? s.goals.find((g) => g.owner_id === "security" && !g.supersedes);

  return (
    <Section title="Decision record">
      <Card>
        {!proposal ? (
          <div className="text-[16px] text-zinc-600">
            <p className="font-semibold text-zinc-800">No proposal yet.</p>
            <p className="mt-1">
              The decision chain appears here once Product attaches a tested plan in Scenario Studio and sends a proposal to Security.
            </p>
            {secV1 && (
              <p className="mt-3">
                Current Security goal <Mono>{secV1.id}</Mono> ({secV1.version}): {secV1.objective}
              </p>
            )}
          </div>
        ) : (
          <ol className="list-none">
            <ChainStep title={`Initial Security goal ${secV1?.version ?? "v1"}`} who={OWNER_LABEL.security} at={secV1?.approved_at ?? null}>
              {secV1 ? (
                <>
                  <p>{secV1.objective}</p>
                  {secV1.measures.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[15px] text-zinc-700">
                      {secV1.measures.map((m) => (
                        <li key={m.id}>
                          <Mono>{m.id}</Mono> {m.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <span className="text-zinc-500">Security goal v1 is not visible to this session.</span>
              )}
            </ChainStep>

            <ChainStep title="Product proposal" who={OWNER_LABEL[proposal.proposing_owner]} at={proposal.created_at} tone="violet">
              <p>{proposal.proposed_measure_text}</p>
              <p className="mt-1 text-[15px] text-zinc-700">
                <span className="font-semibold">Reciprocal commitment:</span> {proposal.reciprocal_commitment || "—"}
              </p>
              {proposal.rationale && (
                <p className="mt-1 text-[15px] text-zinc-700">
                  <span className="font-semibold">Rationale:</span> {proposal.rationale}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-zinc-600">
                Plan <Mono>{`${proposal.plan_ref.plan_id}@${proposal.plan_ref.plan_version}`}</Mono> hash <Mono>{proposal.plan_ref.plan_hash.slice(0, 12) || "—"}</Mono> · state{" "}
                <StateBadge state={proposal.state} />
              </p>
            </ChainStep>

            {proposal.counter_versions.map((c) => (
              <ChainStep key={c.version} title={`Counter ${c.version}`} who={OWNER_LABEL[c.by]} at={c.at} tone={c.changes_plan ? "amber" : "neutral"}>
                <p>{c.proposed_measure_text}</p>
                {c.rationale && <p className="mt-1 text-[15px] text-zinc-700">{c.rationale}</p>}
                {c.changes_plan ? (
                  <p className="mt-1">
                    <Badge tone="amber">plan changed: prior test STALE</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-[14px] text-zinc-500">Wording only; executable plan unchanged.</p>
                )}
              </ChainStep>
            ))}

            <ChainStep title="Product acknowledgment" who={OWNER_LABEL.product} at={proposal.product_ack_at ?? acceptance?.acknowledged_at ?? null}>
              {proposal.product_ack_at ? (
                "Acknowledged."
              ) : acceptance?.acknowledged_via === "authored_in_proposal" ? (
                "No separate acknowledgment: Security ratified Product's terms unchanged, so the commitment stands as Product wrote it in the proposal."
              ) : acceptance?.acknowledged_at ? (
                "Acknowledged."
              ) : (
                <span className="text-amber-800">Not yet acknowledged.</span>
              )}
            </ChainStep>

            <ChainStep title="Security ratification" who={OWNER_LABEL.security} at={acceptance?.ratified_at ?? null} tone={acceptance ? "violet" : "amber"}>
              {acceptance ? (
                <>
                  <p>
                    Ratified version <Mono>{acceptance.accepted_version}</Mono> → new goal <Mono>{acceptance.new_goal_id}</Mono>
                  </p>
                  {acceptance.rationale && <p className="mt-1 text-[15px] text-zinc-700">{acceptance.rationale}</p>}
                  {acceptance.next_work && (
                    <p className="mt-1 text-[15px] text-zinc-700">
                      <span className="font-semibold">Next work:</span> {acceptance.next_work}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-amber-800">Not ratified yet.</span>
              )}
            </ChainStep>
          </ol>
        )}

        {proposal && (
          <dl className="mt-5 grid grid-cols-[220px_1fr] gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 text-[16px]">
            <dt className="font-semibold text-zinc-600">Alike reference</dt>
            <dd>
              {s.brief.alike_ref ? (
                <>
                  <Mono>{s.brief.alike_ref.decision_id}</Mono> {s.brief.alike_ref.summary}
                  <span className="block text-[14px] text-zinc-500">
                    recorded {fmtTime(s.brief.alike_ref.recorded_at)} · retrieved in session <span className="font-mono">{s.brief.alike_ref.retrieved_in_session}</span>
                  </span>
                </>
              ) : (
                <span className="text-zinc-600">not retrieved ({s.brief.alike_status})</span>
              )}
            </dd>

            <dt className="font-semibold text-zinc-600">Sparta runs referenced</dt>
            <dd>
              {proposal.simulation_refs.length === 0 ? (
                <Badge tone="amber">no Sparta runs referenced</Badge>
              ) : (
                <ul className="space-y-1">
                  {proposal.simulation_refs.map((id) => {
                    const r = s.simulations.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => select({ kind: "sim", id })}
                          className="rounded font-mono text-[14px] text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          {id}
                        </button>
                        {r ? (
                          <>
                            <span className="text-[15px] text-zinc-700">
                              {planLabel(r)} · {r.scenario}
                            </span>
                            {r.verdict === "PASS" && (acceptance?.test_status ?? proposal.test_status) === "STALE" ? (
                              <Badge tone="neutral">PASS for {planLabel(r)}, not for the countered plan</Badge>
                            ) : (
                              <StateBadge state={r.verdict} />
                            )}
                          </>
                        ) : (
                          <Badge tone="amber">run not found in state</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </dd>

            <dt className="font-semibold text-zinc-600">Test status</dt>
            <dd>
              <StateBadge state={acceptance?.test_status ?? proposal.test_status} />
            </dd>

            <dt className="font-semibold text-zinc-600">Company outcome</dt>
            <dd>
              <Badge tone="amber">Company outcome (beta readiness): NOT observed or verified.</Badge>
            </dd>
          </dl>
        )}
      </Card>
    </Section>
  );
}

function SpartaRuns({ s, select, selection }: ViewProps) {
  const selSim = selection?.kind === "sim" ? selection.id : null;
  const [expanded, setExpanded] = useState<string | null>(selSim);
  const [prevSel, setPrevSel] = useState<string | null>(selSim);
  if (selSim !== prevSel) {
    setPrevSel(selSim);
    if (selSim) setExpanded(selSim);
  }
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !selSim) return;
    scrolled.current = true;
    document.getElementById(`sim-row-${selSim}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selSim]);

  const runs = [...s.simulations].reverse();
  const toggle = (id: string) => {
    select({ kind: "sim", id });
    setExpanded((cur) => (cur === id ? null : id));
  };

  return (
    <Section
      title="Sparta runs"
      right={
        <span className="text-[14px] text-zinc-500">
          {(["p-throughput", "p-beta"] as const)
            .map((id) => {
              const n = tally(s, id);
              return `${id}: ${n.pass}/${n.total} PASS`;
            })
            .join(" · ")}{" "}
          · {s.simulations.length} ingested · newest first
        </span>
      }
    >
      <Card className="p-0">
        {runs.length === 0 ? (
          <div className="p-5 text-[16px] text-zinc-600">
            <p className="font-semibold text-zinc-800">No Sparta runs ingested yet.</p>
            <p className="mt-1">Each run is a real LLM agent in a fresh Sparta Team Inbox sandbox. Run, from the repo root:</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Mono>scripts/run-plan.sh p-throughput@1</Mono> <span className="text-[14px] text-zinc-500">baseline (current plan)</span>
              </li>
              <li>
                <Mono>scripts/run-plan.sh p-beta@1</Mono> <span className="text-[14px] text-zinc-500">candidate (beta-first)</span>
              </li>
              <li>
                <Mono>scripts/run-plan.sh p-beta@1 interruption</Mono> <span className="text-[14px] text-zinc-500">injected connector failure</span>
              </li>
            </ul>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-zinc-200 al-lbl">
                  <th className="px-4 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Scenario</th>
                  <th className="px-3 py-2 font-semibold">Verdict</th>
                  <th className="px-3 py-2 font-semibold">Exit</th>
                  <th className="px-3 py-2 font-semibold">Mission · seed · checks</th>
                  <th className="px-3 py-2 font-semibold">Report</th>
                  <th className="px-3 py-2 font-semibold">sha256</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isSel = selSim === r.id;
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        id={`sim-row-${r.id}`}
                        tabIndex={0}
                        role="button"
                        aria-expanded={isOpen}
                        aria-label={`${planLabel(r)} ${r.scenario} run, verdict ${r.verdict}. ${isOpen ? "Collapse" : "Expand"} details`}
                        onClick={() => toggle(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(r.id);
                          }
                        }}
                        className={`cursor-pointer border-b border-zinc-100 align-top outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${
                          isSel ? "bg-violet-50 ring-1 ring-inset ring-violet-300" : "hover:bg-zinc-50"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span aria-hidden className="mr-1 inline-block w-3 text-zinc-400">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          <span className="font-mono text-[14px] font-semibold">{planLabel(r)}</span>
                        </td>
                        <td className="px-3 py-3">{r.scenario === "interruption" ? <Badge tone="amber">interruption</Badge> : "normal"}</td>
                        <td className="px-3 py-3">
                          <StateBadge state={r.verdict} />
                        </td>
                        <td className="px-3 py-3 font-mono">{r.exit_code}</td>
                        <td className="px-3 py-3 font-mono text-[13px] text-zinc-700">
                          {r.mission_id}
                          <br />
                          seed {r.seed_version} · checks {r.checks_version}
                        </td>
                        <td className="max-w-[260px] break-all px-3 py-3 font-mono text-[13px] text-zinc-700">{r.report_path}</td>
                        <td className="px-3 py-3 font-mono text-[13px] text-zinc-700">{r.report_sha256.slice(0, 12)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          <td colSpan={7} className="px-4 py-4">
                            <RunDetail run={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Section>
  );
}

function RunDetail({ run }: { run: SimulationRun }) {
  const ev = useEvidence(run.id);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 al-lbl">Independent grader checks</h4>
        <CheckList checks={run.checks} />
        <h4 className="mb-2 mt-4 al-lbl">Changed records</h4>
        {run.changed_records.length === 0 ? (
          <p className="text-[15px] text-zinc-600">No ticket records changed.</p>
        ) : (
          <ul className="space-y-1 text-[15px]">
            {run.changed_records.map((c) => (
              <li key={c.ticket_id}>
                <span className="font-mono">ticket {c.ticket_id}</span>
                {TICKET_LABEL[c.ticket_id] && <span className="text-zinc-600"> ({TICKET_LABEL[c.ticket_id]})</span>}:{" "}
                <span className="font-mono text-[14px]">{c.fields.length ? c.fields.join(", ") : "no tracked field diff"}</span>
              </li>
            ))}
          </ul>
        )}
        <h4 className="mb-2 mt-4 al-lbl">Protected records</h4>
        <ul className="space-y-1 text-[15px]">
          {run.protected_records.map((p) => (
            <li key={p.ticket_id}>
              <span className="font-mono">ticket {p.ticket_id}</span> {p.unchanged ? "unchanged" : <span className="font-semibold text-red-800">CHANGED</span>}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[14px] text-zinc-700">
          <dt className="text-zinc-500">run id</dt>
          <dd className="font-mono">{run.id}</dd>
          <dt className="text-zinc-500">plan hash</dt>
          <dd className="font-mono">{run.plan_hash.slice(0, 12) || "—"}</dd>
          <dt className="text-zinc-500">world</dt>
          <dd className="font-mono">{run.world_id}</dd>
          <dt className="text-zinc-500">package</dt>
          <dd className="font-mono">{run.package_version || "—"}</dd>
          <dt className="text-zinc-500">ingested</dt>
          <dd className="font-mono">{fmtTime(run.ingested_at)}</dd>
        </dl>
      </div>
      <div className="min-w-0">
        <h4 className="mb-2 al-lbl">Sparta request log ({run.trace.length})</h4>
        <RequestLog rows={run.trace} />
        <h4 className="mb-2 mt-4 al-lbl">Agent trace</h4>
        {!ev || ev.status === "loading" ? (
          <p className="text-[15px] text-zinc-500" role="status">
            Loading evidence…
          </p>
        ) : ev.status === "error" ? (
          <p className="text-[15px] text-amber-800" role="alert">
            Could not load evidence: {ev.error}
          </p>
        ) : !ev.data.trace ? (
          <p className="text-[15px] text-zinc-600">No agent trace file found for this run.</p>
        ) : (
          <div className="text-[15px] text-zinc-700">
            <p>
              <span className="font-mono">{ev.data.trace.plan_ref ?? "—"}</span> · {ev.data.trace.steps?.length ?? 0} steps
              {ev.data.trace.model ? (
                <>
                  {" "}
                  · model <span className="font-mono">{ev.data.trace.model}</span>
                </>
              ) : null}
            </p>
            {ev.data.trace.error && <p className="mt-1 text-amber-800">Agent error: {ev.data.trace.error}</p>}
            <div className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px] ring-1 ring-zinc-200" tabIndex={0} aria-label="Agent steps">
              {(ev.data.trace.steps ?? []).map((st, i) => (
                <div key={i} className="truncate">
                  <span className="text-zinc-400">{i + 1}.</span> {st.tool}
                  {st.tool === "plan"
                    ? `: ${(st.text ?? "").slice(0, 160)}`
                    : "ok" in st && st.ok === false
                      ? ` ✕ ${"error" in st && st.error ? st.error : "failed"}`
                      : ""}
                </div>
              ))}
            </div>
          </div>
        )}
        {ev?.status === "ready" && !ev.data.report && <p className="mt-2 text-[14px] text-amber-800">Raw evidence file not readable at {run.report_path}.</p>}
      </div>
    </div>
  );
}

function AuditLog({ s }: ViewProps) {
  const rows = [...s.audit].reverse();
  return (
    <Section title="Audit log" right={<span className="text-[14px] text-zinc-500">Actor is taken from the signed-in session, never from the request body.</span>}>
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-[16px] text-zinc-600">No audited actions yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 al-lbl">
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Actor</th>
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[14px]">{fmtTime(a.at)}</td>
                    <td className="px-3 py-2">{OWNER_LABEL[a.actor] ?? a.actor}</td>
                    <td className="px-3 py-2 font-mono text-[13px] text-zinc-600">{a.session_id}</td>
                    <td className="px-3 py-2 font-mono text-[14px]">{a.action}</td>
                    <td className="px-3 py-2 font-mono text-[14px] text-zinc-700">{a.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Section>
  );
}

function TimerPanel({ s }: ViewProps) {
  const t = s.timer;
  const duration = t.started_at && t.ended_at ? fmtDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) : null;
  return (
    <Section title="Coordination timer">
      <Card>
        <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-[16px]">
          <dt className="font-semibold text-zinc-600">Started</dt>
          <dd className="font-mono">{t.started_at ? `${fmtTime(t.started_at)} · ${t.started_at}` : "not started"}</dd>
          <dt className="font-semibold text-zinc-600">Ended</dt>
          <dd className="font-mono">{t.ended_at ? `${fmtTime(t.ended_at)} · ${t.ended_at}` : t.started_at ? "running" : "—"}</dd>
          {duration && (
            <>
              <dt className="font-semibold text-zinc-600">Elapsed</dt>
              <dd className="font-mono">{duration}</dd>
            </>
          )}
          {t.acked_by.length > 0 && (
            <>
              <dt className="font-semibold text-zinc-600">Saw final version</dt>
              <dd>{t.acked_by.map((a) => OWNER_LABEL[a] ?? a).join(", ")}</dd>
            </>
          )}
          {t.excluded_prep.length > 0 && (
            <>
              <dt className="font-semibold text-zinc-600">Excluded prep</dt>
              <dd className="text-[15px]">{t.excluded_prep.map((p) => `${p.label} (${p.seconds}s)`).join(" · ")}</dd>
            </>
          )}
        </dl>
        <h4 className="mb-2 mt-4 al-lbl">Touchpoints ({t.touchpoints.length})</h4>
        {t.touchpoints.length === 0 ? (
          <p className="text-[16px] text-zinc-600">No touchpoints recorded yet.</p>
        ) : (
          <ol className="space-y-1 text-[15px]">
            {t.touchpoints.map((p, i) => (
              <li key={`${p.at}-${i}`} className="flex gap-3">
                <span className="w-24 shrink-0 font-mono text-[14px] text-zinc-500">{fmtTime(p.at)}</span>
                <span className="w-48 shrink-0">{OWNER_LABEL[p.actor] ?? p.actor}</span>
                <span className="font-mono text-[14px]">{p.action}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Section>
  );
}
