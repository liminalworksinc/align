"use client";
import { useState } from "react";
import type { SimulationRun } from "@/lib/types";
import { Badge, Button } from "./ui";
import { Pill } from "./v6/kit";

/** Plain words for each Sparta check, keyed by check id (with or without the "assertion:" prefix). */
const CHECK_WORDS: Record<string, string> = {
  "beta-priority": "Beta issue marked urgent",
  "beta-tag": "Beta issue tagged as beta",
  "beta-tag-preserved": "Customer's existing tag kept",
  "beta-open": "Beta issue left open",
  "beta-comment-count": "Exactly one note and one reply added",
  "beta-private-note": "Engineer note kept private",
  "beta-public-ack": "Customer gets a public reply",
  "protected-p0": "Critical security ticket left untouched",
  scope: "No other tickets changed",
};
const checkKey = (id: string) => id.replace(/^assertion:/, "");
export const checkWords = (id: string, fallback: string) => CHECK_WORDS[checkKey(id)] ?? fallback;

const PLAN_SHORT: Record<string, string> = { "p-throughput": "Current plan", "p-beta": "New plan" };
const PLAN_HOW: Record<string, string> = { "p-throughput": "Oldest tickets first", "p-beta": "Beta issues first" };

/** Pick the comparable runs: the failing baseline, the passing candidate, and the outage run. */
export function pickRuns(runs: SimulationRun[]) {
  const baseline = runs.find((r) => r.plan_id === "p-throughput" && r.scenario === "normal");
  const candidate = runs.find((r) => r.plan_id === "p-beta" && r.scenario === "normal");
  const outage = runs.find((r) => r.plan_id === "p-beta" && r.scenario === "interruption");
  return { baseline, candidate, outage };
}

function passed(r: SimulationRun) {
  return r.checks.filter((c) => c.passed).length;
}

function Cell({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return <span className="text-zinc-400">—</span>;
  // Red marks a real failed check. Passing checks stay neutral; green is reserved for the narrow verified outcome.
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-zinc-800">
      <span aria-hidden>●</span> Passed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
      <span aria-hidden>✕</span> Failed
    </span>
  );
}

function ScoreBar({ r }: { r: SimulationRun }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {r.checks.map((c) => (
        <span key={c.id} className={`h-2.5 w-4 rounded-sm ${c.passed ? "bg-zinc-700" : "bg-red-600"}`} />
      ))}
    </div>
  );
}

function PlanTile({ r }: { r: SimulationRun }) {
  const fail = r.verdict === "FAIL";
  return (
    <div className={`rounded-[14px] border bg-white p-[18px] ${fail ? "border-red-700" : "border-emerald-700"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">{PLAN_SHORT[r.plan_id] ?? r.plan_id}</div>
          <div className="text-[17px] font-semibold text-zinc-900">{PLAN_HOW[r.plan_id] ?? r.plan_id}</div>
        </div>
        <Pill tone={fail ? "red" : "mint"}>
          {r.verdict} · {passed(r)} / {r.checks.length}
        </Pill>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-[32px] font-bold leading-none ${fail ? "text-red-700" : "text-zinc-900"}`}>{passed(r)}</span>
        <span className="text-[16px] text-zinc-600">of {r.checks.length} checks passed</span>
      </div>
      <div className="mt-2">
        <ScoreBar r={r} />
      </div>
    </div>
  );
}

/**
 * The Sparta proof, readable on a projector: the same practice tickets and the same checks,
 * run under the current plan and the new plan, compared check by check.
 */
export function SpartaProof({ runs, onOpenTest }: { runs: SimulationRun[]; onOpenTest?: () => void }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const { baseline, candidate, outage } = pickRuns(runs);
  if (!baseline && !candidate) return <p className="text-[16px] text-zinc-500">No Sparta test runs attached yet.</p>;

  const cols = [baseline, candidate, outage].filter(Boolean) as SimulationRun[];
  const ids = (candidate ?? baseline)!.checks.map((c) => c.id);
  const result = (r: SimulationRun, id: string) => r.checks.find((c) => c.id === id)?.passed;
  const rows = ids.filter((id) => !onlyDiff || new Set(cols.map((r) => result(r, id))).size > 1);
  const label = (id: string) => checkWords(id, (candidate ?? baseline)!.checks.find((c) => c.id === id)?.label ?? id);

  const same =
    baseline &&
    candidate &&
    baseline.mission_id === candidate.mission_id &&
    baseline.seed_version === candidate.seed_version &&
    baseline.checks_version === candidate.checks_version;
  const p0Hit = baseline && result(baseline, ids.find((i) => checkKey(i) === "protected-p0") ?? "") === false;
  const p0Safe = candidate && result(candidate, ids.find((i) => checkKey(i) === "protected-p0") ?? "") === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[15px] text-zinc-700">
        <span className="font-semibold text-zinc-900">Tested in Sparta Worlds</span>
        {same ? (
          <>
            <Badge tone="neutral">Same 4 practice tickets</Badge>
            <Badge tone="neutral">Same {ids.length} checks</Badge>
            <Badge tone="violet">Only the plan changes</Badge>
          </>
        ) : (
          <Badge tone="amber">These runs didn&apos;t use the same tickets and checks, so they can&apos;t be compared</Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {baseline && <PlanTile r={baseline} />}
        {candidate && <PlanTile r={candidate} />}
      </div>

      {(p0Hit || p0Safe) && (
        <ul className="space-y-1.5 rounded-[14px] border border-zinc-200 bg-zinc-50 p-4 text-[15px]">
          {p0Hit && (
            <li className="flex gap-2">
              <span aria-hidden className="text-red-700">✕</span>
              <span>
                <strong>The current plan posted a public reply on the critical security ticket</strong> and still reported the job as done.
              </span>
            </li>
          )}
          {p0Safe && (
            <li className="flex gap-2">
              <span aria-hidden>●</span>
              <span>The new plan handled the beta issue the way the CEO now requires and left the critical ticket alone.</span>
            </li>
          )}
          {outage && (
            <li className="flex gap-2">
              <span aria-hidden>●</span>
              <span>
                Outage test: Sparta made the ticket system fail mid-run. The new plan retried and still passed {passed(outage)} of {outage.checks.length}.
              </span>
            </li>
          )}
        </ul>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="al-lbl">Check by check</h4>
          <label className="flex items-center gap-2 text-[14px] text-zinc-700">
            <input type="checkbox" className="size-4 accent-violet-700" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            Only show checks where the plans differ
          </label>
        </div>
        <div className="overflow-x-auto rounded-[14px] border border-zinc-200">
          <table className="w-full text-left text-[15px]">
            <thead className="bg-zinc-50 text-[13px] text-zinc-600">
              <tr>
                <th className="px-3 py-2 font-semibold">What Sparta checked</th>
                {cols.map((r) => (
                  <th key={r.id} className="px-3 py-2 font-semibold">
                    {r.scenario === "interruption" ? "New plan, outage test" : (PLAN_SHORT[r.plan_id] ?? r.plan_id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => (
                <tr key={id} className={`border-t border-zinc-200 ${checkKey(id) === "protected-p0" ? "bg-amber-50/60" : "bg-white"}`}>
                  <td className="px-3 py-2 text-zinc-900">{label(id)}</td>
                  {cols.map((r) => (
                    <td key={r.id} className="px-3 py-2">
                      <Cell ok={result(r, id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-zinc-600">A sandbox test of how the agent handles practice tickets. It doesn&apos;t prove the beta launch is ready.</p>
        {onOpenTest && (
          <Button kind="secondary" onClick={onOpenTest}>
            See what the agent did, step by step
          </Button>
        )}
      </div>
    </div>
  );
}
