import type { AppState } from "./types";
import { currentGoals } from "./registry";
import { poss, scenarioOf, teamOf } from "./labels";

export interface AcceptedPlan {
  team: string; // Northstar: "security"; a custom scenario: the owning team's name
  goal_id: string;
  goal_version: string;
  plan: string; // plan_id@version
  plan_hash: string;
  authority: string; // who ratified / pushed, in words
  ratified_at: string | null;
  test_status: string | null;
  agreement?: CustomAgreement; // custom scenarios only, appended last so Northstar's output keeps its keys and order
}

/** A custom scenario's plan is inline text with no run command: the agreement itself is what an agent reads. */
export interface CustomAgreement {
  company: string;
  asking_team: string;
  owning_team: string;
  status: "agreed" | "not_agreed";
  launch: "pending" | "not_applicable"; // an agreement is never approval to launch (P1 item 3)
  plan_title: string;
  plan_text: string;
  owning_measures: string[]; // the owning team's current measures (the agreed version once approved)
  agreed_measure: string | null;
  conditions: string | null;
  asking_commitment: string | null;
}

function customPlan(s: AppState): AcceptedPlan {
  const goal = currentGoals(s).find((g) => g.owner_id === "security");
  const plan = s.plans[0];
  const acc = s.acceptances.at(-1);
  const agreed = !!acc && !!goal && acc.new_goal_id === goal.id;
  const prop = agreed ? s.proposals.find((p) => p.id === acc.proposal_id) : undefined;
  const last = prop?.counter_versions.at(-1);
  return {
    team: teamOf(s, "security"),
    goal_id: goal?.id ?? "g-security-v1",
    goal_version: goal?.version ?? "v1",
    plan: agreed ? `${acc.plan_ref.plan_id}@${acc.plan_ref.plan_version}` : "none",
    plan_hash: agreed ? acc.plan_ref.plan_hash : "",
    authority: agreed
      ? `agreed by ${goal.owner_name} for ${teamOf(s, "security")}`
      : `no change agreed: ${poss(teamOf(s, "security"))} current goal stands`,
    ratified_at: agreed ? acc.ratified_at : (goal?.approved_at ?? null),
    test_status: agreed ? acc.test_status : null,
    agreement: {
      company: s.company,
      asking_team: teamOf(s, "product"),
      owning_team: teamOf(s, "security"),
      status: agreed ? "agreed" : "not_agreed",
      launch: agreed ? "pending" : "not_applicable",
      plan_title: plan?.title ?? "The proposed plan",
      plan_text: last?.plan_text ?? plan?.text ?? "", // a counter's revised plan text wins once agreed
      owning_measures: (goal?.measures ?? []).map((m) => m.text),
      agreed_measure: prop ? (last?.proposed_measure_text ?? prop.proposed_measure_text) : null,
      conditions: last?.conditions ?? null,
      asking_commitment: prop?.reciprocal_commitment || null,
    },
  };
}

/** Which plan the Security team's agents are authorized to run right now. Latest ratified acceptance wins; otherwise the v1 goal's plan. */
export function acceptedPlan(s: AppState): AcceptedPlan {
  if (scenarioOf(s) === "custom") return customPlan(s);
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
