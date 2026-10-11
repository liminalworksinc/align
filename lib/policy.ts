import type { AppState } from "./types";
import { currentGoals } from "./registry";

export interface AcceptedPlan {
  team: "security";
  goal_id: string;
  goal_version: string;
  plan: string; // plan_id@version
  plan_hash: string;
  authority: string; // who ratified / pushed, in words
  ratified_at: string | null;
  test_status: string | null;
}

/** Which plan the Security team's agents are authorized to run right now. Latest ratified acceptance wins; otherwise the v1 goal's plan. */
export function acceptedPlan(s: AppState): AcceptedPlan {
  const goal = currentGoals(s).find((g) => g.owner_id === "security");
  const acc = s.acceptances.at(-1);
  if (acc && goal && acc.new_goal_id === goal.id) {
    const ref = `${acc.plan_ref.plan_id}@${acc.plan_ref.plan_version}`;
    return {
      team: "security",
      goal_id: goal.id,
      goal_version: goal.version,
      plan: ref,
      plan_hash: acc.plan_ref.plan_hash,
      authority: `ratified by ${goal.owner_name}`,
      ratified_at: acc.ratified_at,
      test_status: acc.test_status,
    };
  }
  const base = s.plans.find((p) => p.plan_id === "p-throughput" && p.plan_version === 1);
  return {
    team: "security",
    goal_id: goal?.id ?? "g-security-v1",
    goal_version: goal?.version ?? "v1",
    plan: "p-throughput@1",
    plan_hash: base?.hash ?? "",
    authority: "current approved goal (no change ratified)",
    ratified_at: goal?.approved_at ?? null,
    test_status: null,
  };
}
