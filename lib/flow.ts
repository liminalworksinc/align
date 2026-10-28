import type { PlanParams, Actor, AnonStateView, AppState, Proposal, StateView, TestStatus } from "./types";
import { slotOf } from "./labels";
import { HttpError, id, now, sha256 } from "./store";
import type { Session } from "./auth";
import path from "node:path";
import { readTrace } from "./evidence";
import { profileFor } from "./scenario-profile";

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
  const prof = profileFor(s);
  if (who.actor !== "product") forbid(prof.messages.proposeWrongActor);
  if (s.proposals.some((p) => !["RATIFIED", "REJECTED"].includes(p.state))) conflict(prof.messages.openProposalExists);
  const target = currentGoal(s, "security");
  const planId = body.plan_id ?? prof.defaultPlan?.plan_id;
  const planVersion = body.plan_version ?? prof.defaultPlan?.plan_version;
  const plan = s.plans.find((p) => p.plan_id === planId && p.plan_version === Number(planVersion));
  if (!plan) throw new HttpError(400, prof.messages.planMissing);
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
    source_refs: prof.sourceRefs(s, target),
    counter_versions: [],
    state: "PENDING_SECURITY",
    test_status: testStatusFor(s, plan_ref, simRefs),
    created_at: now(),
  };
  if (!p.proposed_measure_text || !p.reciprocal_commitment) throw new HttpError(400, prof.messages.proposalIncomplete);
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

export const MAX_CONDITIONS = 1000;

export function counterProposal(
  s: AppState,
  who: Session,
  pid: string,
  body: { proposed_measure_text?: string; rationale?: string; changes_plan?: boolean; plan_params?: PlanParams; conditions?: unknown },
) {
  const p = openProposal(s, pid);
  const prof = profileFor(s);
  if (who.actor !== p.recipient_owner) forbid(prof.messages.counterWrongActor);
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state)) conflict("This proposal can’t be changed right now");
  const text = String(body.proposed_measure_text || "").trim();
  if (!text) throw new HttpError(400, "Write the changes you’re asking for");
  // Conditions are custom-only: Northstar ignores the field, so its counter shape never changes.
  let conditions: string | undefined;
  if (s.scenario === "custom" && body.conditions !== undefined && body.conditions !== null) {
    if (typeof body.conditions !== "string") throw new HttpError(400, "Conditions must be text");
    conditions = body.conditions.trim() || undefined;
    if (conditions && conditions.length > MAX_CONDITIONS)
      throw new HttpError(400, `Keep the conditions to ${MAX_CONDITIONS} characters or fewer`);
  }
  const n = p.counter_versions.length + 1;
  // Plan identity is decided by comparing executable parameters, not by the counter's own claim:
  // if the counter carries plan parameters that differ from the tested plan's, the evidence no longer applies.
  const tested = s.plans.find((x) => x.plan_id === p.plan_ref.plan_id && x.plan_version === p.plan_ref.plan_version);
  const paramsChanged = !!body.plan_params && (!tested || paramsHash(body.plan_params) !== paramsHash(tested.params));
  const changesPlan = body.changes_plan === true || paramsChanged;
  p.counter_versions.push({
    version: `${prof.nextVersion(s.goals.find((g) => g.id === p.target_goal_id) ?? currentGoal(s, "security"))}.${n}`,
    by: "security",
    at: now(),
    proposed_measure_text: text,
    rationale: String(body.rationale || "").trim(),
    changes_plan: changesPlan,
    ...(body.plan_params ? { plan_params: body.plan_params } : {}),
    ...(conditions ? { conditions } : {}), // appended last
  });
  // Tested report no longer matches the executable plan. A custom plan that was never tested stays UNTESTED.
  if (changesPlan && !(prof.planChangeKeepsUntested && p.test_status === "UNTESTED")) p.test_status = "STALE";
  p.state = "COUNTERED";
  p.product_ack_at = undefined;
  audit(s, who, "counter", p.id);
  touch(s, who, "counter");
  return p;
}

export function acknowledgeProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  const prof = profileFor(s);
  if (who.actor !== p.proposing_owner) forbid(prof.messages.ackWrongActor);
  if (p.state !== "COUNTERED") conflict(prof.messages.ackNothingToAccept);
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
  const prof = profileFor(s);
  if (who.actor !== target.owner_id) forbid(prof.messages.ratifyWrongActor);
  if (!["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state))
    conflict(p.state === "COUNTERED" ? prof.messages.ratifyNeedsAck : "This proposal can’t be approved right now");
  // Custom: no plan has a sandbox test, so every approval must say so explicitly.
  if (prof.strictUntestedMessage !== null && p.test_status !== "TESTED" && body.accept_untested !== true) conflict(prof.strictUntestedMessage);
  // Stale evidence can't silently become an approved, "tested" plan. The owner must rerun or knowingly accept it untested.
  if (p.test_status === "STALE" && body.accept_untested !== true)
    conflict("The test no longer matches this plan. Rerun it, or approve it explicitly as untested.");
  const approvedUntested = prof.strictUntestedMessage !== null ? p.test_status !== "TESTED" : p.test_status === "STALE";
  if (p.test_status === "STALE" && approvedUntested) p.test_status = "UNTESTED";
  const latest = p.counter_versions.at(-1);
  const finalText = latest?.proposed_measure_text ?? p.proposed_measure_text;
  const version = latest?.version ?? prof.nextVersion(target);
  const swap = prof.measureSwap(s, target, finalText);
  const newGoal = {
    ...target,
    id: prof.goalId(version),
    version,
    measures: swap.measures,
    approved_at: now(),
    approved_by: "security" as const,
    supersedes: target.id,
    changed: false,
  };
  s.goals.push(newGoal);
  p.state = "RATIFIED";
  // Every relation into the old goal version follows the approved one; the dependency itself becomes agreed.
  for (const rel of s.relations) {
    if (rel.id === prof.dependencyId) {
      const agreed = prof.dependencyAgreed(version);
      rel.status = "ACCEPTED";
      rel.target_goal = newGoal.id;
      rel.label = agreed.label;
      rel.provenance = agreed.provenance;
    } else if (rel.target_goal === target.id) rel.target_goal = newGoal.id;
  }
  // Work items whose team's goal changed (read before retargeting).
  const affected = s.work_items.filter((w) => w.goal_id === target.id).map((w) => w.id);
  const askingGoal = currentGoal(s, slotOf(p.proposing_owner));
  const asking = s.work_items.filter((w) => w.goal_id === askingGoal.id).map((w) => w.id);
  for (const w of s.work_items) if (w.goal_id === target.id) w.goal_id = newGoal.id;
  prof.updateWorkItems(s, version);
  s.acceptances.push({
    proposal_id: p.id,
    accepted_version: version,
    new_goal_id: newGoal.id,
    ratified_by: "security",
    acknowledged_by: "product",
    rationale: String(body.rationale || "").trim(),
    next_work: prof.nextWork(version),
    plan_ref: p.plan_ref,
    test_status: p.test_status,
    evidence_version: p.simulation_refs,
    ratified_at: now(),
    acknowledged_at: p.product_ack_at ?? p.created_at, // Product authored the commitment when no counter required re-acknowledgment
    acknowledged_via: p.product_ack_at ? "explicit" : "authored_in_proposal",
    // Custom only, appended last so Northstar acceptances keep their keys and order.
    ...(swap.replaced_measure_id ? { replaced_measure_id: swap.replaced_measure_id } : {}),
    ...(swap.new_measure_id ? { new_measure_id: swap.new_measure_id } : {}),
    ...(prof.custom ? { owning_work_item_ids: affected } : {}),
    ...(prof.custom ? { asking_work_item_ids: asking } : {}),
  });
  audit(s, who, approvedUntested ? "ratify_untested" : "ratify", p.id);
  touch(s, who, "ratify");
  return p;
}

export const MAX_LAUNCH_NOTE = 500;

/** Custom only: leadership approves the launch of the agreed plan, or says not yet. A later call replaces the earlier one. */
export function decideLaunch(s: AppState, who: Session, pid: string, body: { decision?: unknown; note?: unknown; accept_untested?: unknown }, beforeWrite?: () => void) {
  if (s.scenario !== "custom") throw new HttpError(404, "Launch decisions exist only in custom scenarios");
  if (who.actor !== "leadership") forbid("Only leadership can decide on the launch");
  const p = openProposal(s, pid);
  const acc = s.acceptances.find((a) => a.proposal_id === p.id);
  if (p.state !== "RATIFIED" || !acc) conflict("The two teams haven’t agreed yet, so there is nothing to launch");
  if (body.decision !== "approved" && body.decision !== "not_yet") throw new HttpError(400, "Choose approved or not_yet");
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") throw new HttpError(400, "The note must be text");
    note = body.note.trim() || undefined;
    if (note && note.length > MAX_LAUNCH_NOTE) throw new HttpError(400, `Keep the note to ${MAX_LAUNCH_NOTE} characters or fewer`);
  }
  // The launch is where an untested plan meets the world, so approving it needs the same explicit acknowledgement as the
  // owning team's approval (LIM-2437 finding 3). "Not yet" needs none.
  const untested = p.test_status !== "TESTED";
  if (body.decision === "approved" && untested && body.accept_untested !== true)
    conflict("This plan has no sandbox test. Approve the launch explicitly as not sandbox-tested.");
  beforeWrite?.(); // the route's rate limit: only a decision that would be written counts, not a refused one
  acc!.launch_decision = {
    decision: body.decision,
    ...(note ? { note } : {}),
    ...(body.decision === "approved" && untested ? { untested: true as const } : {}),
    by: "leadership",
    at: now(),
  };
  // The untested acknowledgement lives on launch_decision.untested; the audit action keeps its two names.
  audit(s, who, body.decision === "approved" ? "launch_approved" : "launch_not_yet", p.id); // never the note text
  return acc!.launch_decision;
}

export function rejectProposal(s: AppState, who: Session, pid: string) {
  const p = openProposal(s, pid);
  if (who.actor !== p.recipient_owner) forbid(profileFor(s).messages.rejectWrongActor);
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

// ---- B1-6: per-role allowlist projection of /api/state ----
// Every key is opted in here; a key that is not listed (including any field added to AppState later) never
// leaves the server. Keys keep the stored object's order, so a signed-in Northstar view stays byte-identical
// apart from the removals below. A field a role may not see is absent, not null.

const OMIT = Symbol("omit");
type Ctx = { me: Actor; hidden: Set<string> };
type Project = (v: unknown, s: AppState, c: Ctx) => unknown;
const keep: Project = (v) => v;

/** Absolute paths in fs error messages become their last segment. */
const stripPaths = (m: string) => m.replace(/(?:[A-Za-z]:)?(?:[\\/][^\s\\/'"`]+)+[\\/]([^\s\\/'"`]+)/g, "$1");

const SIGNED_IN: Partial<Record<keyof AppState | "capture_consents", Project>> = {
  company: keep,
  timeframe: keep,
  goals: (_v, s, c) => s.goals.filter((g) => !c.hidden.has(g.id)),
  relations: (_v, s, c) => s.relations.filter((r) => !c.hidden.has(r.source_goal) && !c.hidden.has(r.target_goal)),
  work_items: (_v, s, c) => s.work_items.filter((w) => !c.hidden.has(w.goal_id)),
  plans: keep,
  simulations: keep,
  brief: keep,
  proposals: keep,
  acceptances: keep,
  timer: keep,
  audit: keep,
  manual_baseline: keep,
  private_constraints: (_v, s, c) => s.private_constraints.filter((x) => x.owner === c.me),
  org_draft: (v, _s, c) => (c.me === "leadership" ? v : OMIT), // Leadership's unpublished next company goal
  pushes: keep,
  limits: keep, // custom only: suggested and confirmed limits (every signed-in role sees them, as with goals)
  asks: keep, // custom only: what was asked of each team (every signed-in role sees all of them)
  sessions: keep, // captured sessions and their mappings: signed-in roles only (AgentPane, WorkMap, AuthorityStrip)
  mappings: keep,
  capture_consents: keep,
  registry_version: keep,
  ingest_errors: (v) => (Array.isArray(v) ? v.map((m) => stripPaths(String(m))) : OMIT),
  scenario: keep,
  teams: keep,
  scenario_config: keep,
};

/** Goals the viewer may not see: private goals of another owner (Owner mapped to Actor, so ceo is leadership). */
function hiddenGoals(s: AppState, me: Actor): Set<string> {
  return new Set(s.goals.filter((g) => g.visibility !== "shared" && g.owner_id !== slotOf(me)).map((g) => g.id));
}

/** /api/state for one caller. Anonymous callers get only the sign-in screen's labels. */
export function viewFor(s: AppState, me: Actor | null): StateView | AnonStateView {
  if (!me) {
    return {
      company: s.company,
      ...(s.scenario !== undefined ? { scenario: s.scenario } : {}),
      ...(s.teams !== undefined ? { teams: s.teams } : {}),
      ...(s.scenario === "custom" && s.scenario_config?.company_note ? { company_note: s.scenario_config.company_note } : {}),
      me: null,
    };
  }
  const c: Ctx = { me, hidden: hiddenGoals(s, me) };
  const out: Record<string, unknown> = {};
  const src = s as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const project = SIGNED_IN[k as keyof typeof SIGNED_IN];
    if (!project) continue;
    const v = project(src[k], s, c);
    if (v !== OMIT) out[k] = v;
  }
  out.me = me;
  return out as unknown as StateView;
}
