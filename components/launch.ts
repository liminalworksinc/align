import { decisionMeasureId, type Labels } from "@/lib/labels";
import type { Acceptance, StateView } from "@/lib/types";

// Shared by leadership's Company goal screen and the teams' decision record (custom scenarios only).

/** The record's launch line: leadership's decision once made, otherwise that the agreement is not a launch approval. */
export function launchLine(acc: Acceptance, L: Labels): string {
  const d = acc.launch_decision;
  if (d?.decision === "approved") return `Launch: approved by ${L.person.leadership}`;
  if (d?.decision === "not_yet") return "Launch: not yet";
  return "This records what the two teams agreed. It is not approval to launch.";
}

/** The approved target and the owning team's conditions (its conditions field, else its reason for asking for changes). */
export function recordFacts(s: StateView, acc: Acceptance) {
  const goal = s.goals.find((g) => g.id === acc.new_goal_id);
  const target = goal?.measures.find((m) => m.id === decisionMeasureId(s, acc))?.text ?? goal?.objective ?? "";
  const lastCounter = s.proposals.find((p) => p.id === acc.proposal_id)?.counter_versions.at(-1);
  return { target, conditions: lastCounter?.conditions || lastCounter?.rationale || "" };
}
