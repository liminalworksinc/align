import type { Goal, SimulationRun, StateView } from "@/lib/types";

export function currentGoal(s: StateView, owner: "ceo" | "product" | "security"): Goal | undefined {
  const all = s.goals.filter((g) => g.owner_id === owner);
  const superseded = new Set(all.map((g) => g.supersedes).filter(Boolean));
  return all.find((g) => !superseded.has(g.id));
}

export function priorVersion(s: StateView, g: Goal | undefined) {
  return g?.supersedes ? s.goals.find((x) => x.id === g.supersedes) : undefined;
}

export function activeProposal(s: StateView) {
  return [...s.proposals].reverse().find((p) => p.state !== "REJECTED") ?? null;
}

/** Latest baseline and candidate runs (normal scenario) that share mission, seed and checks. Latest regardless of verdict: no cherry-picking a PASS. */
export function comparablePair(s: StateView): { baseline?: SimulationRun; candidate?: SimulationRun; interruption?: SimulationRun } {
  const latest = (pred: (r: SimulationRun) => boolean) => [...s.simulations].reverse().find(pred);
  const candidate = latest((r) => r.plan_id === "p-beta" && r.scenario === "normal");
  const baseline = latest(
    (r) =>
      r.plan_id === "p-throughput" &&
      r.scenario === "normal" &&
      (!candidate || (r.mission_id === candidate.mission_id && r.seed_version === candidate.seed_version && r.checks_version === candidate.checks_version)),
  );
  const interruption = latest((r) => r.plan_id === "p-beta" && r.scenario === "interruption");
  return { baseline, candidate, interruption };
}

/** Every ingested run for a plan, e.g. "p-beta@1: 3/3 PASS". */
export function tally(s: StateView, planId: string, scenario?: SimulationRun["scenario"]) {
  const runs = s.simulations.filter((r) => r.plan_id === planId && (!scenario || r.scenario === scenario));
  return { pass: runs.filter((r) => r.verdict === "PASS").length, total: runs.length };
}

export function accepted(s: StateView) {
  return s.acceptances.at(-1) ?? null;
}
