"use client";
import type { ReactNode } from "react";
import type { Goal, GoalRelation, Proposal, SimulationRun, StateView, WorkItem } from "@/lib/types";
import type { ViewProps } from "./props";
import { Badge, Button, OWNER_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { teamName } from "./TeamLens";
import { accepted, comparablePair, currentGoal, priorVersion } from "./select";

const DEFAULT_RELATION = "r-product-security";

/* Plain words for codes that live in the data. */
const RELATION_WORD: Record<string, string> = { child: "passes down to", supports: "supports", depends_on: "depends on", conflicts_with: "clashes with" };
const SCENARIO: Record<string, string> = { normal: "Normal run", interruption: "Outage test" };
const WHAT: Record<string, string> = { Relation: "This connection", "Simulation run": "This test run", "Work item": "This work item", Goal: "This goal", Proposal: "This proposal" };
function planName(id: string) {
  if (id.includes("beta")) return "New plan: beta issues first";
  if (id.includes("throughput")) return "Current plan: oldest tickets first";
  return "Plan";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-zinc-100 py-2 last:border-b-0">
      <div className="al-lbl">{label}</div>
      <div className="mt-0.5 text-[16px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

function goalById(s: StateView, id: string | undefined): Goal | undefined {
  return id ? s.goals.find((g) => g.id === id) : undefined;
}

function ceoKR2(s: StateView) {
  return currentGoal(s, "ceo")?.measures.find((m) => m.id === "KR2");
}

/** The original Security goal (first version, before any ratified supersession). */
function originalSecurity(s: StateView): Goal | undefined {
  const sec = s.goals.filter((g) => g.owner_id === "security");
  return sec.find((g) => !g.supersedes) ?? sec[0];
}

function GoalPanel({ p, g }: { p: ViewProps; g: Goal }) {
  const { s, me } = p;
  const prior = priorVersion(s, g);
  const isCeo = g.owner_id === "ceo";
  const isMine = g.owner_id === me.actor;
  const edit = isCeo ? "Set by CEO · view only" : isMine ? "Your goal · you can edit" : `${teamName(g)}'s goal · view only`;
  const kr2 = ceoKR2(s);
  const isCurrent = currentGoal(s, g.owner_id)?.id === g.id;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" icon={false}>
          {OWNER_LABEL[g.owner_id] ?? g.owner_name}
        </Badge>
        <Badge tone="neutral" icon={false}>
          {g.version}
        </Badge>
        {g.changed && <Badge tone="amber">Changed today</Badge>}
        {!isCurrent && <Badge tone="neutral">Replaced by a newer version</Badge>}
      </div>
      <p className="mb-4 text-[18px] font-semibold leading-snug text-zinc-900">{g.objective}</p>
      <Section title="Goal">
        <Row label="Owner">{OWNER_LABEL[g.owner_id] ?? g.owner_name}</Row>
        <Row label="Version">
          {g.version}
          {prior && (
            <span className="text-zinc-500">
              {" "}
              (the earlier version, {prior.version}, is kept for the record)
            </span>
          )}
        </Row>
        <Row label="Who can edit">
          <Badge tone={isMine ? "violet" : "neutral"} icon={false}>
            {edit}
          </Badge>
        </Row>
        {g.kind === "team" && kr2 && (
          <Row label="The CEO's new requirement">
            <span className="text-zinc-800">{kr2.text}</span>
          </Row>
        )}
      </Section>
      {g.owner_id === "security" && <WorkNotGoal s={s} g={g} />}
      <Section title="How success is measured">
        <ul className="space-y-2">
          {g.measures.map((m) => (
            <li key={m.id} className="rounded-lg bg-zinc-50 p-2.5 text-[15px] leading-snug ring-1 ring-zinc-200">
              {m.inherited_from && <div className="mb-1 text-[13px] text-zinc-500">From the CEO&apos;s goal</div>}
              {m.text}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Where this comes from">
        <div className="space-y-2 text-[15px]">
          <div className="flex items-start gap-2">
            <StateBadge state="OBSERVED" />
            <span>
              Approved by {OWNER_LABEL[g.approved_by] ?? g.approved_by} at {fmtTime(g.approved_at)}
            </span>
          </div>
          {g.owner_id === "security" && me.actor === "product" && (
            <div className="flex items-start gap-2">
              <StateBadge state="UNKNOWN" />
              <span>How much time Security has free: unknown (Security hasn&apos;t shared it)</span>
            </div>
          )}
          {g.owner_id === "product" && me.actor === "security" && (
            <div className="flex items-start gap-2">
              <StateBadge state="UNKNOWN" />
              <span>Which features are in Product&apos;s beta: unknown (Product hasn&apos;t shared it)</span>
            </div>
          )}
        </div>
      </Section>
      <div className="flex flex-wrap gap-2">
        {isCeo ? (
          <Button
            onClick={() => {
              p.mark("ceo_change_viewed");
              p.openDrawer("brief");
            }}
          >
            See what to do next
          </Button>
        ) : isMine ? (
          <Button onClick={() => p.openDrawer("brief")}>See what to do next</Button>
        ) : (
          <Button onClick={() => p.go("proposals")}>Propose a change to {teamName(g)}&apos;s goal</Button>
        )}
      </div>
    </>
  );
}

/** Design "Busy isn't the same as on-goal": old criterion vs inherited one, the affected ticket, real Sparta status. */
function WorkNotGoal({ s, g }: { s: StateView; g: Goal }) {
  const old = originalSecurity(s)?.measures.find((m) => m.id === "S-M1") ?? g.measures.find((m) => m.id === "S-M1");
  const kr2 = ceoKR2(s);
  const { baseline, candidate } = comparablePair(s);
  const runs = [baseline, candidate].filter((r): r is SimulationRun => Boolean(r));
  if (!kr2) return null; // nothing to contrast until the CEO adds the new requirement
  return (
    <Section title="Busy isn't the same as on-goal">
      <div className="divide-y divide-zinc-200 rounded-[10px] border border-zinc-200 text-[14px]">
        <div className="px-3 py-2">
          <div className="al-lbl">What Security measured before the change</div>
          <div className="text-zinc-900">{old?.text ?? "Unknown"}</div>
        </div>
        <div className="px-3 py-2">
          <div className="al-lbl !text-amber-700">What the CEO now requires</div>
          <div className="text-zinc-900">{kr2?.text ?? "Unknown"}</div>
        </div>
        <div className="px-3 py-2">
          <div className="al-lbl">Ticket affected</div>
          <div className="text-zinc-900">The beta customer&apos;s issue (ticket #4)</div>
        </div>
        <div className="px-3 py-2">
          <div className="al-lbl">Practice test results</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {runs.length === 0 ? (
              <StateBadge state="UNTESTED" />
            ) : (
              runs.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-600">
                  <StateBadge state={r.verdict} />
                  {planName(r.plan_id)}: {r.checks.filter((c) => c.passed).length} of {r.checks.length} checks passed
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function RelationPanel({ p, r }: { p: ViewProps; r: GoalRelation }) {
  const { s } = p;
  const src = goalById(s, r.source_goal);
  const tgt = goalById(s, r.target_goal);
  const isConflict = r.id === DEFAULT_RELATION;
  const orig = originalSecurity(s);
  const oldMeasure = orig?.measures.find((m) => m.id === "S-M1");
  const protectedMeasure = orig?.measures.find((m) => m.id === "S-M2");
  const kr2 = ceoKR2(s);
  const acc = r.status === "ACCEPTED" && isConflict ? accepted(s) : null;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[20px] font-bold text-zinc-900">{isConflict ? "Product needs Security" : "How these goals connect"}</h2>
        <StateBadge state={r.status} />
      </div>
      <p className="mb-4 text-[16px] leading-snug text-zinc-800">{r.label}</p>
      <div className="mb-4 text-[14px] text-zinc-600">
        {src ? `${OWNER_LABEL[src.owner_id]} ${src.version}` : r.source_goal} <span className="text-zinc-400">{RELATION_WORD[r.type] ?? r.type.replace("_", " ")}</span>{" "}
        {tgt ? `${OWNER_LABEL[tgt.owner_id]} ${tgt.version}` : r.target_goal}
      </div>

      {isConflict && (
        <Section title={r.status === "ACCEPTED" ? "What the goals clashed on (now agreed)" : "Where the goals clash"}>
          <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
            <ConflictRow label={`${r.status === "ACCEPTED" ? "Security's old target" : "Security's current target"}${orig ? ` (${orig.version})` : ""}`} tone={r.status === "ACCEPTED" ? "neutral" : "amber"}>
              {oldMeasure?.text ?? "Unknown"}
            </ConflictRow>
            <ConflictRow label="The CEO's new requirement" tone="neutral">
              {kr2?.text ?? "Unknown"}
            </ConflictRow>
            <ConflictRow label="Critical security ticket (off-limits)" tone="neutral">
              The critical security ticket (#1) and its private notes must not be touched.
              {protectedMeasure && <div className="mt-1 text-[13px] text-zinc-500">Security&apos;s rule: {protectedMeasure.text}</div>}
            </ConflictRow>
            {r.status === "ACCEPTED" ? (
              <ConflictRow label="What happens now" tone="neutral">
                Security approved a new target: beta customers&apos; issues come first, and the critical security ticket stays off-limits.
              </ConflictRow>
            ) : (
              <ConflictRow label="What happens now" tone="amber">
                Beta customers&apos; issues wait in line like any other ticket. The CEO&apos;s new requirement can&apos;t be met unless Security
                changes its target.
              </ConflictRow>
            )}
          </div>
        </Section>
      )}

      <Section title="Where this comes from">
        <div className="flex items-start gap-2 text-[15px] leading-snug text-zinc-700">
          <StateBadge state="OBSERVED" />
          <span>
            {acc
              ? `Agreed through ${OWNER_LABEL.product}'s proposal and approved by Security.`
              : isConflict
                ? "Found when the CEO sent the updated company goal to every team. Security's current target doesn't mention the beta."
                : "From the company's goal plan."}
          </span>
        </div>
      </Section>

      {acc && (
        <Section title="What was decided">
          <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <Row label="Approved goal">
              Security&apos;s goal, {acc.accepted_version}
            </Row>
            <Row label="Approved by">
              {OWNER_LABEL[acc.ratified_by]} · {fmtTime(acc.ratified_at)}
            </Row>
            <Row label="Changes accepted by">
              {OWNER_LABEL[acc.acknowledged_by]} · {acc.acknowledged_via === "authored_in_proposal" ? "with what Product will do in return written into its proposal, " : ""}{fmtTime(acc.acknowledged_at)}
            </Row>
            <Row label="Next step">{acc.next_work}</Row>
            <Row label="Plan tested">{planName(acc.plan_ref.plan_id)}</Row>
            <Row label="Practice test result">
              <StateBadge state={acc.test_status} />
            </Row>
            <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[14px] font-semibold text-amber-900 ring-1 ring-amber-300">
              Whether the beta launch succeeds isn&apos;t known yet. This test can&apos;t tell you that.
            </p>
          </div>
        </Section>
      )}

      {isConflict && (
        <Button
          onClick={() => {
            p.mark("brief_reviewed");
            p.openDrawer("brief");
          }}
        >
          See what to do next
        </Button>
      )}
    </>
  );
}

function ConflictRow({ label, tone, children }: { label: string; tone: "amber" | "neutral"; children: ReactNode }) {
  return (
    <div className={`border-b border-zinc-200 px-3 py-2.5 last:border-b-0 ${tone === "amber" ? "bg-amber-50/60" : "bg-white"}`}>
      <div className="al-lbl">{label}</div>
      <div className="mt-0.5 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

function WorkPanel({ p, w }: { p: ViewProps; w: WorkItem }) {
  const g = goalById(p.s, w.goal_id);
  return (
    <>
      <h2 className="mb-1 al-lbl">Work item</h2>
      <p className="mb-4 text-[18px] font-semibold leading-snug text-zinc-900">{w.task}</p>
      <Section title="Details">
        <Row label="Owner">{OWNER_LABEL[w.owner] ?? w.owner}</Row>
        <Row label="Source">{w.source}</Row>
        <Row label="Status">
          <span className="inline-flex items-center gap-2">
            <StateBadge state="OBSERVED" /> {w.observed_status}
          </span>
        </Row>
        <Row label="Priority">#{w.priority_rank}</Row>
        <Row label="Goal">
          {g ? (
            <button className="text-left text-violet-800 underline-offset-2 hover:underline" onClick={() => p.select({ kind: "goal", id: g.id })}>
              {OWNER_LABEL[g.owner_id]} {g.version}: {g.objective}
            </button>
          ) : (
            "Unknown"
          )}
        </Row>
        {w.proposed_workstream && <Row label="Suggested next work">{w.proposed_workstream}</Row>}
      </Section>
    </>
  );
}

function SimPanel({ p, r }: { p: ViewProps; r: SimulationRun }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold text-zinc-900">{planName(r.plan_id)}</h2>
        <StateBadge state={r.verdict} />
        <Badge tone="neutral" icon={false}>
          {SCENARIO[r.scenario] ?? r.scenario}
        </Badge>
      </div>
      <p className="mb-4 text-[14px] text-zinc-600">
        Practice test (Sparta sandbox) on sample tickets. A pass only covers these checks. It doesn&apos;t predict the launch or any business result.
      </p>
      <Section title="Independent checks">
        <ul className="space-y-1.5">
          {r.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[15px] leading-snug">
              <span className={`mt-0.5 font-bold ${c.passed ? "text-emerald-700" : "text-red-700"}`} aria-label={c.passed ? "passed" : "failed"}>
                {c.passed ? "✓" : "✕"}
              </span>
              <span>
                {c.label}
                {c.detail && <span className="block text-[13px] text-zinc-500">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      {r.protected_records.length > 0 && (
        <Section title="Records that must not be touched">
          <ul className="space-y-1 text-[15px]">
            {r.protected_records.map((pr) => (
              <li key={pr.ticket_id} className="flex items-center gap-2">
                <span>{pr.ticket_id === "1" ? "The critical security ticket (#1)" : `Ticket #${pr.ticket_id}`}</span>
                {pr.unchanged ? <Badge tone="neutral">Untouched</Badge> : <Badge tone="red">Changed</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Button kind="secondary" onClick={() => p.go("evidence")}>
        Open Evidence
      </Button>
    </>
  );
}

function ProposalPanel({ p, pr }: { p: ViewProps; pr: Proposal }) {
  const g = goalById(p.s, pr.target_goal_id);
  const counter = pr.counter_versions.at(-1);
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold text-zinc-900">Proposal</h2>
        <StateBadge state={pr.state} />
        <StateBadge state={pr.test_status} />
      </div>
      <p className="mb-4 text-[14px] text-zinc-600">
        {OWNER_LABEL[pr.proposing_owner]} → {OWNER_LABEL[pr.recipient_owner]}
      </p>
      <Section title="What would change">
        <Row label="Goal">
          {g ? `${OWNER_LABEL[g.owner_id]} ` : ""}
          {pr.target_goal_version}
        </Row>
        <Row label="Proposed new target">{pr.proposed_measure_text}</Row>
        {counter && (
          <Row label={`Latest changes from ${OWNER_LABEL[counter.by]} (${counter.version})`}>
            {counter.proposed_measure_text}
            {counter.changes_plan && <div className="mt-1 text-[13px] text-amber-800">Needs a new test: these changes alter how the agent works.</div>}
          </Row>
        )}
        <Row label="Plan">{planName(pr.plan_ref.plan_id)}</Row>
        <Row label="Test results">{pr.simulation_refs.length} attached</Row>
      </Section>
      <Button kind="secondary" onClick={() => p.go("proposals")}>
        Open in Proposals
      </Button>
    </>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="flex items-start gap-2 text-[15px] text-zinc-700">
      <StateBadge state="UNKNOWN" /> <span>{WHAT[what] ?? what} wasn&apos;t found, or you can&apos;t see it.</span>
    </div>
  );
}

export function Inspector(props: ViewProps) {
  const { s } = props;
  const fallbackGoal = [...s.goals].reverse().find((g) => g.owner_id === "ceo" && !s.goals.some((x) => x.supersedes === g.id));
  const sel =
    props.selection ??
    (s.relations.some((r) => r.id === DEFAULT_RELATION)
      ? { kind: "relation" as const, id: DEFAULT_RELATION }
      : { kind: "goal" as const, id: fallbackGoal?.id ?? "" });

  let body: ReactNode;
  switch (sel.kind) {
    case "goal": {
      const g = goalById(s, sel.id);
      body = g ? <GoalPanel p={props} g={g} /> : <Missing what="Goal" />;
      break;
    }
    case "relation": {
      const r = s.relations.find((x) => x.id === sel.id);
      body = r ? <RelationPanel p={props} r={r} /> : <Missing what="Relation" />;
      break;
    }
    case "work": {
      const w = s.work_items.find((x) => x.id === sel.id);
      body = w ? <WorkPanel p={props} w={w} /> : <Missing what="Work item" />;
      break;
    }
    case "sim": {
      const r = s.simulations.find((x) => x.id === sel.id);
      body = r ? <SimPanel p={props} r={r} /> : <Missing what="Simulation run" />;
      break;
    }
    case "proposal": {
      const pr = s.proposals.find((x) => x.id === sel.id);
      body = pr ? <ProposalPanel p={props} pr={pr} /> : <Missing what="Proposal" />;
      break;
    }
  }

  return (
    <div className="text-[16px]">
      <div className="mb-3 al-lbl">Details</div>
      {body}
      
    </div>
  );
}
