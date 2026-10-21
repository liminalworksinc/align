// Approval profile: everything the propose / counter / approve flow says or writes that depends on the scenario.
// NORTHSTAR_PROFILE holds the literals lib/flow.ts hardcoded at 850971e, byte for byte (curly apostrophes included),
// so Northstar output does not move. customProfile(s) builds the same shape from state.teams and state.scenario_config.
// No node: imports and no import from ./flow, so there is no cycle.

import { NORTHSTAR, companyMeasureId, conflictMeasureId, dependencyId, leadOf, poss, scenarioOf, teamOf } from "./labels";
import type { AppState, Goal, Measure } from "./types";

export interface ApprovalMessages {
  proposeWrongActor: string; // 403: someone other than the asking team proposes
  openProposalExists: string; // 409
  planMissing: string; // 400: the plan named in the proposal does not exist
  proposalIncomplete: string; // 400: new target or reciprocal commitment missing
  counterWrongActor: string; // 403
  ackWrongActor: string; // 403
  ackNothingToAccept: string; // 409
  ratifyWrongActor: string; // 403
  ratifyNeedsAck: string; // 409: owner tries to approve before the asking team accepted the changes
  rejectWrongActor: string; // 403
}

export interface MeasureSwap {
  measures: Measure[];
  replaced_measure_id?: string; // custom only
  new_measure_id?: string; // custom only
}

export interface ApprovalProfile {
  custom: boolean;
  messages: ApprovalMessages;
  /** Plan a proposal uses when the body names none (custom: p-custom@1). Northstar requires the body to name one. */
  defaultPlan: { plan_id: string; plan_version: number } | null;
  sourceRefs(s: AppState, target: Goal): string[];
  /** Version the approved owner goal gets before any counter (Northstar: literal "v2"; custom: major plus one). */
  nextVersion(target: Goal): string;
  /** Goal id for an approved version, e.g. g-security-v2_1. */
  goalId(version: string): string;
  /** A plan change in a counter keeps an UNTESTED proposal UNTESTED (custom); Northstar marks it STALE. */
  planChangeKeepsUntested: boolean;
  /** Every not-sandbox-tested approval needs accept_untested: true (custom). Null: Northstar's rule, only STALE needs it. */
  strictUntestedMessage: string | null;
  measureSwap(s: AppState, target: Goal, finalText: string): MeasureSwap;
  dependencyId: string;
  /** Label and provenance the dependency relation gets once approved. */
  dependencyAgreed(version: string): { label: string; provenance: string };
  /** Scenario-specific work item edits after approval (goal retargeting is generic and done by the caller). */
  updateWorkItems(s: AppState, version: string): void;
  nextWork(version: string): string;
}

export const NORTHSTAR_PROFILE: ApprovalProfile = {
  custom: false,
  messages: {
    proposeWrongActor: "Only the Product Director can propose a change to another team’s goal",
    openProposalExists: "There’s already an open proposal. Finish or decline it first.",
    planMissing: "Add a plan that has been tested before sending",
    proposalIncomplete: "A proposal needs the new target and what Product will do in return",
    counterWrongActor: "Only Security can ask for changes to a proposal for Security’s goal",
    ackWrongActor: "Only the Product Director can accept Security’s changes",
    ackNothingToAccept: "There are no changes from Security to accept",
    ratifyWrongActor: "Only Security can approve changes to Security’s goal",
    ratifyNeedsAck: "Product needs to accept your changes before you can approve",
    rejectWrongActor: "Only Security can decline a proposal for Security’s goal",
  },
  defaultPlan: null,
  sourceRefs: (s, target) => ["g-ceo-v2#KR2", `${target.id}#S-M1`, s.brief.alike_ref ? `alike:${s.brief.alike_ref.decision_id}` : "alike:unavailable"],
  nextVersion: () => "v2",
  goalId: (version) => `g-security-${version.replace(".", "_")}`,
  planChangeKeepsUntested: false,
  strictUntestedMessage: null,
  measureSwap: (_s, target, finalText) => ({
    measures: [
      ...target.measures.filter((m) => m.id !== "S-M1"),
      { id: "S-M3", text: finalText, verifiable_by: "sparta" as const, inherited_from: "KR2" },
      { id: "S-M1", text: "Close as many tickets as possible each day, after beta issues", verifiable_by: "none" as const },
    ],
  }),
  dependencyId: NORTHSTAR.ids.dependency,
  dependencyAgreed: (version) => ({
    label: "Agreed: Security handles beta customers’ issues first",
    provenance: `Agreed through Product’s proposal; Security approved goal ${version}`,
  }),
  updateWorkItems: (s, version) => {
    const beta = s.work_items.find((w) => w.id === "w-s3");
    if (beta) {
      beta.priority_rank = 0;
      beta.observed_status = `next up, approved in goal ${version}`;
      beta.task = "Handle beta customers’ issues first, using the tested new plan";
    }
    const polish = s.work_items.find((w) => w.id === "w-p3");
    if (polish) polish.observed_status = "deferred (Product commitment)";
  },
  nextWork: () =>
    "Security’s AI agent follows the new plan (beta issues first); Product tags beta issues as they come in and publishes what’s in the beta",
};

/** Next unused measure id with this prefix across every goal version, e.g. S-M3 when S-M1 and S-M2 exist. */
export function nextFree(s: Pick<AppState, "goals">, prefix: string): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let max = 0;
  for (const g of s.goals) for (const m of g.measures) {
    const hit = re.exec(m.id);
    if (hit) max = Math.max(max, Number(hit[1]));
  }
  return `${prefix}${max + 1}`;
}

export function customProfile(s: AppState): ApprovalProfile {
  const cfg = s.scenario_config;
  const asking = teamOf(s, "product");
  const owning = teamOf(s, "security");
  const askingLead = leadOf(s, "product");
  const owningLead = leadOf(s, "security");
  const ownerMeasure = conflictMeasureId(s);
  const companyMeasure = companyMeasureId(s);
  return {
    custom: true,
    messages: {
      proposeWrongActor: `Only ${askingLead} (${asking}) can propose a change to another team’s goal`,
      openProposalExists: "There’s already an open proposal. Finish or decline it first.",
      planMissing: "This scenario’s plan couldn’t be found. Set the scenario up again.",
      proposalIncomplete: `A proposal needs the new target and what ${asking} will do in return`,
      counterWrongActor: `Only ${owningLead} (${owning}) can ask for changes to a proposal for ${poss(owning)} goal`,
      ackWrongActor: `Only ${askingLead} (${asking}) can accept ${poss(owning)} changes`,
      ackNothingToAccept: `There are no changes from ${owning} to accept`,
      ratifyWrongActor: `Only ${owningLead} (${owning}) can approve changes to ${poss(owning)} goal`,
      ratifyNeedsAck: `${asking} needs to accept your changes before you can approve`,
      rejectWrongActor: `Only ${owningLead} (${owning}) can decline a proposal for ${poss(owning)} goal`,
    },
    defaultPlan: cfg ? { plan_id: cfg.plan_id, plan_version: cfg.plan_version } : null,
    sourceRefs: (st, target) => {
      const company = currentOf(st, "ceo");
      return [`${company?.id ?? "g-ceo-v1"}#${companyMeasure}`, `${target.id}#${ownerMeasure}`];
    },
    nextVersion: (target) => `v${(parseInt(target.version.replace(/^v/, ""), 10) || 1) + 1}`,
    goalId: (version) => `g-security-${version.replace(".", "_")}`,
    planChangeKeepsUntested: true,
    strictUntestedMessage: "This plan has no sandbox test. Approve it explicitly as not sandbox-tested.",
    measureSwap: (st, target, finalText) => {
      const newId = nextFree(st, "S-M");
      const replaced = target.measures.some((m) => m.id === ownerMeasure);
      const swapped: Measure = { id: newId, text: finalText, verifiable_by: "none", inherited_from: companyMeasure };
      return {
        // Replaced in place; the old text stays visible on the superseded goal version.
        measures: replaced ? target.measures.map((m) => (m.id === ownerMeasure ? swapped : m)) : [...target.measures, swapped],
        ...(replaced ? { replaced_measure_id: ownerMeasure } : {}),
        new_measure_id: newId,
      };
    },
    dependencyId: dependencyId(s),
    dependencyAgreed: (version) => ({
      label: `Agreed: ${owning} changed its goal for ${poss(asking)} request`,
      provenance: `Agreed through ${poss(asking)} proposal; ${owning} approved goal ${version}`,
    }),
    updateWorkItems: (st, version) => {
      const unblocks = cfg?.unblocks_work_item_id ? st.work_items.find((w) => w.id === cfg.unblocks_work_item_id) : undefined;
      if (unblocks) {
        unblocks.priority_rank = 0;
        unblocks.observed_status = `next up, approved in goal ${version}`;
      }
      const deferred = cfg?.deferred_work_item_id ? st.work_items.find((w) => w.id === cfg.deferred_work_item_id) : undefined;
      if (deferred) deferred.observed_status = `deferred (${asking} commitment)`;
    },
    nextWork: (version) => `${owning} works to goal ${version}; ${asking} does what it committed to in the proposal`,
  };
}

function currentOf(s: Pick<AppState, "goals">, owner: Goal["owner_id"]): Goal | undefined {
  const all = s.goals.filter((g) => g.owner_id === owner);
  const superseded = new Set(all.map((g) => g.supersedes).filter(Boolean));
  return all.find((g) => !superseded.has(g.id));
}

export function profileFor(s: AppState): ApprovalProfile {
  return scenarioOf(s) === "custom" ? customProfile(s) : NORTHSTAR_PROFILE;
}
