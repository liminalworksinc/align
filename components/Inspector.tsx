"use client";
import type { ReactNode } from "react";
import type { Goal, GoalRelation, Proposal, SimulationRun, StateView, WorkItem } from "@/lib/types";
import type { ViewProps } from "./props";
import { Badge, Button, Mono, OWNER_LABEL, Section, StateBadge, fmtTime } from "./ui";
import { accepted, currentGoal, priorVersion } from "./select";

const DEFAULT_RELATION = "r-product-security";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-zinc-100 py-2 last:border-b-0">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
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
  const edit = isCeo ? "Inherited · read-only" : isMine ? "Yours · editable" : "Shared · read-only";
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
        {!isCurrent && <Badge tone="neutral">Superseded</Badge>}
      </div>
      <p className="mb-4 text-[18px] font-semibold leading-snug text-zinc-900">{g.objective}</p>
      <Section title="Goal">
        <Row label="Owner">{OWNER_LABEL[g.owner_id] ?? g.owner_name}</Row>
        <Row label="Version">
          {g.version}
          {prior && (
            <span className="text-zinc-500">
              {" "}
              (prior: {prior.version}, <Mono>{prior.id}</Mono> kept)
            </span>
          )}
        </Row>
        <Row label="Kind">{g.kind}</Row>
        <Row label="Edit state">
          <Badge tone={isMine ? "violet" : "neutral"} icon={false}>
            {edit}
          </Badge>
        </Row>
        {g.kind === "team" && kr2 && (
          <Row label="Inherited acceptance criterion (CEO KR2)">
            <span className="text-zinc-800">{kr2.text}</span>
          </Row>
        )}
      </Section>
      <Section title="Measures">
        <ul className="space-y-2">
          {g.measures.map((m) => (
            <li key={m.id} className="rounded-lg bg-zinc-50 p-2.5 text-[15px] leading-snug ring-1 ring-zinc-200">
              <div className="mb-1 flex items-center gap-2">
                <Mono>{m.id}</Mono>
                {m.inherited_from && <span className="text-[13px] text-zinc-500">from {m.inherited_from}</span>}
                <span className="ml-auto text-[12px] text-zinc-500">verifiable by: {m.verifiable_by}</span>
              </div>
              {m.text}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Sources">
        <div className="space-y-2 text-[15px]">
          <div className="flex items-start gap-2">
            <StateBadge state="OBSERVED" />
            <span>
              Approved by {OWNER_LABEL[g.approved_by] ?? g.approved_by} at {fmtTime(g.approved_at)} ({g.approved_at.slice(0, 10)})
            </span>
          </div>
          {g.owner_id === "security" && me.actor === "product" && (
            <div className="flex items-start gap-2">
              <StateBadge state="UNKNOWN" />
              <span>Security capacity: UNKNOWN (not shared)</span>
            </div>
          )}
          {g.owner_id === "product" && me.actor === "security" && (
            <div className="flex items-start gap-2">
              <StateBadge state="UNKNOWN" />
              <span>Product beta scope list: UNKNOWN (not shared)</span>
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
            View source
          </Button>
        ) : isMine ? (
          <Button onClick={() => p.openDrawer("brief")}>Review priorities</Button>
        ) : (
          <Button onClick={() => p.go("proposals")}>Propose goal change</Button>
        )}
      </div>
    </>
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
        <h2 className="text-[20px] font-bold text-zinc-900">{isConflict ? "Cross-team dependency" : "Goal relation"}</h2>
        <StateBadge state={r.status} />
      </div>
      <p className="mb-4 text-[16px] leading-snug text-zinc-800">{r.label}</p>
      <div className="mb-4 text-[14px] text-zinc-600">
        {src ? `${OWNER_LABEL[src.owner_id]} ${src.version}` : r.source_goal} <span className="text-zinc-400">{r.type.replace("_", " ")}</span>{" "}
        {tgt ? `${OWNER_LABEL[tgt.owner_id]} ${tgt.version}` : r.target_goal}
      </div>

      {isConflict && (
        <Section title="Conflict">
          <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
            <ConflictRow label={`Old Security measure${orig ? ` (${orig.version}, S-M1)` : ""}`} tone="amber">
              {oldMeasure?.text ?? "UNKNOWN"}
            </ConflictRow>
            <ConflictRow label="New CEO measure (KR2)" tone="neutral">
              {kr2?.text ?? "UNKNOWN"}
            </ConflictRow>
            <ConflictRow label="Protected constraint (S-M2)" tone="neutral">
              P0 non-beta incidents and their private notes
              {protectedMeasure && <div className="mt-1 text-[13px] text-zinc-500">S-M2: {protectedMeasure.text}</div>}
            </ConflictRow>
            <ConflictRow label="Consequence" tone="amber">
              Beta incidents get triaged as generic tickets; KR2 cannot be met without changing Security&apos;s measure.
            </ConflictRow>
          </div>
        </Section>
      )}

      <Section title="Provenance">
        <div className="flex items-start gap-2 text-[15px] leading-snug text-zinc-700">
          <StateBadge state="OBSERVED" />
          <span>{r.provenance}</span>
        </div>
      </Section>

      {acc && (
        <Section title="Accepted record">
          <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <Row label="Accepted version">
              Security {acc.accepted_version} <Mono>{acc.new_goal_id}</Mono>
            </Row>
            <Row label="Ratified">
              {OWNER_LABEL[acc.ratified_by]} · {fmtTime(acc.ratified_at)}
            </Row>
            <Row label="Acknowledged">
              {OWNER_LABEL[acc.acknowledged_by]} · {acc.acknowledged_via === "authored_in_proposal" ? "commitment written in its proposal, " : ""}{fmtTime(acc.acknowledged_at)}
            </Row>
            <Row label="Next work">{acc.next_work}</Row>
            <Row label="Plan">
              <Mono>
                {acc.plan_ref.plan_id}@{acc.plan_ref.plan_version}
              </Mono>
            </Row>
            <Row label="Test status">
              <StateBadge state={acc.test_status} />
            </Row>
            <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[14px] font-semibold text-amber-900 ring-1 ring-amber-300">
              Company beta readiness: NOT verified by this test.
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
          Review priorities
        </Button>
      )}
    </>
  );
}

function ConflictRow({ label, tone, children }: { label: string; tone: "amber" | "neutral"; children: ReactNode }) {
  return (
    <div className={`border-b border-zinc-200 px-3 py-2.5 last:border-b-0 ${tone === "amber" ? "bg-amber-50/60" : "bg-white"}`}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

function WorkPanel({ p, w }: { p: ViewProps; w: WorkItem }) {
  const g = goalById(p.s, w.goal_id);
  return (
    <>
      <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-500">Work item</h2>
      <p className="mb-4 text-[18px] font-semibold leading-snug text-zinc-900">{w.task}</p>
      <Section title="Details">
        <Row label="Owner">{OWNER_LABEL[w.owner] ?? w.owner}</Row>
        <Row label="Source">{w.source}</Row>
        <Row label="Observed status">
          <span className="inline-flex items-center gap-2">
            <StateBadge state="OBSERVED" /> {w.observed_status}
          </span>
        </Row>
        <Row label="Priority rank">#{w.priority_rank}</Row>
        <Row label="Goal">
          {g ? (
            <button className="text-left text-violet-800 underline-offset-2 hover:underline" onClick={() => p.select({ kind: "goal", id: g.id })}>
              {OWNER_LABEL[g.owner_id]} {g.version}: {g.objective}
            </button>
          ) : (
            <Mono>{w.goal_id}</Mono>
          )}
        </Row>
        {w.proposed_workstream && <Row label="Proposed workstream">{w.proposed_workstream}</Row>}
        {w.decision_ref && (
          <Row label="Decision ref">
            <Mono>{w.decision_ref}</Mono>
          </Row>
        )}
      </Section>
    </>
  );
}

function SimPanel({ p, r }: { p: ViewProps; r: SimulationRun }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold text-zinc-900">
          <Mono>
            {r.plan_id}@{r.plan_version}
          </Mono>
        </h2>
        <StateBadge state={r.verdict} />
        <Badge tone="neutral" icon={false}>
          {r.scenario}
        </Badge>
      </div>
      <p className="mb-4 text-[14px] text-zinc-600">Sparta check in a sandbox ticket world. A PASS covers these checks only.</p>
      <Section title="Run">
        <Row label="Mission">
          <Mono>{r.mission_id}</Mono>
        </Row>
        <Row label="Seed / checks version">
          <Mono>{r.seed_version}</Mono> / <Mono>{r.checks_version}</Mono>
        </Row>
        <Row label="Exit code">
          <Mono>{r.exit_code}</Mono>
        </Row>
        <Row label="Report">
          <span className="break-all text-[14px]">
            <Mono>{r.report_path}</Mono>
          </span>
          <div className="mt-1 text-[13px] text-zinc-500">
            sha256 <Mono>{r.report_sha256.slice(0, 12)}</Mono>
          </div>
        </Row>
      </Section>
      <Section title="Checks">
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
        <Section title="Protected records">
          <ul className="space-y-1 text-[15px]">
            {r.protected_records.map((pr) => (
              <li key={pr.ticket_id} className="flex items-center gap-2">
                <Mono>{pr.ticket_id}</Mono>
                {pr.unchanged ? <Badge tone="neutral">unchanged</Badge> : <Badge tone="red">changed</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Button kind="secondary" onClick={() => p.go("evidence")}>
        Open evidence
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
      <Section title="Target">
        <Row label="Goal">
          {g ? `${OWNER_LABEL[g.owner_id]} ` : ""}
          {pr.target_goal_version} <Mono>{pr.target_goal_id}</Mono>
        </Row>
        <Row label="Proposed measure">{pr.proposed_measure_text}</Row>
        {counter && (
          <Row label={`Latest counter (${counter.version}, ${OWNER_LABEL[counter.by]})`}>
            {counter.proposed_measure_text}
            {counter.changes_plan && <div className="mt-1 text-[13px] text-amber-800">Changes the executable plan; prior test is stale.</div>}
          </Row>
        )}
        <Row label="Plan">
          <Mono>
            {pr.plan_ref.plan_id}@{pr.plan_ref.plan_version}
          </Mono>
        </Row>
        <Row label="Simulation refs">{pr.simulation_refs.length} attached</Row>
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
      <StateBadge state="UNKNOWN" /> <span>{what} not found or not visible to you.</span>
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
      <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-zinc-500">Inspector</div>
      {body}
      
    </div>
  );
}
