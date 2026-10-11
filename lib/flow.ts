import type { PlanParams, Actor, AppState, Proposal, StateView, TestStatus } from "./types";
import { HttpError, id, now, sha256 } from "./store";
import type { Session } from "./auth";
import path from "node:path";
import { readTrace } from "./evidence";

/** Executable identity of a plan: its parameters with keys and list order normalized. */
function paramsHash(p: PlanParams): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm).map(String).sort() : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : String(v).trim().toLowerCase();
  return sha256(JSON.stringify(norm(p)));
}

const forbid = (why: string) => {
  throw new HttpError(403, why);
};
const conflict = (why: string) => {
  throw new HttpError(409, why);
};

export function audit(s: AppState, who: Session, action: string, target: string) {
  s.audit.push({ id: id("a"), actor: who.actor, session_id: who.sid, action, target, at: now() });
}

export function touch(s: AppState, who: Session, action: string) {
  const t = s.timer;
  if (!t.started_at) {
    if (action !== "ceo_change_viewed") return; // timer starts only when the CEO change is first viewed
    t.started_at = now();
  }
  if (t.ended_at) return;
  t.touchpoints.push({ actor: who.actor, action, at: now() });
}

/** Sandbox runs are prep, not decision time: list each run's own measured duration separately (from its agent trace). */
export function recordExcludedPrep(s: AppState) {
  for (const run of s.simulations) {
    const label = path.basename(run.report_path, ".json");
    const name = `Sparta sandbox run ${label} (prep, excluded)`;
    if (s.timer.excluded_prep.some((p) => p.label === name)) continue;
    let trace: Record<string, unknown> | null = null;
    try {
      trace = readTrace(label);
    } catch {
      continue; // unreadable trace: list nothing rather than guess a duration
    }
    const start = Date.parse(String(trace?.started_at ?? ""));
    const end = Date.parse(String(trace?.finished_at ?? ""));
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start)
      s.timer.excluded_prep.push({ label: name, seconds: Math.round((end - start) / 1000) });
  }
}

export function currentGoal(s: AppState, owner: "ceo" | "product" | "security") {
  const all = s.goals.filter((g) => g.owner_id === owner);
  const superseded = new Set(all.map((g) => g.supersedes).filter(Boolean));
  return all.find((g) => !superseded.has(g.id))!;
}

/** TESTED only when a PASS run exists for this exact plan hash AND a FAIL baseline exists on the same mission/seed/checks. */
export function testStatusFor(s: AppState, plan: Proposal["plan_ref"], simRefs: string[]): TestStatus {
  const runs = s.simulations.filter((r) => simRefs.includes(r.id));
  const pass = runs.find(
    (r) => r.plan_id === plan.plan_id && r.plan_version === plan.plan_version && r.plan_hash === plan.plan_hash && r.verdict === "PASS",
  );
  if (!pass) return "UNTESTED";
  const comparable = runs.some(
    (r) =>
      r.verdict === "FAIL" &&
      r.plan_id !== plan.plan_id &&
      r.mission_id === pass.mission_id &&
      r.seed_version === pass.seed_version &&
      r.checks_version === pass.checks_version,
  );
  return comparable ? "TESTED" : "UNTESTED";
}

export function createProposal(
  s: AppState,
  who: Session,
  body: { proposed_measure_text?: string; rationale?: string; reciprocal_commitment?: string; plan_id?: string; plan_version?: number; simulation_refs?: string[] },
) {
  if (who.actor !== "product") forbid("Only the Product Director can propose a change to another team’s goal");
  if (s.proposals.some((p) => !["RATIFIED", "REJECTED"].includes(p.state))) conflict("There’s already an open proposal. Finish or decline it first.");
  const target = currentGoal(s, "security");
  const plan = s.plans.find((p) => p.plan_id === body.plan_id && p.plan_version === Number(body.plan_version));
  if (!plan) throw new HttpError(400, "Add a plan that has been tested before sending");
  const simRefs = (body.simulation_refs ?? []).filter((r) => s.simulations.some((x) => x.id === r));
  const plan_ref = { plan_id: plan.plan_id, plan_version: plan.plan_version, plan_hash: plan.hash };
  const p: Proposal = {
    id: id("prop"),
    proposing_owner: "product",
    recipient_owner: "security",
    target_goal_id: target.id,
    target_goal_version: target.version,
    proposed_measure_text: String(body.proposed_measure_text || "").trim(),
    rationale: String(body.rationale || "").trim(),
    reciprocal_commitment: String(body.reciprocal_commitment || "").trim(),
    plan_ref,
    simulation_refs: simRefs,
    source_refs: ["g-ceo-v2#KR2", `${target.id}#S-M1`, s.brief.alike_ref ? `alike:${s.brief.alike_ref.decision_id}` : "alike:unavailable"],
    counter_versions: [],
    state: "PENDING_SECURITY",
    test_status: testStatusFor(s, plan_ref, simRefs),
    created_at: now(),
  };
  if (!p.proposed_measure_text || !p.reciprocal_commitment) throw new HttpError(400, "A proposal needs the new target and what Product will do in return");
  s.proposals.push(p);
  audit(s, who, "propose", p.id);
  touch(s, who, "propose");
  return p;
}

function openProposal(s: AppState, pid: string) {
  const p = s.proposals.find((x) => x.id === pid);
  if (!p) throw new HttpError(404, "That proposal couldn’t be found");
  return p;
}

export function counterProposal(
  s: AppState,
  who: Session,
  pid: string,
  body: { proposed_measure_text?: string; rationale?: string; changes_plan?: boolean; plan_params?: PlanParams },
) {
  const p = openProposal(s, pid);
  if (who.actor !== p.recipient_owner) forbid("Only Security can ask for changes to a proposal for Security’s goal");
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state)) conflict("This proposal can’t be changed right now");
  const text = String(body.proposed_measure_text || "").trim();
  if (!text) throw new HttpError(400, "Write the changes you’re asking for");
  const n = p.counter_versions.length + 1;
  // Plan identity is decided by comparing executable parameters, not by the counter's own claim:
  // if the counter carries plan parameters that differ from the tested plan's, the evidence no longer applies.
  const tested = s.plans.find((x) => x.plan_id === p.plan_ref.plan_id && x.plan_version === p.plan_ref.plan_version);
  const paramsChanged = !!body.plan_params && (!tested || paramsHash(body.plan_params) !== paramsHash(tested.params));
  const changesPlan = body.changes_plan === true || paramsChanged;
  p.counter_versions.push({
    version: `v2.${n}`,
    by: "security",
    at: now(),
    proposed_measure_text: text,
    rationale: String(body.rationale || "").trim(),
    changes_plan: changesPlan,
    ...(body.plan_params ? { plan_params: body.plan_params } : {}),
  });
  if (changesPlan) p.test_status = "STALE"; // tested report no longer matches the executable plan
  p.state = "COUNTERED";
  p.product_ack_at = undefined;
  audit(s, who, "counter", p.id);
  touch(s, who, "counter");
  return p;
}

export function acknowledgeProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  if (who.actor !== p.proposing_owner) forbid("Only the Product Director can accept Security’s changes");
  if (p.state !== "COUNTERED") conflict("There are no changes from Security to accept");
  p.state = "ACKNOWLEDGED_BY_PRODUCT";
  p.product_ack_at = now();
  audit(s, who, "acknowledge", p.id);
  touch(s, who, "acknowledge");
  return p;
}

export function ratifyProposal(s: AppState, who: Session, pid: string, body: { rationale?: string; accept_untested?: boolean }) {
  const p = openProposal(s, pid);
  const target = s.goals.find((g) => g.id === p.target_goal_id);
  if (!target) throw new HttpError(404, "The goal this proposal changes couldn’t be found");
  if (who.actor !== target.owner_id) forbid("Only Security can approve changes to Security’s goal");
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state))
    conflict(p.state === "COUNTERED" ? "Product needs to accept your changes before you can approve" : "This proposal can’t be approved right now");
  // Stale evidence can't silently become an approved, "tested" plan. The owner must rerun or knowingly accept it untested.
  if (p.test_status === "STALE" && body.accept_untested !== true)
    conflict("The test no longer matches this plan. Rerun it, or approve it explicitly as untested.");
  const approvedUntested = p.test_status === "STALE";
  if (approvedUntested) p.test_status = "UNTESTED";
  const latest = p.counter_versions.at(-1);
  const finalText = latest?.proposed_measure_text ?? p.proposed_measure_text;
  const version = latest?.version ?? "v2";
  const newGoal = {
    ...target,
    id: `g-security-${version.replace(".", "_")}`,
    version,
    measures: [
      ...target.measures.filter((m) => m.id !== "S-M1"),
      { id: "S-M3", text: finalText, verifiable_by: "sparta" as const, inherited_from: "KR2" },
      { id: "S-M1", text: "Close as many tickets as possible each day, after beta issues", verifiable_by: "none" as const },
    ],
    approved_at: now(),
    approved_by: "security" as const,
    supersedes: target.id,
    changed: false,
  };
  s.goals.push(newGoal);
  p.state = "RATIFIED";
  const rel = s.relations.find((r) => r.id === "r-product-security");
  if (rel) {
    rel.status = "ACCEPTED";
    rel.target_goal = newGoal.id;
    rel.label = "Agreed: Security handles beta customers’ issues first";
    rel.provenance = `Agreed through Product’s proposal; Security approved goal ${version}`;
  }
  const rel2 = s.relations.find((r) => r.id === "r-ceo-security");
  if (rel2) rel2.target_goal = newGoal.id;
  for (const w of s.work_items) if (w.goal_id === target.id) w.goal_id = newGoal.id;
  const beta = s.work_items.find((w) => w.id === "w-s3");
  if (beta) {
    beta.priority_rank = 0;
    beta.observed_status = `next up, approved in goal ${version}`;
    beta.task = "Handle beta customers’ issues first, using the tested new plan";
  }
  const polish = s.work_items.find((w) => w.id === "w-p3");
  if (polish) polish.observed_status = "deferred (Product commitment)";
  s.acceptances.push({
    proposal_id: p.id,
    accepted_version: version,
    new_goal_id: newGoal.id,
    ratified_by: "security",
    acknowledged_by: "product",
    rationale: String(body.rationale || "").trim(),
    next_work: "Security’s AI agent follows the new plan (beta issues first); Product tags beta issues as they come in and publishes what’s in the beta",
    plan_ref: p.plan_ref,
    test_status: p.test_status,
    evidence_version: p.simulation_refs,
    ratified_at: now(),
    acknowledged_at: p.product_ack_at ?? p.created_at, // Product authored the commitment when no counter required re-acknowledgment
    acknowledged_via: p.product_ack_at ? "explicit" : "authored_in_proposal",
  });
  audit(s, who, approvedUntested ? "ratify_untested" : "ratify", p.id);
  touch(s, who, "ratify");
  return p;
}

export function rejectProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  if (who.actor !== p.recipient_owner) forbid("Only Security can decline a proposal for Security’s goal");
  if (["RATIFIED", "REJECTED"].includes(p.state)) conflict("This proposal has already been decided");
  p.state = "REJECTED";
  audit(s, who, "reject", p.id);
  touch(s, who, "reject");
  return p;
}

export function seeFinal(s: AppState, who: Session) {
  const t = s.timer;
  if (!s.acceptances.length || !t.started_at || t.ended_at) return;
  if (!t.acked_by.includes(who.actor)) {
    t.acked_by.push(who.actor);
    t.touchpoints.push({ actor: who.actor, action: "saw_accepted_version", at: now() });
    audit(s, who, "saw_accepted_version", s.acceptances.at(-1)!.accepted_version);
  }
  if (t.acked_by.includes("product") && t.acked_by.includes("security")) t.ended_at = now();
}

/** Visibility filter: private constraints only for their owner; private goals only for their owner. */
export function viewFor(s: AppState, me: Actor | null): StateView {
  return {
    ...s,
    goals: s.goals.filter((g) => g.visibility === "shared" || g.owner_id === me),
    private_constraints: s.private_constraints.filter((c) => c.owner === me),
    me,
  };
}
