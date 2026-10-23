"use client";
import { useEffect, useRef, useState } from "react";
import { labelsFor } from "@/lib/labels";
import type { SimulationRun } from "@/lib/types";
import { TICKET_LABEL, fieldWords, useEvidence } from "../EvidenceView";
import type { ViewProps } from "../props";
import { comparablePair } from "../select";
import { checkWords } from "../SpartaProof";
import { Button } from "../ui";
import { CARD, Check, H1, Lbl, NotBuilt, Pill, Seg, Skeleton } from "./kit";

// v6 "Scenario Studio" (Northstar only). It compares sandbox runs that are already recorded in state: the current plan
// against the new plan, same mission, seed and checks. It never starts a run and never shows a result that isn't in
// state. Custom scenarios have no sandbox, so they get an honest "not sandbox-tested" state instead.

type Cand = "normal" | "interruption";
const planLabel = (r: SimulationRun) => `${r.plan_id}@${r.plan_version}`;
const passed = (r: SimulationRun) => r.checks.filter((c) => c.passed).length;

/** What the run did to the tickets, from its recorded changed and protected records. */
function RunSummary({ r }: { r: SimulationRun }) {
  const hit = r.protected_records.filter((p) => !p.unchanged);
  return (
    <div className="text-[14px] text-zinc-700">
      {r.changed_records.length === 0
        ? "The agent changed no tickets. "
        : r.changed_records.map((c) => `Ticket #${c.ticket_id}${TICKET_LABEL[c.ticket_id] ? ` (${TICKET_LABEL[c.ticket_id]})` : ""}: ${c.fields.length ? fieldWords(c.fields) : "nothing we track"}. `)}
      {r.scenario === "interruption" && "The ticket system was made to fail mid-run. "}
      {hit.length > 0 ? (
        <b className="text-red-700">Changed protected ticket {hit.map((p) => `#${p.ticket_id}`).join(", ")}.</b>
      ) : (
        r.protected_records.length > 0 && <span>Protected ticket {r.protected_records.map((p) => `#${p.ticket_id}`).join(", ")} untouched.</span>
      )}
    </div>
  );
}

function ResultCard({ r }: { r: SimulationRun }) {
  const fail = r.verdict === "FAIL";
  return (
    <div className={`${CARD} flex flex-col gap-2.5 p-[18px] ${fail ? "!border-red-700" : "!border-emerald-700"}`}>
      <div className="flex items-center justify-between gap-2">
        <b className="font-mono text-[14px] text-zinc-900">
          {planLabel(r)}
          {r.scenario === "interruption" ? " · interruption" : ""}
        </b>
        <Pill tone={fail ? "red" : "mint"}>
          {r.verdict} · {passed(r)} / {r.checks.length}
        </Pill>
      </div>
      <RunSummary r={r} />
      {r.checks.length ? (
        r.checks.map((c) => (
          <Check key={c.id} kind={c.passed ? "ok" : "bad"}>
            {checkWords(c.id, c.label)}
          </Check>
        ))
      ) : (
        <p className="text-[14px] text-zinc-500">No checks recorded for this test run.</p>
      )}
    </div>
  );
}

export function ScenarioStudio(props: ViewProps) {
  const { s, me, mark } = props;
  const L = labelsFor(s);
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || !L.northstar) return;
    marked.current = true;
    mark("scenario_reviewed");
  }, [mark, L.northstar]);

  const { baseline, candidate, interruption } = comparablePair(s);
  const [cand, setCand] = useState<Cand>("normal");
  const chosen = cand === "interruption" ? interruption : candidate;
  // Loading the chosen run's recorded evidence is the only wait; the skeleton covers exactly that fetch.
  const ev = useEvidence(chosen?.id);
  const loading = !!chosen && ev?.status === "loading";

  if (!L.northstar)
    return (
      <div className="flex max-w-[1000px] flex-col gap-[18px]">
        <H1 sub="Compares two plans on the same practice set when a scenario has a sandbox.">Scenario Studio</H1>
        <NotBuilt title="No sandbox in this scenario">
          Not sandbox-tested. Plans here are compared by the two teams, in the proposal. Approving one says so explicitly.
        </NotBuilt>
      </div>
    );

  const same =
    baseline && chosen && baseline.mission_id === chosen.mission_id && baseline.seed_version === chosen.seed_version && baseline.checks_version === chosen.checks_version;
  const isProduct = me.actor === "product";
  const attachedNow = !!candidate && !!props.attached?.simulation_refs.includes(candidate.id);
  const attach = () => {
    if (!candidate) return;
    props.setAttached({
      plan_id: candidate.plan_id,
      plan_version: candidate.plan_version,
      simulation_refs: [baseline?.id, candidate.id, interruption?.id].filter((x): x is string => Boolean(x)),
    });
    props.go("proposals");
  };

  return (
    <div className="flex max-w-[1000px] flex-col gap-[18px]">
      <H1 sub="Two plans run against the same Sparta mission, seed and checks. Only the plan differs.">Scenario Studio</H1>

      <div className={`${CARD} grid grid-cols-[1fr_1fr_auto] items-end gap-4 px-[18px] py-4`}>
        <div className="flex flex-col gap-1.5">
          <Lbl>Baseline</Lbl>
          <Seg
            label="Baseline plan"
            value="base"
            options={[{ id: "base", label: baseline ? `${planLabel(baseline)} · current` : "No current-plan run yet" }]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Lbl>Candidate</Lbl>
          <Seg
            label="Candidate plan"
            value={cand}
            onChange={(v) => setCand(v)}
            options={[
              { id: "normal", label: candidate ? planLabel(candidate) : "p-beta@1", disabled: candidate ? undefined : "No run of the new plan is recorded yet" },
              {
                id: "interruption",
                label: `${interruption ? planLabel(interruption) : "p-beta@1"} + interruption`,
                disabled: interruption ? undefined : "No outage-test run is recorded yet",
              },
            ]}
          />
        </div>
        <span className="max-w-[220px] text-[12.5px] text-zinc-500">Shows recorded runs. An engineer starts new ones from the project.</span>
      </div>

      {!baseline || !chosen ? (
        <NotBuilt title="Nothing to compare yet">
          An engineer starts each run from the project (scripts/run-plan.sh). Recorded runs show up here on their own.
        </NotBuilt>
      ) : loading ? (
        <div className={`${CARD} flex flex-col gap-2.5 p-[18px]`} role="status">
          <span className="text-[14px] text-zinc-500">Loading the recorded runs…</span>
          <Skeleton width="70%" />
          <Skeleton width="45%" />
        </div>
      ) : (
        <>
          {!same && <Pill tone="amber">These runs didn&apos;t use the same tickets and checks, so they can&apos;t be compared</Pill>}
          <div className="al-in grid grid-cols-2 gap-3.5">
            <ResultCard r={baseline} />
            <ResultCard r={chosen} />
          </div>
          {ev?.status === "error" && <p className="text-[14px] text-amber-700">Couldn&apos;t load the rest of this run&apos;s details.</p>}
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        <span className="min-w-0 flex-1 text-[13.5px] text-zinc-500">
          Tests ticket behaviour in a sandbox. Not company ROI; does not verify beta readiness. Evidence is unsigned and reproducible.
        </span>
        <Button
          kind="secondary"
          disabled={!chosen}
          onClick={() => {
            if (chosen) props.select({ kind: "sim", id: chosen.id });
            props.go("evidence");
          }}
        >
          Run details
        </Button>
        {isProduct && (
          <Button onClick={attach} disabled={!candidate}>
            {attachedNow ? "Attached · go to proposal" : "Attach to proposal"}
          </Button>
        )}
      </div>
    </div>
  );
}
