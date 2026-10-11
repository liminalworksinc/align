"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { CheckResult, SimulationRun, TraceRow } from "@/lib/types";
import type { ViewProps } from "./props";
import { api } from "./useAlign";
import { tally } from "./select";
import { Badge, ForEngineers, OWNER_LABEL, STATE_LABEL, Section, StateBadge, fmtDuration, fmtTime } from "./ui";
import { checkWords } from "./SpartaProof";

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
  "1": "critical security issue (off-limits)",
  "2": "routine: changing an API key",
  "3": "routine: question about single sign-on docs",
  "4": "beta customer issue",
};

export function ticketOf(path: string): string | null {
  const m = path.match(/\/tickets\/(\d+)/);
  return m ? m[1] : null;
}

export function rowLabel(r: TraceRow): { label: string; tone: "neutral" | "violet" | "amber" } {
  if (r.injected) return { label: "simulated outage", tone: "amber" };
  if (r.method === "GET") return { label: "looked at", tone: "neutral" };
  if (r.method === "PUT" || r.method === "POST" || r.method === "PATCH") return { label: "changed ticket", tone: "violet" };
  return { label: r.method.toLowerCase(), tone: "neutral" };
}

const FIELD_WORDS: Record<string, string> = {
  status: "status",
  priority: "priority",
  tags: "tags",
  comments: "notes and replies",
};

/** Plain words for the ticket fields an agent changed (e.g. "priority, tags, notes and replies"). */
export function fieldWords(fields: string[]) {
  return fields.map((f) => FIELD_WORDS[f] ?? f.replaceAll("_", " ")).join(", ");
}

const ACTION_WORDS: Record<string, string> = {
  ceo_change_viewed: "saw the CEO's change",
  brief_reviewed: "read What to do next",
  scenario_reviewed: "opened Test both plans",
  evidence_opened: "opened Evidence",
  propose: "proposed a change",
  counter: "asked for changes",
  acknowledge: "accepted Security's changes",
  ratify: "approved",
  ratify_and_push_company_goal: "approved the company goal and sent it to every team",
  saw_accepted_version: "saw the approved version",
  reset: "reset the demo",
};

function actionWords(action: string) {
  return ACTION_WORDS[action] ?? action.replaceAll("_", " ");
}

export function CheckList({ checks, empty = "No checks recorded for this test run." }: { checks: CheckResult[]; empty?: string }) {
  if (!checks.length) return <p className="text-[15px] text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-1">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-[15px] leading-snug">
          <span aria-hidden className={`mt-0.5 font-bold ${c.passed ? "text-emerald-700" : "text-red-700"}`}>
            {c.passed ? "✓" : "✕"}
          </span>
          <span className="min-w-0">
            <span className={c.passed ? "text-zinc-900" : "font-semibold text-red-800"}>{checkWords(c.id, c.label)}</span>
            <span className="sr-only">{c.passed ? " passed" : " failed"}</span>
            {c.detail && !c.passed && !/assertion failed/i.test(c.detail) && <span className="block text-[13px] text-zinc-600">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RequestLog({ rows, maxHeight = "max-h-72" }: { rows: TraceRow[]; maxHeight?: string }) {
  if (!rows.length) return <p className="text-[15px] text-zinc-500">The agent made no requests to the ticket system.</p>;
  return (
    <div className={`${maxHeight} overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed text-zinc-800`} tabIndex={0} aria-label="Technical log of every request the AI agent sent to the ticket system">
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

const PLAN_NAME: Record<string, string> = {
  "p-throughput": "Current plan: oldest tickets first",
  "p-beta": "New plan: beta issues first",
};

/** Plain-language plan name for display; the plan id only appears under "For engineers". */
function planName(r: SimulationRun) {
  return PLAN_NAME[r.plan_id] ?? "Team plan";
}

function scenarioName(r: SimulationRun) {
  return r.scenario === "interruption" ? "outage test" : "normal test";
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Evidence</h1>
        <p className="mt-1 text-[16px] text-zinc-600">
          What was decided, the practice test runs, who did what, and how long it took to agree. These results aren&apos;t signed, but anyone can re-run them with the
          command in the README.
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
        {at !== undefined && <span className="text-[13px] text-zinc-500">{at ? fmtTime(at) : "—"}</span>}
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
    <Section title="What was decided">
      <Card>
        {!proposal ? (
          <div className="text-[16px] text-zinc-600">
            <p className="font-semibold text-zinc-800">No proposal yet.</p>
            <p className="mt-1">
              The steps of the decision show up here once Product adds test results in &ldquo;Test both plans&rdquo; and sends a proposal to Security.
            </p>
            {secV1 && (
              <p className="mt-3">
                Security&apos;s current goal ({secV1.version}): {secV1.objective}
              </p>
            )}
          </div>
        ) : (
          <ol className="list-none">
            <ChainStep title={`Security's starting goal (${secV1?.version ?? "v1"})`} who={OWNER_LABEL.security} at={secV1?.approved_at ?? null}>
              {secV1 ? (
                <>
                  <p>{secV1.objective}</p>
                  {secV1.measures.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[15px] text-zinc-700">
                      {secV1.measures.map((m) => (
                        <li key={m.id}>{m.text}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <span className="text-zinc-500">Security&apos;s first goal isn&apos;t visible from this account.</span>
              )}
            </ChainStep>

            <ChainStep title="Product's proposal" who={OWNER_LABEL[proposal.proposing_owner]} at={proposal.created_at} tone="violet">
              <p>{proposal.proposed_measure_text}</p>
              <p className="mt-1 text-[15px] text-zinc-700">
                <span className="font-semibold">What Product will do in return:</span> {proposal.reciprocal_commitment || "—"}
              </p>
              {proposal.rationale && (
                <p className="mt-1 text-[15px] text-zinc-700">
                  <span className="font-semibold">Why:</span> {proposal.rationale}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-zinc-600">
                Status <StateBadge state={proposal.state} />
              </p>
            </ChainStep>

            {proposal.counter_versions.map((c) => (
              <ChainStep key={c.version} title={`Security asked for changes (${c.version})`} who={OWNER_LABEL[c.by]} at={c.at} tone={c.changes_plan ? "amber" : "neutral"}>
                <p>{c.proposed_measure_text}</p>
                {c.rationale && <p className="mt-1 text-[15px] text-zinc-700">{c.rationale}</p>}
                {c.changes_plan ? (
                  <p className="mt-1">
                    <Badge tone="amber">Needs a new test: the changes alter how the agent works</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-[14px] text-zinc-500">Wording only — how the agent works is unchanged.</p>
                )}
              </ChainStep>
            ))}

            <ChainStep title="Product accepts Security's changes" who={OWNER_LABEL.product} at={proposal.product_ack_at ?? acceptance?.acknowledged_at ?? null}>
              {proposal.product_ack_at ? (
                "Accepted."
              ) : acceptance?.acknowledged_via === "authored_in_proposal" ? (
                "No separate step needed: Security approved Product's terms as written, so what Product will do in return stands as stated in the proposal."
              ) : acceptance?.acknowledged_at ? (
                "Accepted."
              ) : (
                <span className="text-amber-800">Not accepted yet.</span>
              )}
            </ChainStep>

            <ChainStep title="Security approves" who={OWNER_LABEL.security} at={acceptance?.ratified_at ?? null} tone={acceptance ? "violet" : "amber"}>
              {acceptance ? (
                <>
                  <p>
                    Approved version {acceptance.accepted_version}. This is now Security&apos;s goal.
                  </p>
                  {acceptance.rationale && <p className="mt-1 text-[15px] text-zinc-700">{acceptance.rationale}</p>}
                  {acceptance.next_work && (
                    <p className="mt-1 text-[15px] text-zinc-700">
                      <span className="font-semibold">Next step:</span> {acceptance.next_work}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-amber-800">Not approved yet.</span>
              )}
            </ChainStep>
          </ol>
        )}

        {proposal && (
          <dl className="mt-5 grid grid-cols-[220px_1fr] gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 text-[16px]">
            <dt className="font-semibold text-zinc-600">Earlier team decision</dt>
            <dd>
              <span className="block text-[14px] text-zinc-500">Saved by Alike, our AI-agent memory tool</span>
              {s.brief.alike_ref ? (
                <>
                  {s.brief.alike_ref.summary}
                  <span className="block text-[14px] text-zinc-500">
                    Saved at {fmtTime(s.brief.alike_ref.recorded_at)}, then found again by a new AI session.
                  </span>
                </>
              ) : (
                <span className="text-zinc-600">Not found ({s.brief.alike_status})</span>
              )}
            </dd>

            <dt className="font-semibold text-zinc-600">Test runs attached</dt>
            <dd>
              {proposal.simulation_refs.length === 0 ? (
                <Badge tone="amber">No test runs attached</Badge>
              ) : (
                <ul className="space-y-1">
                  {proposal.simulation_refs.map((id) => {
                    const r = s.simulations.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => select({ kind: "sim", id })}
                          className="rounded text-[15px] text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          {r ? `${planName(r)} · ${scenarioName(r)}` : "Test run"}
                        </button>
                        {r ? (
                          <>
                            {r.verdict === "PASS" && (acceptance?.test_status ?? proposal.test_status) === "STALE" ? (
                              <Badge tone="neutral">Passed for this plan, not for the version Security changed</Badge>
                            ) : (
                              <StateBadge state={r.verdict} />
                            )}
                          </>
                        ) : (
                          <Badge tone="amber">Test run not found</Badge>
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

            <dt className="font-semibold text-zinc-600">Beta launch outcome</dt>
            <dd>
              <Badge tone="amber">Whether the beta launch succeeds isn&apos;t known yet. This test can&apos;t tell you that.</Badge>
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
      title="Practice test runs (Sparta sandbox)"
      right={
        <span className="text-[14px] text-zinc-500">
          {(["p-throughput", "p-beta"] as const)
            .map((id) => {
              const n = tally(s, id);
              return `${id === "p-beta" ? "New plan" : "Current plan"}: ${n.pass} of ${n.total} passed`;
            })
            .join(" · ")}{" "}
          · {s.simulations.length} runs in total · newest first
        </span>
      }
    >
      <Card className="p-0">
        {runs.length === 0 ? (
          <div className="p-5 text-[16px] text-zinc-600">
            <p className="font-semibold text-zinc-800">No test runs yet.</p>
            <p className="mt-1">
              Each run puts a real AI agent to work on a fresh set of practice tickets (Sparta sandbox). An engineer starts the three tests from the project: the
              current plan, the new plan, and the outage test. Results show up here on their own.
            </p>
            <ForEngineers>
              <div>scripts/run-plan.sh p-throughput@1</div>
              <div>scripts/run-plan.sh p-beta@1</div>
              <div>scripts/run-plan.sh p-beta@1 interruption</div>
            </ForEngineers>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-zinc-200 al-lbl">
                  <th className="px-4 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Test type</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Checks passed</th>
                  <th className="px-3 py-2 font-semibold">Time</th>
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
                        aria-label={`${planName(r)}, ${scenarioName(r)}, result ${STATE_LABEL[r.verdict] ?? r.verdict}. ${isOpen ? "Hide" : "Show"} details`}
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
                        <td className="whitespace-nowrap px-4 py-3">
                          <span aria-hidden className="mr-1 inline-block w-3 text-zinc-400">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          <span className="font-semibold">{planName(r)}</span>
                        </td>
                        <td className="px-3 py-3">{r.scenario === "interruption" ? <Badge tone="amber">Outage test</Badge> : "Normal test"}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <StateBadge state={r.verdict} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                          {r.checks.filter((c) => c.passed).length} of {r.checks.length}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-700">{fmtTime(r.ingested_at)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          <td colSpan={5} className="px-4 py-4">
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
  const trace = ev?.status === "ready" ? ev.data.trace : null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 al-lbl">Independent checks</h4>
        <CheckList checks={run.checks} />
        <h4 className="mb-2 mt-4 al-lbl">Tickets the agent changed</h4>
        {run.changed_records.length === 0 ? (
          <p className="text-[15px] text-zinc-600">The agent didn&apos;t change any tickets.</p>
        ) : (
          <ul className="space-y-1 text-[15px]">
            {run.changed_records.map((c) => (
              <li key={c.ticket_id}>
                <span className="font-semibold">Ticket #{c.ticket_id}</span>
                {TICKET_LABEL[c.ticket_id] && <span className="text-zinc-600"> ({TICKET_LABEL[c.ticket_id]})</span>}:{" "}
                {c.fields.length ? fieldWords(c.fields) : "nothing we track"}
              </li>
            ))}
          </ul>
        )}
        <h4 className="mb-2 mt-4 al-lbl">Off-limits tickets</h4>
        <ul className="space-y-1 text-[15px]">
          {run.protected_records.map((p) => (
            <li key={p.ticket_id}>
              <span className="font-semibold">Ticket #{p.ticket_id}</span>{" "}
              {p.unchanged ? "left alone, as required" : <span className="font-semibold text-red-800">Changed — this ticket was off-limits</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-zinc-500">Added at {fmtTime(run.ingested_at)}</p>
      </div>
      <div className="min-w-0">
        <h4 className="mb-2 al-lbl">What the AI agent did, step by step</h4>
        {run.trace.length === 0 ? (
          <p className="text-[15px] text-zinc-500">The agent made no requests to the ticket system.</p>
        ) : (
          <ol className="max-h-72 space-y-0.5 overflow-auto rounded-lg bg-white p-2 text-[14px] ring-1 ring-zinc-200" tabIndex={0} aria-label="What the AI agent did, step by step">
            {run.trace.map((r) => {
              const t = ticketOf(r.path);
              return (
                <li key={r.seq} className={`flex gap-2 ${r.injected ? "text-amber-800" : "text-zinc-700"}`}>
                  <span className="w-28 shrink-0 font-semibold">{rowLabel(r).label}</span>
                  <span className="min-w-0 flex-1 truncate">{t ? `Ticket #${t}${TICKET_LABEL[t] ? ` · ${TICKET_LABEL[t]}` : ""}` : "the ticket list"}</span>
                  {r.status >= 400 && <span className="shrink-0 text-amber-800">didn&apos;t go through</span>}
                </li>
              );
            })}
          </ol>
        )}
        {!ev || ev.status === "loading" ? (
          <p className="mt-2 text-[15px] text-zinc-500" role="status">
            Loading…
          </p>
        ) : ev.status === "error" ? (
          <p className="mt-2 text-[15px] text-amber-800" role="alert">
            Couldn&apos;t load the rest of this run&apos;s details.
          </p>
        ) : !trace ? (
          <p className="mt-2 text-[15px] text-zinc-600">The agent&apos;s own notes weren&apos;t saved for this run.</p>
        ) : (
          <>
            {trace.reply && (
              <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[14px] ring-1 ring-zinc-200">
                <div className="al-lbl">What the AI agent says it did (its own words — not checked)</div>
                <p className="mt-1 line-clamp-6 text-zinc-800">{trace.reply}</p>
              </div>
            )}
            {trace.error && <p className="mt-2 text-[15px] text-amber-800">The agent reported a problem during this run.</p>}
          </>
        )}
        {ev?.status === "ready" && !ev.data.report && <p className="mt-2 text-[14px] text-amber-800">The original results file couldn&apos;t be read.</p>}
      </div>
      <div className="lg:col-span-2">
        <ForEngineers>
          <div>run id: {run.id}</div>
          <div>plan: {planLabel(run)} · hash {run.plan_hash || "—"}</div>
          <div>
            mission {run.mission_id} · seed {run.seed_version} · checks {run.checks_version} · exit {run.exit_code}
          </div>
          <div>world: {run.world_id} · package: {run.package_version || "—"} · ingested: {run.ingested_at}</div>
          <div>
            report: {run.report_path} · sha256 {run.report_sha256}
          </div>
          <div>check ids: {run.checks.map((c) => `${c.id}=${c.passed ? "pass" : "fail"}`).join(", ") || "—"}</div>
          {trace && (
            <div>
              trace: {trace.steps?.length ?? 0} steps · plan_ref {trace.plan_ref ?? "—"} · model {trace.model ?? "—"}
              {trace.error ? ` · error: ${trace.error}` : ""}
            </div>
          )}
          {ev?.status === "error" && <div>evidence load error: {ev.error}</div>}
          <div className="pt-1">Request log ({run.trace.length})</div>
          <RequestLog rows={run.trace} />
          {trace && (trace.steps ?? []).length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg bg-white p-2 ring-1 ring-zinc-200" tabIndex={0} aria-label="Agent steps (technical)">
              {(trace.steps ?? []).map((st, i) => (
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
          )}
        </ForEngineers>
      </div>
    </div>
  );
}

function AuditLog({ s }: ViewProps) {
  const rows = [...s.audit].reverse();
  return (
    <Section
      title="Who did what, when"
      right={<span className="text-[14px] text-zinc-500">Names come from who was signed in, so a request can&apos;t claim to be someone else.</span>}
    >
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-[16px] text-zinc-600">Nothing recorded yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 al-lbl">
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Who</th>
                  <th className="px-3 py-2 font-semibold">What they did</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="whitespace-nowrap px-4 py-2 text-[14px]">{fmtTime(a.at)}</td>
                    <td className="px-3 py-2">{OWNER_LABEL[a.actor] ?? a.actor}</td>
                    <td className="px-3 py-2">{actionWords(a.action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="border-t border-zinc-100 px-4 pb-3">
            <ForEngineers>
              {rows.map((a) => (
                <div key={a.id}>
                  {a.at} · {a.actor} · session {a.session_id} · {a.action} → {a.target}
                </div>
              ))}
            </ForEngineers>
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
    <Section title="Time to agreement">
      <Card>
        <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-[16px]">
          <dt className="font-semibold text-zinc-600">Started</dt>
          <dd>{t.started_at ? fmtTime(t.started_at) : "Not started"}</dd>
          <dt className="font-semibold text-zinc-600">Ended</dt>
          <dd>{t.ended_at ? fmtTime(t.ended_at) : t.started_at ? "Still running" : "—"}</dd>
          {duration && (
            <>
              <dt className="font-semibold text-zinc-600">Time taken</dt>
              <dd>{duration}</dd>
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
              <dt className="font-semibold text-zinc-600">Not counted</dt>
              <dd className="text-[15px]">
                {t.excluded_prep.length} practice test run{t.excluded_prep.length === 1 ? "" : "s"} done beforehand (
                {fmtDuration(t.excluded_prep.reduce((n, p) => n + p.seconds, 0) * 1000)} in total)
                <ForEngineers>{t.excluded_prep.map((p) => `${p.label} (${p.seconds}s)`).join(" · ")}</ForEngineers>
              </dd>
            </>
          )}
        </dl>
        <h4 className="mb-2 mt-4 al-lbl">Steps ({t.touchpoints.length})</h4>
        {t.touchpoints.length === 0 ? (
          <p className="text-[16px] text-zinc-600">No steps recorded yet.</p>
        ) : (
          <ol className="space-y-1 text-[15px]">
            {t.touchpoints.map((p, i) => (
              <li key={`${p.at}-${i}`} className="flex gap-3">
                <span className="w-24 shrink-0 text-[14px] text-zinc-500">{fmtTime(p.at)}</span>
                <span className="w-48 shrink-0">{OWNER_LABEL[p.actor] ?? p.actor}</span>
                <span>{actionWords(p.action)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Section>
  );
}
