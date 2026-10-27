import { agreedStatus, decisionMeasureId, type Labels } from "@/lib/labels";
import type { Acceptance, StateView } from "@/lib/types";

// Shared by leadership's Company goal screen and the teams' decision record (custom scenarios only).

/** Custom: leadership's launch call as one word. No decision yet, or "not yet", both mean launch is still pending. */
export function launchState(acc: Acceptance | null | undefined): "approved" | "pending" {
  return acc?.launch_decision?.decision === "approved" ? "approved" : "pending";
}

/** Custom: the agreement status wherever it's shown, so no screen reads as final before leadership decides the launch. */
export function agreementStatus(acc: Acceptance | null | undefined): string {
  return agreedStatus(launchState(acc) === "approved"); // the one wording, lib/labels.ts
}

/** Custom: what happens next, as the record states it. Until leadership approves the launch the work waits on that
 *  decision, so the stored next step ("<owning> works to goal …") is shown as what follows it, never as a go. */
export function nextWorkLine(acc: Acceptance, L: Labels): string {
  if (launchState(acc) === "approved") return acc.next_work;
  return `Waits for ${L.person.leadership}'s launch decision. Then: ${acc.next_work}`;
}

/** The record's launch line: leadership's decision once made, otherwise that the agreement is not a launch approval. */
export function launchLine(acc: Acceptance, L: Labels): string {
  const d = acc.launch_decision;
  if (d?.decision === "approved") return `Launch: approved by ${L.person.leadership}${d.untested ? ", without a sandbox test" : ""}`;
  if (d?.decision === "not_yet") return "Launch: not yet";
  return "This records what the two teams agreed. It is not approval to launch.";
}

/** The approved target and the owning team's conditions (its conditions field only; its reason is not a condition). */
export function recordFacts(s: StateView, acc: Acceptance) {
  const goal = s.goals.find((g) => g.id === acc.new_goal_id);
  const target = goal?.measures.find((m) => m.id === decisionMeasureId(s, acc))?.text ?? goal?.objective ?? "";
  const lastCounter = s.proposals.find((p) => p.id === acc.proposal_id)?.counter_versions.at(-1);
  return { target, conditions: lastCounter?.conditions?.trim() ?? "" };
}

/** Northstar: the acceptance was approved with stale evidence, acknowledged as untested (the server's ratify_untested). */
export function approvedStale(s: StateView, acc: Acceptance): boolean {
  return s.audit.some((a) => a.action === "ratify_untested" && a.target === acc.proposal_id);
}
export const STALE_APPROVAL_NOTE =
  "Approved without a passing test: the sandbox test no longer matched this plan, and the owner acknowledged that before approving.";
