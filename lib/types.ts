// Align shared contract. All lanes build against these shapes.

export type Owner = "ceo" | "product" | "security";
export type Actor = "product" | "security";

export type TruthState =
  | "OBSERVED"
  | "PROPOSED"
  | "ACCEPTED"
  | "VERIFIED"
  | "UNKNOWN"
  | "FAILED"
  | "REJECTED"
  | "NOT_SHARED"
  | "NOT_TESTED"
  | "INFERRED";

export type TestStatus = "TESTED" | "STALE" | "UNTESTED";

export interface Measure {
  id: string;
  text: string;
  verifiable_by: "sparta" | "assertion" | "none";
  inherited_from?: string; // CEO KR id when inherited
}

export interface Goal {
  id: string;
  owner_id: Owner;
  owner_name: string;
  kind: "org" | "team" | "operator";
  parent_ids: string[];
  visibility: "private" | "shared";
  version: string; // e.g. "v1", "v2.1"
  objective: string;
  success_criteria: string[];
  measures: Measure[];
  approved_at: string;
  approved_by: Owner;
  supersedes?: string; // prior version id; prior versions are never overwritten
  changed?: boolean; // highlighted as newly changed upstream
}

export interface GoalRelation {
  id: string;
  source_goal: string;
  target_goal: string;
  type: "child" | "supports" | "depends_on" | "conflicts_with";
  status: TruthState;
  label: string;
  provenance: string;
}

export interface WorkItem {
  id: string;
  goal_id: string;
  source: string;
  task: string;
  owner: Owner;
  observed_status: string;
  priority_rank: number;
  proposed_workstream?: string;
  decision_ref?: string;
}

export interface PlanParams {
  ordering: string;
  beta_rule: string;
  protected_set: string[];
  required_fields: string[];
}

export interface Plan {
  plan_id: string;
  plan_version: number;
  title: string;
  params: PlanParams;
  hash: string; // sha256 of the plan file agent/plans/<plan_id>@<version>.md (matches the agent trace plan_sha256)
  goal_text_ref: string; // agent/plans/<plan_id>@<version>.md
}

export interface CheckResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TraceRow {
  seq: number;
  kind: "read" | "write" | "other";
  method: string;
  path: string;
  status: number;
  injected: boolean;
}

export interface SimulationRun {
  id: string;
  plan_id: string;
  plan_version: number;
  plan_hash: string;
  world_id: string;
  mission_id: string;
  seed_version: string; // seedHash prefix from evidence
  checks_version: string; // inputDigest prefix from evidence
  scenario: "normal" | "interruption";
  changed_records: { ticket_id: string; fields: string[] }[];
  protected_records: { ticket_id: string; unchanged: boolean }[];
  checks: CheckResult[];
  trace: TraceRow[];
  verdict: "PASS" | "FAIL";
  exit_code: number;
  report_path: string;
  report_sha256: string;
  package_version: string;
  ingested_at: string;
}

export interface BriefOption {
  rank: "P0" | "P1" | "P2";
  label: string;
  owner: Owner;
  evidence_ref: string;
  capacity: "known" | "unknown";
  delay_consequence: string;
  reason: string;
}

export interface AlikeRef {
  decision_id: string;
  summary: string;
  recorded_at: string;
  retrieved_in_session: string;
  plan_before: string;
  plan_after: string;
}

export interface Brief {
  goal_ref: string;
  headline: string;
  evidence_refs: { label: string; ref: string; state: TruthState }[];
  priorities: BriefOption[];
  disconfirmers: string[];
  unknowns: string[];
  alike_ref: AlikeRef | null;
  alike_status: "retrieved" | "unavailable" | "pending";
}

export interface CounterVersion {
  version: string;
  by: Actor;
  at: string;
  proposed_measure_text: string;
  plan_params?: PlanParams; // only when the counter changes the executable plan
  rationale: string;
  changes_plan: boolean; // true when the counter changes test-relevant plan parameters
}

export type ProposalState =
  | "DRAFT"
  | "PENDING_SECURITY"
  | "COUNTERED"
  | "ACKNOWLEDGED_BY_PRODUCT"
  | "RATIFIED"
  | "REJECTED";

export interface Proposal {
  id: string;
  proposing_owner: Actor;
  recipient_owner: Actor;
  target_goal_id: string;
  target_goal_version: string;
  proposed_measure_text: string;
  rationale: string;
  reciprocal_commitment: string;
  plan_ref: { plan_id: string; plan_version: number; plan_hash: string };
  simulation_refs: string[]; // SimulationRun ids (baseline FAIL + candidate PASS)
  source_refs: string[];
  counter_versions: CounterVersion[];
  state: ProposalState;
  test_status: TestStatus;
  created_at: string;
  product_ack_at?: string;
}

export interface Acceptance {
  proposal_id: string;
  accepted_version: string;
  new_goal_id: string;
  ratified_by: "security";
  acknowledged_by: "product";
  rationale: string;
  next_work: string;
  plan_ref: { plan_id: string; plan_version: number; plan_hash: string };
  test_status: TestStatus;
  evidence_version: string[];
  ratified_at: string;
  acknowledged_at: string;
  acknowledged_via?: "explicit" | "authored_in_proposal"; // explicit = Product's POST /acknowledge; otherwise the commitment was written by Product in its own proposal
}

export interface Touchpoint {
  actor: Actor;
  action: string;
  at: string;
}

export interface FlowTimer {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  touchpoints: Touchpoint[];
  excluded_prep: { label: string; seconds: number }[];
  acked_by: Actor[]; // sessions that have seen the final accepted state
}

export interface AuditEvent {
  id: string;
  actor: Actor;
  session_id: string;
  action: string;
  target: string;
  at: string;
}

export interface ManualBaselineStep {
  step: string;
  description: string;
  est_minutes: number;
  touchpoints: number;
}

export interface AppState {
  company: string;
  timeframe: string;
  goals: Goal[]; // includes superseded versions
  relations: GoalRelation[];
  work_items: WorkItem[];
  plans: Plan[];
  simulations: SimulationRun[];
  brief: Brief;
  proposals: Proposal[];
  acceptances: Acceptance[];
  timer: FlowTimer;
  audit: AuditEvent[];
  manual_baseline: ManualBaselineStep[];
  private_constraints: { owner: Actor; text: string }[];
  ingest_errors?: string[]; // evidence files that could not be parsed; never blocks polling
}

// Session view returned to the browser. Visibility-filtered for the actor.
export interface StateView extends AppState {
  me: Actor | null;
}
