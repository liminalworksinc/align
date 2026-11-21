import { all, get } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";
import type { EpochOrigin } from "./epoch-origin.mts";

// Spend: token sums by basis and estimated list cost, per goal, team or session. Each request counts under the
// goal of the epoch it was uploaded with (history never moves); requests in epochs with no goal are unallocated.
// Invariant: total = sum of rows + unallocated, for every number.
// Privacy: a goal the caller can't see (another person's private goal, another team's goal) is never named; its
// usage sits in one unnamed "private" row. by=session names only the caller's own sessions; everyone else's are one
// "other people's sessions" row. No per-person view exists.
// Sessions older than 13 months are rolled up (lib/v2/retention.ts) into v2_spend_rollups: per goal, UTC day, model
// and basis, with no person or session. Their totals still count by goal and team (a day counts when its start is in
// [from, to)); by=session they are one "Older sessions (rolled up)" row.

const BASES = ["api_usd", "subscription_included", "workspace_credits", "estimated_list_usd", "unknown"] as const;
type Basis = (typeof BASES)[number];
const NUMS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "est_list_usd_micros", "unpriced_requests"] as const;
type Num = (typeof NUMS)[number];
export type Sums = Record<Num, number> & { by_basis: Record<Basis, Record<Num, number>> };

const zero = (): Record<Num, number> => Object.fromEntries(NUMS.map((k) => [k, 0])) as Record<Num, number>;
const emptySums = (): Sums => ({ ...zero(), by_basis: Object.fromEntries(BASES.map((b) => [b, zero()])) as Record<Basis, Record<Num, number>> });

interface Agg extends Record<Num, number> {
  goal_id: string | null;
  session_key: string;
  session_owner: string;
  basis: Basis;
}

export type OriginSpend = Pick<Agg, "requests" | "est_list_usd_micros" | "unpriced_requests"> & {
  origin: EpochOrigin | null;
  rolled_up: boolean;
};

function add(s: Sums, a: Pick<Agg, Num | "basis">) {
  const b = BASES.includes(a.basis) ? a.basis : "unknown";
  for (const k of NUMS) {
    s[k] += a[k];
    s.by_basis[b][k] += a[k];
  }
}

export type SpendBy = "goal" | "team" | "session";

/** The sums every spend query selects, per group (one usage row is one request). */
const SUM_COLUMNS = `COUNT(*) AS requests, SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
            SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h, SUM(u.cache_write_unsplit) AS cache_write_unsplit,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est_list_usd_micros,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_requests`;

export function spend(pp: PolicyPrincipal, by: SpendBy, from: string | null, to: string | null) {
  need(pp, "spend.read");
  if (from && to && from >= to) throw badRequest("from must be before to");
  const originColumn = by === "goal" ? "e.origin" : "NULL";
  const rows = all<Agg & { origin: EpochOrigin | null }>(
    `SELECT e.goal_id, u.session_key, s.user_id AS session_owner, u.basis, ${originColumn} AS origin, ${SUM_COLUMNS}
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     JOIN v2_sessions s ON s.ws_id = u.ws_id AND s.session_key = u.session_key
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id, u.session_key, u.basis, ${originColumn}`,
    pp.wsId,
    from,
    from,
    to,
    to,
  );
  const rolled = all<Agg>(
    `SELECT NULLIF(goal_id, '') AS goal_id, '' AS session_key, '' AS session_owner, basis,
            SUM(requests) AS requests, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read,
            SUM(cache_write_5m) AS cache_write_5m, SUM(cache_write_1h) AS cache_write_1h, SUM(cache_write_unsplit) AS cache_write_unsplit,
            SUM(est_list_usd_micros) AS est_list_usd_micros, SUM(unpriced_requests) AS unpriced_requests
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id, basis`,
    pp.wsId,
    from,
    from,
    to,
    to,
  ).map((r) => ({ ...r, origin: null, rolled: true }));
  const goals = new Map(all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ?", pp.wsId).map((g) => [g.id, g]));
  const pods = new Map(all<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ?", pp.wsId).map((p) => [p.id, p.name]));
  const sessions = new Map(
    all<{ session_key: string; title: string | null; repo_alias: string | null; harness: string }>("SELECT session_key, title, repo_alias, harness FROM v2_sessions WHERE ws_id = ? AND user_id = ?", pp.wsId, pp.userId).map((s) => [s.session_key, s]),
  );

  const total = emptySums();
  const unallocated = emptySums();
  const origins = new Map<string, Map<EpochOrigin | "rolled_up" | null, OriginSpend>>();
  const buckets = new Map<string, { key: string; kind: string; label: string; goal?: { id: string; title: string }; team?: { id: string; name: string } } & { sums: Sums }>();
  const bucket = (key: string, kind: string, label: string, extra: Record<string, unknown> = {}) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { key, kind, label, ...extra, sums: emptySums() }));
    return b.sums;
  };

  for (const r of [...rows, ...rolled] as (Agg & { origin: EpochOrigin | null; rolled?: boolean })[]) {
    add(total, r);
    if (!r.goal_id) {
      add(unallocated, r);
      continue;
    }
    const g = goals.get(r.goal_id);
    const visible = !!g && canReadGoal(pp, goalObj(g));
    if (by === "session") {
      if (r.rolled) {
        add(bucket("rolled_up", "rolled_up", "Older sessions (rolled up)"), r);
        continue;
      }
      const mine = r.session_owner === pp.userId ? sessions.get(r.session_key) : undefined;
      if (mine) add(bucket(`session:${r.session_key}`, "session", mine.title || mine.repo_alias || `${mine.harness} session`, { session_key: r.session_key }), r);
      else add(bucket("others", "others", "Other people's sessions"), r);
      continue;
    }
    if (!visible || !g) {
      add(bucket("private", "private", "Private goals"), r);
      continue;
    }
    if (by === "goal") {
      const key = `goal:${g.id}`;
      add(bucket(key, "goal", g.title, { goal: { id: g.id, title: g.title } }), r);
      let split = origins.get(key);
      if (!split) origins.set(key, (split = new Map()));
      const source = r.rolled ? "rolled_up" : r.origin;
      let part = split.get(source);
      if (!part) split.set(source, (part = { origin: r.origin, rolled_up: !!r.rolled, requests: 0, est_list_usd_micros: 0, unpriced_requests: 0 }));
      part.requests += r.requests;
      part.est_list_usd_micros += r.est_list_usd_micros;
      part.unpriced_requests += r.unpriced_requests;
    } else if (g.pod_id) add(bucket(`team:${g.pod_id}`, "team", pods.get(g.pod_id) ?? "Team", { team: { id: g.pod_id, name: pods.get(g.pod_id) ?? "" } }), r);
    else add(bucket("no_team", "no_team", "Goals without a team"), r);
  }

  const out = [...buckets.values()]
    .map(({ sums, ...rest }) => {
      const split = origins.get(rest.key);
      return { ...rest, ...sums, ...(split ? { by_origin: [...split.values()] } : {}) };
    })
    .sort((a, b) => b.est_list_usd_micros - a.est_list_usd_micros || b.requests - a.requests || a.label.localeCompare(b.label));
  return {
    by,
    from,
    to,
    note: "Costs are estimates at list price, not a bill. Subscription usage is not money spent.",
    total,
    unallocated,
    unpriced_requests: total.unpriced_requests,
    rows: out,
  };
}

/** Captured no-goal attribution for authorized budget reads. Aggregate numbers only, no person or session. */
export function noGoalTeamTotals(ws: string, from: string | null, to: string | null, team: string | null = null) {
  type TeamAgg = Pick<Agg, Num | "basis"> & { team_id: string };
  const live = all<TeamAgg>(
    `SELECT e.spend_team_id AS team_id, u.basis, ${SUM_COLUMNS}
     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND e.goal_id IS NULL AND e.spend_team_id IS NOT NULL
       AND (? IS NULL OR e.spend_team_id = ?) AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.spend_team_id, u.basis`, ws, team, team, from, from, to, to,
  );
  const rolled = all<TeamAgg>(
    `SELECT pod_id AS team_id, basis, ${NUMS.map((k) => `SUM(${k}) AS ${k}`).join(", ")}
     FROM v2_team_no_goal_rollups WHERE ws_id = ? AND (? IS NULL OR pod_id = ?)
       AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY pod_id, basis`, ws, team, team, from, from, to, to,
  );
  const totals = new Map<string, Sums>();
  for (const r of [...live, ...rolled]) {
    let s = totals.get(r.team_id);
    if (!s) totals.set(r.team_id, (s = emptySums()));
    add(s, r);
  }
  return [...totals].map(([team_id, sums]) => ({ team_id, ...sums }));
}

/** Export exactly the on-screen team report, including its unnamed goal and unallocated rows. */
export function spendTeamExport(pp: PolicyPrincipal, from: string, to: string | null) {
  return spend(pp, "team", from, to);
}

/** One goal's usage in [from, to): the total and one row per model, summed exactly as spend() sums a goal's row (every
 *  session's usage under the goal, by the epoch it was uploaded with). No visibility check: the caller decides who sees
 *  it (the change-request snapshot, lib/v2/evidence.ts, stores it and shows it to readers who may read spend). */
export function goalSpend(ws: string, goalId: string, from: string, to: string, completeDays = false) {
  const rows = all<Agg & { model: string }>(
    `SELECT u.model, u.basis, ${SUM_COLUMNS}
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND e.goal_id = ? AND u.ts >= ? AND u.ts < ?
     GROUP BY u.model, u.basis`,
    ws,
    goalId,
    from,
    to,
  );
  const rollups = all<Agg & { model: string }>(
    `SELECT model, basis, SUM(requests) AS requests, SUM(input) AS input, SUM(output) AS output,
            SUM(cache_read) AS cache_read, SUM(cache_write_5m) AS cache_write_5m,
            SUM(cache_write_1h) AS cache_write_1h, SUM(cache_write_unsplit) AS cache_write_unsplit,
            SUM(est_list_usd_micros) AS est_list_usd_micros, SUM(unpriced_requests) AS unpriced_requests
     FROM v2_spend_rollups
     WHERE ws_id = ? AND goal_id = ? AND day || 'T00:00:00.000Z' >= ? AND day || 'T00:00:00.000Z' < ?
       AND (? = 0 OR date(day, '+1 day') || 'T00:00:00.000Z' <= ?)
     GROUP BY model, basis`,
    ws, goalId, from, to, Number(completeDays), to,
  );
  const total = emptySums();
  const models = new Map<string, Sums>();
  for (const r of [...rows, ...rollups]) {
    add(total, r);
    let m = models.get(r.model);
    if (!m) models.set(r.model, (m = emptySums()));
    add(m, r);
  }
  const by_model = [...models.entries()]
    .map(([model, sums]) => ({ model, ...sums }))
    .sort((a, b) => b.est_list_usd_micros - a.est_list_usd_micros || b.requests - a.requests || a.model.localeCompare(b.model));
  return { total, by_model };
}

/** A partially overlapping roll-up gives no exact spend for that part of the window. */
export function hasPartialSpendDay(ws: string, goalId: string, from: string, to: string) {
  return !!get(
    `SELECT 1 FROM v2_spend_rollups
     WHERE ws_id = ? AND goal_id = ? AND day || 'T00:00:00.000Z' < ? AND date(day, '+1 day') || 'T00:00:00.000Z' > ?
       AND (day || 'T00:00:00.000Z' < ? OR date(day, '+1 day') || 'T00:00:00.000Z' > ?) LIMIT 1`,
    ws, goalId, to, from, from, to,
  );
}
