import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { goalObj, visibleGoal } from "./goals";
import { newId, nowIso } from "./ids";
import { authorize, canReadGoal, type PolicyObject, type PolicyPrincipal } from "./policy";
import { assertRevisionReached, iso, optStr, revisionRead, SESSION_KEY_RE, str, type Body } from "./validate";
import { memberName, memberPrincipal, need } from "./workspaces";
import { noGoalTeamTotals } from "./spend";
import { spendMonth } from "./spend-month";
import { personName } from "./retention-core.mts";
import type { GoalRow } from "./goals";
import { count } from "./plural.mts";

// Monthly planning amounts at list price. No code in this module stops, holds or launches work.
export const BUDGET_NOTE = "All amounts and forecasts are estimates at list price. Work continues when the budget is reached.";
const currentMonth = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);


function teamOf(pp: PolicyPrincipal, team: string) {
  need(pp, "workspace.read");
  const t = get<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, team);
  if (!t) throw notFound();
  return t;
}

/** Keep currency exact in integer microdollars. JSON amounts accept whole cents only. */
function dollars(b: Body, key: string, positive = false) {
  const v = b[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < (positive ? 0.01 : 0) || v > 1_000_000 || Math.abs(v * 100 - Math.round(v * 100)) > Number.EPSILON * Math.max(1, Math.abs(v * 100)) * 2)
    throw badRequest(`${key} must be ${positive ? "positive" : "zero or positive"}, in whole US cents, at most 1,000,000 US dollars`);
  return Math.round(v * 100) * 10_000;
}

interface BudgetRow {
  amount_usd_micros: number;
  allowance_usd_micros: number | null;
  allowance_ceiling_usd_micros: number | null;
  updated_by: string;
  updated_at: string;
}
const budgetOf = (ws: string, team: string, month: string) => get<BudgetRow>("SELECT * FROM v2_team_budgets WHERE ws_id = ? AND pod_id = ? AND month = ?", ws, team, month);

export async function writeBudget(pp: PolicyPrincipal, team: string, month: string | null, body: Body | null) {
  teamOf(pp, team);
  need(pp, "team_budget.manage", { kind: "pod", podId: team });
  const m = spendMonth(month ?? currentMonth());
  const amount = body ? dollars(body, "amount_usd") : null;
  const allowance = body && body.allowance_usd !== undefined && body.allowance_usd !== null ? dollars(body, "allowance_usd") : null;
  const ceiling = body && body.allowance_ceiling_usd !== undefined && body.allowance_ceiling_usd !== null ? dollars(body, "allowance_ceiling_usd") : allowance;
  if (ceiling !== null && allowance === null) throw badRequest("Set an allowance with its monthly ceiling.");
  await tx(() => {
    const at = nowIso();
    const live = memberPrincipal(pp.wsId, pp.userId);
    need(live, "team_budget.manage", { kind: "pod", podId: team });
    if (m.month < currentMonth()) throw conflict("month_closed", "This month has ended. Its budget cannot change.");
    const old = budgetOf(pp.wsId, team, m.month);
    if (!body && !old) return;
    const action = !body ? "removed" : old ? "changed" : "set";
    if (body) run(
      `INSERT INTO v2_team_budgets (ws_id, pod_id, month, amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (ws_id, pod_id, month) DO UPDATE SET
       amount_usd_micros = excluded.amount_usd_micros, allowance_usd_micros = excluded.allowance_usd_micros,
       allowance_ceiling_usd_micros = excluded.allowance_ceiling_usd_micros,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`, pp.wsId, team, m.month, amount, allowance, ceiling, pp.userId, at,
    );
    else run("DELETE FROM v2_team_budgets WHERE ws_id = ? AND pod_id = ? AND month = ?", pp.wsId, team, m.month);
    const id = newId("bh");
    run("INSERT INTO v2_team_budget_history (id, ws_id, pod_id, month, action, amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, pp.wsId, team, m.month, action, amount, allowance, ceiling, pp.userId, at);
    audit(pp.wsId, pp.userId, `team_budget.${action}`, id, at);
  });
  return budgetBurn(memberPrincipal(pp.wsId, pp.userId), team, m.month);
}

const allowanceGranted = (ws: string, team: string, month: string) => get<{ amount: number }>(
  "SELECT COALESCE(SUM(approved_usd_micros), 0) AS amount FROM v2_budget_requests WHERE ws_id = ? AND pod_id = ? AND month = ? AND authority = 'allowance'", ws, team, month,
)!.amount;

interface BurnSum { priced: number; unpriced: number; no_goal_priced: number; no_goal_unpriced: number }

/** The only team usage read. It returns aggregates, never any goal, person or session identifier. */
function teamSums(ws: string, team: string, from: string, to: string): BurnSum {
  const live = get<BurnSum>(
    `SELECT COALESCE(SUM(u.est_list_usd_micros), 0) AS priced,
       COALESCE(SUM(u.est_list_usd_micros IS NULL), 0) AS unpriced,
       0 AS no_goal_priced, 0 AS no_goal_unpriced
     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     LEFT JOIN v2_goals g ON g.ws_id = e.ws_id AND g.id = e.goal_id
     WHERE u.ws_id = ? AND u.ts >= ? AND u.ts < ? AND g.pod_id = ?`,
    ws, from, to, team,
  )!;
  const goalRoll = get<{ priced: number; unpriced: number }>(
    `SELECT COALESCE(SUM(r.est_list_usd_micros), 0) AS priced, COALESCE(SUM(r.unpriced_requests), 0) AS unpriced
     FROM v2_spend_rollups r JOIN v2_goals g ON g.ws_id = r.ws_id AND g.id = r.goal_id
     WHERE r.ws_id = ? AND g.pod_id = ? AND r.day || 'T00:00:00.000Z' >= ? AND r.day || 'T00:00:00.000Z' < ?`, ws, team, from, to,
  )!;
  const noGoal = noGoalTeamTotals(ws, from, to, team)[0];
  return { priced: live.priced + goalRoll.priced + (noGoal?.est_list_usd_micros ?? 0), unpriced: live.unpriced + goalRoll.unpriced + (noGoal?.unpriced_requests ?? 0),
    no_goal_priced: noGoal?.est_list_usd_micros ?? 0, no_goal_unpriced: noGoal?.unpriced_requests ?? 0 };
}

export function budgetBurn(pp: PolicyPrincipal, teamId: string, month?: string | null, now = Date.now()) {
  need(pp, "spend.read");
  const team = teamOf(pp, teamId);
  if (pp.wsRole !== "owner" && !pp.pods.has(teamId)) throw notFound();
  const m = spendMonth(month ?? currentMonth(now));
  const asOf = Math.max(m.start, Math.min(now, m.end));
  const sums = teamSums(pp.wsId, team.id, m.from, new Date(asOf).toISOString());
  const unattributed = get<{ n: number; unpriced: number }>(
    `SELECT COALESCE(SUM(requests - team_attributed_requests), 0) AS n,
       COALESCE(SUM(unpriced_requests - team_attributed_unpriced_requests), 0) AS unpriced FROM v2_spend_rollups
     WHERE ws_id = ? AND goal_id = '' AND day || 'T00:00:00.000Z' >= ? AND day || 'T00:00:00.000Z' < ?`, pp.wsId, m.from, new Date(asOf).toISOString(),
  )!;
  const e = budgetOf(pp.wsId, team.id, m.month);
  const usedAllowance = allowanceGranted(pp.wsId, team.id, m.month);
  const grants = all<{ approved_usd_micros: number; expires_at: string }>(
    "SELECT approved_usd_micros, expires_at FROM v2_budget_requests WHERE ws_id = ? AND pod_id = ? AND month = ? AND state = 'granted' AND expires_at > ? ORDER BY expires_at", pp.wsId, team.id, m.month, new Date(now).toISOString(),
  );
  const effective = e ? e.amount_usd_micros + grants.reduce((n, g) => n + g.approved_usd_micros, 0) : null;
  const complete = sums.unpriced === 0 && unattributed.n === 0;
  const elapsed = asOf - m.start;
  const attributed = unattributed.n === 0;
  const spendBound = !attributed ? "unknown" as const : sums.unpriced ? "lower" as const : "exact" as const;
  const remaining = attributed && effective !== null ? effective - sums.priced : null;
  const forecast = attributed && elapsed > 0 ? (complete ? Math.round : Math.floor)(sums.priced * ((m.end - m.start) / elapsed)) : null;
  let runsOut: number | null = null;
  if (complete && effective !== null && sums.priced > 0 && elapsed > 0) {
    const rate = sums.priced / elapsed;
    let cap = effective;
    let floor = m.start;
    // An expiry can bring the projected crossing forward. Candidate dates remain projections, never observations.
    for (const g of grants) {
      const expiry = Date.parse(g.expires_at);
      const candidate = Math.max(floor, m.start + cap / rate);
      if (candidate <= expiry) { runsOut = candidate; break; }
      cap -= g.approved_usd_micros;
      floor = expiry;
    }
    if (runsOut === null) runsOut = Math.max(floor, m.start + cap / rate);
    if (runsOut >= m.end) runsOut = null;
  }
  const people = new Map(all<{ id: string; name: string }>(`SELECT id, name FROM ba_user WHERE id IN (SELECT actor_id FROM v2_team_budget_history WHERE ws_id = ? AND pod_id = ? AND month = ? UNION SELECT updated_by FROM v2_team_budgets WHERE ws_id = ? AND pod_id = ? AND month = ?)`, pp.wsId, team.id, m.month, pp.wsId, team.id, m.month).map((p) => [p.id, p.name]));
  const person = (id: string) => ({ id, name: personName(id, people.get(id)) });
  const history = all<{ id: string; action: string; amount_usd_micros: number | null; allowance_usd_micros: number | null; allowance_ceiling_usd_micros: number | null; actor_id: string; at: string }>(
    "SELECT id, action, amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, actor_id, at FROM v2_team_budget_history WHERE ws_id = ? AND pod_id = ? AND month = ? ORDER BY at, rowid", pp.wsId, team.id, m.month,
  ).map(({ actor_id, ...h }) => ({ ...h, actor: person(actor_id) }));
  return {
    team, month: m.month, from: m.from, to: m.to, as_of: new Date(asOf).toISOString(), note: BUDGET_NOTE,
    budget: e ? { amount_usd_micros: e.amount_usd_micros, allowance_usd_micros: e.allowance_usd_micros, allowance_ceiling_usd_micros: e.allowance_ceiling_usd_micros, updated_by: person(e.updated_by), updated_at: e.updated_at } : null,
    allowance_granted_usd_micros: usedAllowance,
    allowance_remaining_usd_micros: e?.allowance_ceiling_usd_micros == null ? null : Math.max(0, e.allowance_ceiling_usd_micros - usedAllowance),
    effective_budget_usd_micros: effective, priced_spend_usd_micros: sums.priced,
    estimated_spend_usd_micros: attributed ? sums.priced : null, spend_bound: spendBound,
    remaining_usd_micros: remaining, remaining_bound: remaining === null ? null : complete ? "exact" as const : "upper" as const,
    forecast_bound: forecast === null ? null : complete ? "exact" as const : "lower" as const,
    pricing_note: !attributed ? "Team attribution is incomplete. Complete spend, remaining and forecast are unknown; the priced subtotal is only the known amount." : sums.unpriced ?
      `${count(sums.unpriced, "unpriced request")} excluded. Spend and forecast are at least the priced estimates. Remaining, when shown, is at most its displayed estimate.` : "All requests in this total have prices.",
    forecast_usd_micros: forecast, runs_out_at: runsOut === null ? null : new Date(Math.ceil(runsOut)).toISOString(),
    unpriced_requests: unattributed.n ? null : sums.unpriced, known_unpriced_requests: sums.unpriced,
    no_goal: { priced_spend_usd_micros: sums.no_goal_priced, estimated_spend_usd_micros: attributed ? sums.no_goal_priced : null,
      spend_bound: !attributed ? "unknown" as const : sums.no_goal_unpriced ? "lower" as const : "exact" as const,
      unpriced_requests: unattributed.n ? null : sums.no_goal_unpriced, known_unpriced_requests: sums.no_goal_unpriced, share_percent: complete && sums.priced > 0 ? Math.round(sums.no_goal_priced / sums.priced * 1000) / 10 : null,
      attribution_unknown: unattributed.n > 0, unattributed_rolled_up_requests: unattributed.n, unattributed_rolled_up_unpriced_requests: unattributed.unpriced },
    history, can: { manage: m.month >= currentMonth(now) && authorize(pp, "team_budget.manage", { kind: "pod", podId: team.id }).ok,
      request: !!e && m.month === currentMonth(now) && authorize(pp, "budget_request.create", { kind: "pod", podId: team.id }).ok },
  };
}
export type BudgetBurn = ReturnType<typeof budgetBurn>;

interface RequestRow {
  id: string; ws_id: string; pod_id: string; month: string; requester_id: string; filed_from: "browser" | "terminal";
  state: "waiting" | "granted" | "declined" | "withdrawn"; revision: number;
  amount_usd_micros: number; reason: string; goal_id: string | null;
  approved_usd_micros: number | null; authority: "allowance" | "approver" | null; expires_at: string | null;
  requested_session_count: number; second_look: number; created_at: string; updated_at: string;
}
interface DecisionRow { round: number; decision: "granted" | "declined"; actor_id: string; amount_usd_micros: number | null; expires_at: string | null; note: string | null; at: string }
const requestOf = (ws: string, id: string) => get<RequestRow>("SELECT * FROM v2_budget_requests WHERE ws_id = ? AND id = ?", ws, id);
const decisionsOf = (id: string) => all<DecisionRow>("SELECT round, decision, actor_id, amount_usd_micros, expires_at, note, at FROM v2_budget_request_decisions WHERE request_id = ? ORDER BY round", id);
const objectOf = (r: RequestRow, decisions = decisionsOf(r.id)): PolicyObject => ({ kind: "budget_request", podId: r.pod_id, requesterId: r.requester_id, secondLook: !!r.second_look, firstDeciderId: decisions[0]?.actor_id ?? null });
const stateOf = (r: RequestRow, now = Date.now()) =>
  r.state === "granted" && Date.parse(r.expires_at!) <= now || r.state === "waiting" && spendMonth(r.month).end <= now ? "expired" as const : r.state;

/** Say what happened and who did it, with "you" to the actor, as asks and change requests do. */
function stateRefusal(r: RequestRow, reader: string, decisions = decisionsOf(r.id), name = memberName): string {
  const d = decisions.at(-1);
  const by = d ? ` by ${name(d.actor_id)}` : "";
  switch (stateOf(r)) {
    case "waiting": return r.second_look ? "This request already waits for a second look by another owner." : "This request waits for a decision.";
    case "granted": return r.authority === "allowance" ? "This request was recorded under the team's allowance." : d?.actor_id === reader ? "You already granted this request." : `This request was already granted${by}.`;
    case "declined": return d?.actor_id === reader ? "You declined this request, so nothing changes." : `This request was declined${by}, so nothing changes.`;
    case "withdrawn": return r.requester_id === reader ? "You withdrew this request, so nothing changes." : `This request was withdrawn by ${name(r.requester_id)}, so nothing changes.`;
    case "expired": return r.state === "granted" ? "The grant on this request expired, so it adds nothing to the budget." : "This request expired at the end of its month without a grant.";
  }
}

function visibleRequest(pp: PolicyPrincipal, id: string) {
  const r = requestOf(pp.wsId, id);
  if (!r) throw notFound();
  need(pp, "budget_request.read", objectOf(r));
  return r;
}

/** All references for one page, loaded in sets before mapping records. */
function requestRefs(pp: PolicyPrincipal, rows: RequestRow[]) {
  const ids = rows.map((r) => r.id), marks = ids.map(() => "?").join(",") || "NULL";
  const decisions = all<DecisionRow & { request_id: string }>(`SELECT request_id, round, decision, actor_id, amount_usd_micros, expires_at, note, at FROM v2_budget_request_decisions WHERE request_id IN (${marks}) ORDER BY round`, ...ids);
  const sessions = all<{ request_id: string; session_key: string }>(`SELECT request_id, session_key FROM v2_budget_request_sessions WHERE request_id IN (${marks}) ORDER BY session_key`, ...ids);
  const teams = new Map(all<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ?", pp.wsId).map((r) => [r.id, r]));
  const goals = new Map(all<GoalRow>(`SELECT * FROM v2_goals WHERE ws_id = ? AND id IN (SELECT goal_id FROM v2_budget_requests WHERE id IN (${marks}))`, pp.wsId, ...ids).map((r) => [r.id, r]));
  const members = all<{ id: string; name: string; role: string; pod_id: string | null; team_role: string | null }>(`SELECT m.user_id AS id, u.name, m.role, pm.pod_id, pm.role AS team_role FROM v2_members m JOIN ba_user u ON u.id = m.user_id LEFT JOIN v2_pod_members pm ON pm.ws_id = m.ws_id AND pm.user_id = m.user_id WHERE m.ws_id = ?`, pp.wsId);
  const people = new Map(all<{ id: string; name: string }>(`SELECT id, name FROM ba_user WHERE id IN (SELECT requester_id FROM v2_budget_requests WHERE id IN (${marks})) OR id IN (SELECT actor_id FROM v2_budget_request_decisions WHERE request_id IN (${marks}))`, ...ids, ...ids).map((r) => [r.id, r.name]));
  return { decisions, sessions, teams, goals, members, person: (id: string) => ({ id, name: personName(id, people.get(id)) }) };
}
type RequestRefs = ReturnType<typeof requestRefs>;
function eligibleApprovers(r: RequestRow, second = !!r.second_look, refs?: RequestRefs) {
  if (!refs) refs = requestRefs(memberPrincipal(r.ws_id, r.requester_id), [r]);
  const first = second ? refs.decisions.find((d) => d.request_id === r.id && d.round === 1)?.actor_id : null;
  return [...new Map(refs.members.filter((m) => m.role !== "viewer" && m.id !== r.requester_id && (!second || m.id !== first) && (m.role === "owner" || !second && m.pod_id === r.pod_id && m.team_role === "lead")).map((m) => [m.id, { id: m.id, name: m.name }])).values()].sort((a, b) => a.id.localeCompare(b.id));
}
const NO_SECOND_OWNER = "No other workspace owner is eligible to decide a second look. The requester and first decider cannot decide it.";
function requestView(pp: PolicyPrincipal, r: RequestRow, refs = requestRefs(pp, [r])) {
  const decisions = refs.decisions.filter((d) => d.request_id === r.id).map((d): DecisionRow => ({ round: d.round, decision: d.decision, actor_id: d.actor_id, amount_usd_micros: d.amount_usd_micros, expires_at: d.expires_at, note: d.note, at: d.at }));
  const o = objectOf(r, decisions), state = stateOf(r), waiting = state === "waiting";
  const mayDecide = authorize(pp, "budget_request.decide", o).ok;
  const goal = r.goal_id ? refs.goals.get(r.goal_id) : null, readable = goal && canReadGoal(pp, goalObj(goal));
  const approvers = eligibleApprovers(r, !!r.second_look, refs);
  const secondLookReason = r.second_look ? "This request already had its second look." : r.month !== currentMonth() ? "This month has ended, so a second look is unavailable." : state === "declined" && !eligibleApprovers(r, true, refs).length ? NO_SECOND_OWNER : null;
  return {
    id: r.id, team: refs.teams.get(r.pod_id)!, month: r.month, revision: r.revision, state, state_note: stateRefusal(r, pp.userId, decisions, (id) => refs.person(id).name),
    requester: refs.person(r.requester_id), filed_from: r.filed_from, amount_usd_micros: r.amount_usd_micros, reason: r.reason,
    goal: readable ? { id: goal.id, title: goal.title } : null, goal_hidden: !!r.goal_id && !readable,
    session_count: r.requested_session_count, session_keys: r.requester_id === pp.userId ? refs.sessions.filter((s) => s.request_id === r.id).map((s) => s.session_key) : [],
    approved_usd_micros: r.approved_usd_micros, authority: r.authority,
    authority_label: r.authority === "allowance" ? "This request was recorded under the team's allowance." : r.authority === "approver" ? "This request was granted by an approver." : null,
    expires_at: r.expires_at, second_look: !!r.second_look,
    decisions: decisions.map(({ actor_id, ...d }) => ({ ...d, actor: refs.person(actor_id) })), approvers, waiting_on_me: waiting && mayDecide,
    decision_unavailable_reason: waiting && !approvers.length ? r.second_look ? NO_SECOND_OWNER : "Nobody is eligible to decide this request. A different team lead or workspace owner is needed. The requester cannot decide it." : null,
    second_look_unavailable_reason: secondLookReason,
    can: { approve: waiting && mayDecide, decline: waiting && mayDecide, withdraw: waiting && authorize(pp, "budget_request.withdraw", o).ok, second_look: state === "declined" && !secondLookReason && authorize(pp, "budget_request.second_look", o).ok },
    created_at: r.created_at, updated_at: r.updated_at,
  };
}
const requestViews = (pp: PolicyPrincipal, rows: RequestRow[]) => {
  const refs = requestRefs(pp, rows);
  return rows.filter((r) => authorize(pp, "budget_request.read", objectOf(r, refs.decisions.filter((d) => d.request_id === r.id))).ok).map((r) => requestView(pp, r, refs));
};
export type BudgetRequestView = ReturnType<typeof requestView>;
export const getBudgetRequest = (pp: PolicyPrincipal, id: string) => requestView(pp, visibleRequest(pp, id));

export function listBudgetRequests(pp: PolicyPrincipal, team?: string, month?: string | null, options: { limit?: string | null; cursor?: string | null } = {}) {
  need(pp, "workspace.read");
  if (team) { teamOf(pp, team); if (pp.wsRole !== "owner" && !pp.pods.has(team)) throw notFound(); }
  const m = spendMonth(month ?? currentMonth()).month;
  const limit = options.limit == null ? 50 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest("Choose between 1 and 100 requests.");
  const visible = (r: RequestRow) => r.requester_id === pp.userId || pp.wsRole === "owner" || pp.pods.has(r.pod_id);
  const cursor = options.cursor ? requestOf(pp.wsId, options.cursor) : null;
  if (options.cursor && (!cursor || cursor.month !== m || team && cursor.pod_id !== team || !visible(cursor))) throw badRequest("This page link is invalid. Start from the first page.");
  const teams = [...pp.pods.keys()], marks = teams.map(() => "?").join(",") || "NULL";
  const selected = all<RequestRow>(`SELECT * FROM v2_budget_requests WHERE ws_id = ? AND month = ? AND (? IS NULL OR pod_id = ?) AND (? = 'owner' OR requester_id = ? OR pod_id IN (${marks})) AND (? IS NULL OR updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?`, pp.wsId, m, team ?? null, team ?? null, pp.wsRole, pp.userId, ...teams, cursor?.id ?? null, cursor?.updated_at ?? null, cursor?.updated_at ?? null, cursor?.id ?? null, limit + 1);
  const page = selected.slice(0, limit), rows = requestViews(pp, page);
  return { waiting_on_me: rows.filter((r) => r.waiting_on_me), mine: rows.filter((r) => r.requester.id === pp.userId), others: rows.filter((r) => !r.waiting_on_me && r.requester.id !== pp.userId), next_cursor: selected.length > limit ? page.at(-1)!.id : null };
}

/** Home's bounded read. Reject irrelevant history in SQL before loading any record references or approvers. */
export function homeBudgetRequests(pp: PolicyPrincipal) {
  need(pp, "workspace.read");
  const month = currentMonth();
  const previous = new Date(`${month}-01T00:00:00.000Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const rows = all<RequestRow>(
    `SELECT r.* FROM v2_budget_requests r
     LEFT JOIN v2_budget_request_decisions d ON d.request_id = r.id AND d.round = 1
     WHERE r.ws_id = ? AND r.month >= ? AND r.month <= ? AND
       (r.requester_id = ? OR (r.month = ? AND r.state = 'waiting' AND r.requester_id != ? AND ? != 'viewer' AND
         ((r.second_look = 1 AND ? = 'owner' AND d.actor_id != ?) OR
          (r.second_look = 0 AND (? = 'owner' OR EXISTS (SELECT 1 FROM v2_pod_members pm
             WHERE pm.ws_id = r.ws_id AND pm.pod_id = r.pod_id AND pm.user_id = ? AND pm.role = 'lead'))))))
     ORDER BY r.updated_at DESC, r.id DESC LIMIT 101`, pp.wsId, previous.toISOString().slice(0, 7), month,
    pp.userId, month, pp.userId, pp.wsRole, pp.wsRole, pp.userId, pp.wsRole, pp.userId,
  );
  const page = requestViews(pp, rows.slice(0, 100));
  return { waiting_on_me: page.filter((r) => r.waiting_on_me), mine: page.filter((r) => r.requester.id === pp.userId), next_cursor: rows.length > 100 ? rows[99].id : null };
}

function waitingRoom(pp: PolicyPrincipal, team: string, month: string) {
  const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_budget_requests WHERE ws_id = ? AND pod_id = ? AND requester_id = ? AND month = ? AND state = 'waiting'", pp.wsId, team, pp.userId, month)!.n;
  if (n >= 5) throw conflict("too_many_waiting_requests", "You already have five budget requests waiting for this team this month. Wait for a decision or withdraw one before asking again.");
}

export async function createBudgetRequest(pp: PolicyPrincipal, team: string, b: Body, filedFrom: "browser" | "terminal") {
  teamOf(pp, team);
  need(pp, "budget_request.create", { kind: "pod", podId: team });
  const amount = dollars(b, "amount_usd", true);
  const reason = str(b, "reason", 1000);
  const goalId = b.goal_id === undefined || b.goal_id === null ? null : visibleGoal(pp, typeof b.goal_id === "string" ? b.goal_id : "").id;
  const keys = b.session_keys ?? [];
  if (!Array.isArray(keys) || keys.length > 50 || keys.some((k) => typeof k !== "string" || !SESSION_KEY_RE.test(k)) || new Set(keys).size !== keys.length)
    throw badRequest("session_keys must list at most 50 distinct session keys");
  const id = newId("br");
  await tx(() => {
    const live = memberPrincipal(pp.wsId, pp.userId);
    need(live, "budget_request.create", { kind: "pod", podId: team });
    if (goalId) visibleGoal(live, goalId);
    if (keys.length && get<{ n: number }>(`SELECT COUNT(*) AS n FROM v2_sessions WHERE ws_id = ? AND user_id = ? AND state = 'shared' AND session_key IN (${keys.map(() => "?").join(",")})`, pp.wsId, pp.userId, ...keys)!.n !== keys.length) throw notFound();
    const at = nowIso();
    const m = spendMonth(currentMonth());
    const e = budgetOf(pp.wsId, team, m.month);
    if (!e) throw conflict("budget_missing", "This team has no budget for this month.");
    const granted = filedFrom === "browser" && e.allowance_usd_micros !== null && amount <= e.allowance_usd_micros &&
      e.allowance_ceiling_usd_micros !== null && allowanceGranted(pp.wsId, team, m.month) + amount <= e.allowance_ceiling_usd_micros;
    if (!granted) waitingRoom(pp, team, m.month);
    run(`INSERT INTO v2_budget_requests (id, ws_id, pod_id, month, requester_id, filed_from, state, amount_usd_micros, reason, goal_id,
      approved_usd_micros, authority, expires_at, created_at, updated_at, requested_session_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, pp.wsId, team, m.month, pp.userId, filedFrom, granted ? "granted" : "waiting", amount, reason, goalId,
      granted ? amount : null, granted ? "allowance" : null, granted ? m.to : null, at, at, keys.length);
    for (const key of keys) run("INSERT INTO v2_budget_request_sessions (ws_id, request_id, session_key) VALUES (?, ?, ?)", pp.wsId, id, key);
    audit(pp.wsId, pp.userId, "budget_request.requested", id, at);
    if (granted) audit(pp.wsId, pp.userId, "budget_request.allowance_granted", id, at);
  });
  return getBudgetRequest(memberPrincipal(pp.wsId, pp.userId), id);
}

export const BUDGET_ACTIONS = ["approve", "decline", "withdraw", "second-look"] as const;
export type BudgetAction = typeof BUDGET_ACTIONS[number];
export function budgetAction(v: string): BudgetAction {
  if (!(BUDGET_ACTIONS as readonly string[]).includes(v)) throw notFound();
  return v as BudgetAction;
}

export async function actOnBudgetRequest(pp: PolicyPrincipal, id: string, action: BudgetAction, b: Body) {
  visibleRequest(pp, id);
  const revision = revisionRead(b);
  await tx(() => {
    const live = memberPrincipal(pp.wsId, pp.userId);
    const r = visibleRequest(live, id);
    assertRevisionReached("request", revision, r.revision);
    if (revision !== r.revision) throw conflict("stale_revision", `This request changed after you read it: it is now at revision ${r.revision}. Read it again and decide again.`);
    const policy = action === "approve" || action === "decline" ? "budget_request.decide" : action === "withdraw" ? "budget_request.withdraw" : "budget_request.second_look";
    need(live, policy, objectOf(r));
    const state = stateOf(r);
    const second = action === "second-look";
    if (second ? state !== "declined" || !!r.second_look || r.month !== currentMonth() : state !== "waiting")
      throw conflict("wrong_state", stateRefusal(r, pp.userId));
    if (second && !eligibleApprovers(r, true).length) throw conflict("no_eligible_approver", NO_SECOND_OWNER);
    if (second) waitingRoom(live, r.pod_id, r.month);
    const at = nowIso();
    let event: string;
    if (action === "approve" || action === "decline") {
      const amount = action === "approve" ? dollars(b, "amount_usd", true) : null;
      const expiry = action === "approve" ? iso(b, "expires_at") : null;
      const note = action === "decline" ? str(b, "reason", 1000) : optStr(b, "note", 1000);
      if (amount !== null && amount > r.amount_usd_micros) throw badRequest("The granted amount cannot exceed the amount asked for.");
      if (expiry && (expiry <= at || Date.parse(expiry) > spendMonth(r.month).end)) throw badRequest("Expiry must be after now and no later than the end of this UTC month.");
      const next = action === "approve" ? "granted" : "declined";
      run("INSERT INTO v2_budget_request_decisions (ws_id, request_id, round, decision, actor_id, amount_usd_micros, expires_at, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", pp.wsId, id, r.second_look ? 2 : 1, next, pp.userId, amount, expiry, note, at);
      run("UPDATE v2_budget_requests SET state = ?, approved_usd_micros = ?, authority = ?, expires_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?", next, amount, action === "approve" ? "approver" : null, expiry, at, id);
      event = action === "approve" ? "approved" : "declined";
    } else {
      run("UPDATE v2_budget_requests SET state = ?, second_look = ?, revision = revision + 1, updated_at = ? WHERE id = ?", second ? "waiting" : "withdrawn", second ? 1 : r.second_look, at, id);
      event = second ? "second_look" : "withdrawn";
    }
    audit(pp.wsId, pp.userId, `budget_request.${event}`, id, at);
  });
  return getBudgetRequest(memberPrincipal(pp.wsId, pp.userId), id);
}
