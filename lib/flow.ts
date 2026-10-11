import type { Actor, AppState, Proposal, StateView, TestStatus } from "./types";
import { HttpError, id, now } from "./store";
import type { Session } from "./auth";
import path from "node:path";
import { readTrace } from "./evidence";

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
  if (who.actor !== "product") forbid("Only the Product owner can propose a change to a peer goal");
  if (s.proposals.some((p) => !["RATIFIED", "REJECTED"].includes(p.state))) conflict("A proposal is already open");
  const target = currentGoal(s, "security");
  const plan = s.plans.find((p) => p.plan_id === body.plan_id && p.plan_version === Number(body.plan_version));
  if (!plan) throw new HttpError(400, "Attach a known tested plan (plan_id + plan_version)");
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
  if (!p.proposed_measure_text || !p.reciprocal_commitment) throw new HttpError(400, "A proposal needs the measure text and Product's reciprocal commitment");
  s.proposals.push(p);
  audit(s, who, "propose", p.id);
  touch(s, who, "propose");
  return p;
}

function openProposal(s: AppState, pid: string) {
  const p = s.proposals.find((x) => x.id === pid);
  if (!p) throw new HttpError(404, "Proposal not found");
  return p;
}

export function counterProposal(
  s: AppState,
  who: Session,
  pid: string,
  body: { proposed_measure_text?: string; rationale?: string; changes_plan?: boolean },
) {
  const p = openProposal(s, pid);
  if (who.actor !== p.recipient_owner) forbid("Only the Security owner can counter a proposal to the Security goal");
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state)) conflict(`Cannot counter a proposal in state ${p.state}`);
  const text = String(body.proposed_measure_text || "").trim();
  if (!text) throw new HttpError(400, "Counter needs revised measure text");
  const n = p.counter_versions.length + 1;
  p.counter_versions.push({
    version: `v2.${n}`,
    by: "security",
    at: now(),
    proposed_measure_text: text,
    rationale: String(body.rationale || "").trim(),
    changes_plan: body.changes_plan === true,
  });
  if (body.changes_plan === true) p.test_status = "STALE"; // tested report no longer matches the executable plan
  p.state = "COUNTERED";
  p.product_ack_at = undefined;
  audit(s, who, "counter", p.id);
  touch(s, who, "counter");
  return p;
}

export function acknowledgeProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  if (who.actor !== p.proposing_owner) forbid("Only the Product owner can acknowledge Product's reciprocal commitment");
  if (p.state !== "COUNTERED") conflict(`Nothing to acknowledge in state ${p.state}`);
  p.state = "ACKNOWLEDGED_BY_PRODUCT";
  p.product_ack_at = now();
  audit(s, who, "acknowledge", p.id);
  touch(s, who, "acknowledge");
  return p;
}

export function ratifyProposal(s: AppState, who: Session, pid: string, body: { rationale?: string }) {
  const p = openProposal(s, pid);
  const target = s.goals.find((g) => g.id === p.target_goal_id);
  if (!target) throw new HttpError(404, "Target goal not found");
  if (who.actor !== target.owner_id) forbid("Only the owner of the Security goal can ratify its revision");
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state))
    conflict(p.state === "COUNTERED" ? "Product must acknowledge the countered terms before ratification" : `Cannot ratify in state ${p.state}`);
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
      { id: "S-M1", text: "Tickets triaged per day (throughput), secondary to S-M3", verifiable_by: "none" as const },
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
    rel.label = "Owner-accepted agreement: beta incidents triaged per launch-readiness policy";
    rel.provenance = `Proposal ${p.id}, ratified by Security ${version}`;
  }
  const rel2 = s.relations.find((r) => r.id === "r-ceo-security");
  if (rel2) rel2.target_goal = newGoal.id;
  for (const w of s.work_items) if (w.goal_id === target.id) w.goal_id = newGoal.id;
  const beta = s.work_items.find((w) => w.id === "w-s3");
  if (beta) {
    beta.priority_rank = 0;
    beta.observed_status = `next work, authorized under ${version}`;
    beta.task = `Beta support triage with plan ${p.plan_ref.plan_id}@${p.plan_ref.plan_version}`;
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
    next_work: `Security triage agent runs ${p.plan_ref.plan_id}@${p.plan_ref.plan_version}; Product tags beta issues obs-beta at intake and publishes beta scope`,
    plan_ref: p.plan_ref,
    test_status: p.test_status,
    evidence_version: p.simulation_refs,
    ratified_at: now(),
    acknowledged_at: p.product_ack_at ?? p.created_at, // Product authored the commitment when no counter required re-acknowledgment
    acknowledged_via: p.product_ack_at ? "explicit" : "authored_in_proposal",
  });
  audit(s, who, "ratify", p.id);
  touch(s, who, "ratify");
  return p;
}

export function rejectProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  if (who.actor !== p.recipient_owner) forbid("Only the Security owner can reject a proposal to the Security goal");
  if (["RATIFIED", "REJECTED"].includes(p.state)) conflict(`Proposal already ${p.state}`);
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
