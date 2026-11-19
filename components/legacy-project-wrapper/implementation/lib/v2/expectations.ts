import { approvalSet } from "./approval";
import { OUTCOMES } from "./core.mts";
import { all, audit, get, run } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { httpsEvidenceUrl } from "./evidence";
import { goalObj, goalRow, type GoalRow, type Measure } from "./goals";
import { nowIso } from "./ids";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { oneOf, optStr, str, type Body } from "./validate";
import { memberName } from "./workspaces";

const DAY_MS = 24 * 60 * 60 * 1000;
type Outcome = (typeof OUTCOMES)[number];

interface ExpectationRow {
  change_request_id: string;
  ws_id: string;
  goal_id: string;
  goal_version: number;
  measure_id: string;
  measure_text: string;
  expected: string;
  due_on: string;
  evidence: string | null;
  assignee_id: string;
  created_at: string;
}

interface OutcomeRow {
  answer: number;
  outcome: Outcome;
  note: string | null;
  evidence_url: string | null;
  reported_by: string;
  reported_at: string;
}

const person = (id: string) => ({ id, name: memberName(id) });
const expectationOf = (ws: string, id: string) =>
  get<ExpectationRow>("SELECT * FROM v2_expectations WHERE ws_id = ? AND change_request_id = ?", ws, id);
const latestOutcome = (ws: string, id: string) =>
  get<OutcomeRow>("SELECT * FROM v2_outcome_reports WHERE ws_id = ? AND change_request_id = ? ORDER BY answer DESC LIMIT 1", ws, id);

export function expectationInput(value: unknown, measures: Measure[], at: string) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Expectation must be an object.");
  const b = value as Body;
  const measure = measures.find((m) => m.id === b.measure_id);
  if (!measure) throw badRequest("Choose a measure from the version being launched.");
  const due_on = b.due_on;
  const date = typeof due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due_on) ? Date.parse(due_on) : NaN;
  const today = at.slice(0, 10);
  if (typeof due_on !== "string" || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== due_on)
    throw badRequest("Enter a real due date.");
  if (due_on < today || date - Date.parse(today) > 366 * DAY_MS)
    throw badRequest("Choose a due date from today through 366 days from now.");
  return { measure, expected: str(b, "expected", 200), due_on, evidence: optStr(b, "evidence", 280) };
}

export function recordExpectation(pp: PolicyPrincipal, g: GoalRow, id: string, input: NonNullable<ReturnType<typeof expectationInput>>, at: string) {
  const first = !get("SELECT 1 FROM v2_expectations WHERE ws_id = ? LIMIT 1", pp.wsId);
  run(
    `INSERT INTO v2_expectations (change_request_id, ws_id, goal_id, goal_version, measure_id, measure_text, expected, due_on, evidence, assignee_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, pp.wsId, g.id, g.version, input.measure.id, input.measure.text, input.expected, input.due_on, input.evidence, pp.userId, at,
  );
  audit(pp.wsId, pp.userId, "change_request.expectation_recorded", id, at);
  if (first) event("first_expectation", { ws: pp.wsId, user: pp.userId, at });
}

function mayAnswer(pp: PolicyPrincipal, g: GoalRow, assignee: string) {
  if (!pp.wsRole || pp.wsRole === "viewer") return false;
  if (pp.userId === assignee) return true;
  const stillHere = get("SELECT 1 FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, assignee);
  return !stillHere && approvalSet(g).includes(pp.userId);
}

function mayCorrect(pp: PolicyPrincipal, outcome: OutcomeRow, at: string) {
  return !!pp.wsRole && pp.wsRole !== "viewer" && outcome.answer === 1 && outcome.reported_by === pp.userId
    && Date.parse(at) <= Date.parse(outcome.reported_at) + 7 * DAY_MS;
}

export function expectationView(pp: PolicyPrincipal, g: GoalRow, id: string) {
  const row = expectationOf(pp.wsId, id);
  if (!row) return null;
  const latest = latestOutcome(pp.wsId, id);
  return {
    goal_version: row.goal_version,
    measure_id: row.measure_id,
    measure_text: row.measure_text,
    expected: row.expected,
    due_on: row.due_on,
    evidence: row.evidence,
    assignee: person(row.assignee_id),
    created_at: row.created_at,
    outcome: latest ? {
      outcome: latest.outcome,
      note: latest.note,
      evidence_url: latest.evidence_url,
      reported_by: person(latest.reported_by),
      reported_at: latest.reported_at,
    } : null,
    can_answer: !latest && mayAnswer(pp, g, row.assignee_id),
    can_correct: !!latest && mayCorrect(pp, latest, nowIso()),
  };
}
export type ExpectationView = NonNullable<ReturnType<typeof expectationView>>;

/** The caller checks request visibility and runs this inside a transaction. */
export function recordOutcome(pp: PolicyPrincipal, g: GoalRow, id: string, b: Body, at: string) {
  const expectation = expectationOf(pp.wsId, id);
  if (!expectation) throw notFound();
  if (pp.wsRole === "viewer") throw forbidden("read_only", "Viewers can look but not change anything.");
  const previous = latestOutcome(pp.wsId, id);
  if (b.correction !== undefined && typeof b.correction !== "boolean") throw badRequest("Correction must be true or false.");
  if (b.correction) {
    if (!previous) throw conflict("no_outcome", "There is no answer to correct.");
    if (previous.reported_by !== pp.userId) throw forbidden("not_reporter", "Only the person who answered can correct it.");
    if (!mayCorrect(pp, previous, at)) throw conflict("correction_closed", "This answer can no longer be corrected.");
  } else {
    if (!mayAnswer(pp, g, expectation.assignee_id)) throw forbidden("not_assignee", "Only the person responsible for this expectation can answer.");
    if (previous) throw conflict("already_answered", "This expectation already has an answer.");
  }
  const outcome = oneOf(b, "outcome", OUTCOMES);
  const note = optStr(b, "note", 280);
  const evidenceUrl = b.evidence_url === undefined || b.evidence_url === null ? null : httpsEvidenceUrl(b, "evidence_url");
  run(
    `INSERT INTO v2_outcome_reports (ws_id, change_request_id, answer, outcome, note, evidence_url, reported_by, reported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    pp.wsId, id, b.correction ? 2 : 1, outcome, note, evidenceUrl, pp.userId, at,
  );
  audit(pp.wsId, pp.userId, b.correction ? "change_request.outcome_corrected" : "change_request.outcome_reported", id, at);
  event("outcome_reported", { ws: pp.wsId, user: pp.userId, props: { outcome }, at });
}

export function dueExpectations(pp: PolicyPrincipal) {
  if (!pp.wsRole || pp.wsRole === "viewer") return [];
  const today = nowIso().slice(0, 10);
  const rows = all<Pick<ExpectationRow, "change_request_id" | "goal_id" | "measure_text" | "expected" | "due_on">>(
    `SELECT e.change_request_id, e.goal_id, e.measure_text, e.expected, e.due_on
     FROM v2_expectations e
     WHERE e.ws_id = ? AND e.assignee_id = ? AND e.due_on <= ?
       AND NOT EXISTS (SELECT 1 FROM v2_outcome_reports o WHERE o.change_request_id = e.change_request_id)
     ORDER BY e.due_on, e.change_request_id`,
    pp.wsId, pp.userId, today,
  );
  return rows.flatMap((row) => {
    const g = goalRow(pp.wsId, row.goal_id);
    if (!g || !canReadGoal(pp, goalObj(g))) return [];
    return [{
      ...row,
      goal: { id: g.id, title: g.title },
      days_due: (Date.parse(today) - Date.parse(row.due_on)) / DAY_MS,
      evidence_class: "self_reported" as const,
      next: "report_outcome" as const,
      waiting_on: [person(pp.userId)],
    }];
  });
}
export type DueExpectation = ReturnType<typeof dueExpectations>[number];

/** Unlike Home's waiting-on-me list, the brief covers every readable goal. */
export function readableDueExpectations(pp: PolicyPrincipal) {
  const today = nowIso().slice(0, 10);
  const rows = all<Pick<ExpectationRow, "change_request_id" | "goal_id" | "measure_id" | "measure_text" | "expected" | "due_on">>(
    `SELECT e.change_request_id, e.goal_id, e.measure_id, e.measure_text, e.expected, e.due_on
     FROM v2_expectations e WHERE e.ws_id = ? AND e.due_on <= ?
       AND NOT EXISTS (SELECT 1 FROM v2_outcome_reports o WHERE o.change_request_id = e.change_request_id)
     ORDER BY e.due_on, e.change_request_id`, pp.wsId, today,
  );
  return rows.flatMap((row) => {
    const goal = goalRow(pp.wsId, row.goal_id);
    return goal && canReadGoal(pp, goalObj(goal)) ? [{ ...row, goal_title: goal.title }] : [];
  });
}

/** Review the outcome without returning the assignee, reporter or their notes. */
export function expectationsForGoalReview(ws: string, today: string) {
  return all<{ goal_id: string; change_request_id: string; measure_text: string; due_on: string; outcome: "not_met" | null }>(
    `SELECT e.goal_id, e.change_request_id, e.measure_text, e.due_on, o.outcome
     FROM v2_expectations e
     LEFT JOIN v2_outcome_reports o ON o.ws_id = e.ws_id AND o.change_request_id = e.change_request_id
       AND o.answer = (SELECT MAX(answer) FROM v2_outcome_reports WHERE change_request_id = e.change_request_id)
     WHERE e.ws_id = ? AND (o.outcome = 'not_met' OR (o.outcome IS NULL AND e.due_on <= ?))
     ORDER BY e.due_on, e.change_request_id`,
    ws, today,
  );
}
