// Align shared contract. All lanes build against these shapes.

export type Owner = "ceo" | "product" | "security";
export type Actor = "product" | "security" | "leadership";

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
  hash: string; // sha256 of the plan file agent/plans/<plan_id>@<version>.md (matches the agent trace plan_sha256), or of the inline text
  goal_text_ref: string; // agent/plans/<plan_id>@<version>.md, or inline:<plan_id>@<version>
  text?: string; // inline plan text (custom scenarios); hash is sha256 of the normalized text
  source?: "file" | "inline";
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
  plan_text?: string; // custom scenarios: the counter's revised inline plan text
  plan_hash?: string;
  conditions?: string; // custom scenarios: what the owning team's approval depends on (≤ 1000 chars); never written in Northstar
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
  // Custom scenarios only; absent for Northstar so its state stays byte-identical.
  replaced_measure_id?: string;
  new_measure_id?: string;
  owning_work_item_ids?: string[]; // operator work items whose team's goal changed ("Work still on the old plan")
  asking_work_item_ids?: string[]; // the asking team's own work items, to check against its new commitment
  launch_decision?: LaunchDecision; // leadership's launch call after the teams agree; appended last
}

/** Custom only. Leadership's decision on launching what the two teams agreed. Changing it overwrites it. */
export interface LaunchDecision {
  decision: "approved" | "not_yet";
  note?: string; // at most 500 characters; never written to the audit log
  untested?: true; // approved knowing the plan had no sandbox test (the request carried accept_untested)
  by: "leadership";
  at: string;
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
  org_draft: OrgDraft | null; // Leadership's unpublished next company goal version
  pushes: GoalPush[];
  sessions: AgentSession[];
  mappings: SessionMapping[];
  registry_version: string;
  // Custom scenarios only. Never written for Northstar and never defaulted, so /api/state stays byte-identical.
  scenario?: ScenarioKind;
  teams?: Record<Owner, ScenarioTeam>;
  scenario_config?: ScenarioConfig;
  asks?: Ask[]; // custom only: what people asked of a team, mostly from meetings (lib/asks.ts)
  limits?: Limit[]; // custom only: what a team's goal must, must not or need not cover (lib/limits.ts)
  funnel?: Funnel; // custom only, written once a proposal is RATIFIED (lib/funnel.ts); deleted with the workspace
}

/** Custom only. What testers did after a decision (issue #30 item 5): timestamped events with the role only, no identity. */
export interface Funnel {
  events: FunnelEvent[]; // at most one per action, role and proposal
  reports: ValueReport[]; // at most one per role and proposal
}

export interface FunnelEvent {
  action: "value_card_viewed" | "value_reported" | "waitlist_clicked" | "loi_cta_clicked";
  role: Actor;
  proposal_id: string;
  at: string;
}

/** The tester's own answer to "Before Align, how long would getting this decision usually take?". Self-reported, never
 *  a measurement; the measured times come from proposal and acceptance timestamps. */
export interface ValueReport {
  proposal_id: string;
  role: Actor;
  estimate: "same_day" | "two_to_three_days" | "about_a_week" | "longer" | "would_not_be_decided";
  text?: string; // at most 500 characters, cleaned
  at: string;
}

/** A bound on a team's goal. Suggested from what people said (meetings, prompts to agents) or typed by a person;
 *  it is a rule for agents only once that goal's owner confirms it. */
export interface Limit {
  id: string;
  team: Owner; // whose goal it bounds; that team confirms it
  type: "must" | "must_not" | "out_of_scope";
  text: string;
  sources: { kind: "meeting" | "prompt" | "manual"; title: string; date: string; quote: string }[]; // first first
  state: "suggested" | "confirmed" | "dismissed";
  decided?: { by: Actor; at: string };
  flags?: { session: string; sentence: string; at: string }[]; // agent reports that may cross it, found as they arrive
  cleared?: string[]; // agent sessions the owner looked at and found within the limit
  updated_at: string;
}

/** Something one person or group asked of a team, with where it was asked and every later time it came up. */
export interface Ask {
  id: string;
  from: string; // who asked, as people say it: "Faculty", "A labmate", "Lab group"
  to: Owner; // the team it is asked of
  text: string;
  source: { kind: "meeting" | "manual"; title: string; date: string }; // date: YYYY-MM-DD
  status: "open" | "accepted" | "done" | "declined";
  history: { date: string; text: string; source: string }[]; // later meetings that re-raised or changed it
  updated_at: string;
}

export type ScenarioKind = "northstar" | "custom";

export interface ScenarioTeam {
  team: string; // e.g. "Sales"
  lead: string; // person name shown for the slot
}

// No private text here: every signed-in role receives it through viewFor.
export interface ScenarioConfig {
  created_at: string;
  created_by: Actor;
  input_sha256: string;
  dependency_id: string;
  owner_measure_id: string;
  company_measure_id: string;
  unblocks_work_item_id?: string;
  deferred_work_item_id?: string;
  plan_id: string;
  plan_version: number;
  company_note?: string; // shown under the company name in the custom header (setup input company_note)
}

// B1-6: /api/state is a per-role allowlist projection (lib/flow.ts viewFor), never a spread of AppState.
// A field a role may not see is absent. Signed-in view: goals and private constraints filtered to the viewer,
// org_draft for leadership only, ingest_errors with absolute paths stripped.
export interface StateView extends Omit<AppState, "org_draft" | "funnel"> {
  org_draft?: OrgDraft | null;
  funnel?: { reports: ValueReport[] }; // custom: the viewer's own value reports only; funnel events never leave the server
  me: Actor;
}

// B1-6: what an anonymous caller gets. Only the labels the sign-in screen renders (labelsFor); nothing captured,
// no goals, no audit, no draft.
export interface AnonStateView {
  company: string;
  scenario?: ScenarioKind;
  teams?: Record<Owner, ScenarioTeam>;
  company_note?: string; // custom, when set up with one (the sign-in screen shows it); never for Northstar
  me: null;
}

// ---- Org push, goal registry, agent sessions, Jev mappings ----

export interface OrgDraft {
  objective: string;
  success_criteria: string[];
  measures: Measure[];
}

export interface GoalPush {
  id: string;
  goal_id: string;
  version: string;
  pushed_by: Actor; // always "leadership"
  pushed_at: string;
  pushed_to: Actor[];
  registry_version: string;
}

/** One option in the live goal registry. The registry is the enum Jev classifies agent work against. */
export interface RegistryEntry {
  key: string; // stable goal_id, or "none"
  goal_id: string | null;
  version: string | null;
  label: string; // what the classifier reads: objective + measures, truncated
  owner: Owner | null;
  team: string; // "Company" | "Product" | "Security" | "Unassigned"
  org: string;
}

export type SessionOriginKind = "linear" | "github" | "slack" | "align-push" | "ad-hoc";

export interface AgentSession {
  id: string; // `${harness}:${session_id}`
  harness: "claude-code" | "codex";
  session_id: string;
  repo: string;
  branch: string;
  cwd_name: string;
  prompts: { at: string; text: string }[];
  files: string[];
  tools: string[];
  last_message?: string;
  origin: { kind: SessionOriginKind; ref?: string };
  started_at: string;
  last_at: string;
  ended_at?: string;
  directives?: DirectiveDelivery[]; // authority changes pushed into this session
  live?: boolean; // a live hook (not an import) has reported on it: imports can no longer backdate its events
}

export interface DirectiveDelivery {
  event_id: string; // "push:<id>" | "accept:<proposal_id>"
  delivered_at: string;
  acted_at?: string;
}

export type MappingState = "PROPOSED" | "UNASSIGNED" | "CONFIRMED" | "REJECTED" | "MAPPER_UNAVAILABLE" | "PENDING";

export interface SessionMapping {
  session_id: string; // AgentSession.id
  registry_version: string;
  choice: string | null; // registry key
  confidence: number | null;
  probabilities: Record<string, number>;
  conflict?: { probability: number; flagged: boolean };
  state: MappingState;
  model: string | null;
  error?: string;
  mapped_at: string;
  confirmed_by?: Actor;
  confirmed_at?: string;
}
