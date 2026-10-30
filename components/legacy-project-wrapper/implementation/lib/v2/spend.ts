import { all } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";

// Spend: token sums by basis and estimated list cost, per goal, team or session. Each request counts under the
// goal of the epoch it was uploaded with (history never moves); requests in epochs with no goal are unallocated.
// Invariant: total = sum of rows + unallocated, for every number.
// Privacy: a goal the caller can't see (another person's private goal, another team's goal) is never named; its
// usage sits in one unnamed "private" row. by=session names only the caller's own sessions; everyone else's are one
// "other people's sessions" row. No per-person view exists.

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

function add(s: Sums, a: Agg) {
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
  const rows = all<Agg>(
    `SELECT e.goal_id, u.session_key, s.user_id AS session_owner, u.basis, ${SUM_COLUMNS}
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     JOIN v2_sessions s ON s.ws_id = u.ws_id AND s.session_key = u.session_key
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id, u.session_key, u.basis`,
    pp.wsId,
    from,
    from,
    to,
    to,
  );
  const goals = new Map(all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ?", pp.wsId).map((g) => [g.id, g]));
  const pods = new Map(all<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ?", pp.wsId).map((p) => [p.id, p.name]));
  const sessions = new Map(
    all<{ session_key: string; title: string | null; repo_alias: string | null; harness: string }>("SELECT session_key, title, repo_alias, harness FROM v2_sessions WHERE ws_id = ? AND user_id = ?", pp.wsId, pp.userId).map((s) => [s.session_key, s]),
  );

  const total = emptySums();
  const unallocated = emptySums();
  const buckets = new Map<string, { key: string; kind: string; label: string; goal?: { id: string; title: string }; team?: { id: string; name: string } } & { sums: Sums }>();
  const bucket = (key: string, kind: string, label: string, extra: Record<string, unknown> = {}) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { key, kind, label, ...extra, sums: emptySums() }));
    return b.sums;
  };

  for (const r of rows) {
    add(total, r);
    if (!r.goal_id) {
      add(unallocated, r);
      continue;
    }
    const g = goals.get(r.goal_id);
    const visible = !!g && canReadGoal(pp, goalObj(g));
    if (by === "session") {
      const mine = r.session_owner === pp.userId ? sessions.get(r.session_key) : undefined;
      if (mine) add(bucket(`session:${r.session_key}`, "session", mine.title || mine.repo_alias || `${mine.harness} session`, { session_key: r.session_key }), r);
      else add(bucket("others", "others", "Other people's sessions"), r);
      continue;
    }
    if (!visible || !g) {
      add(bucket("private", "private", "Private goals"), r);
      continue;
    }
    if (by === "goal") add(bucket(`goal:${g.id}`, "goal", g.title, { goal: { id: g.id, title: g.title } }), r);
    else if (g.pod_id) add(bucket(`team:${g.pod_id}`, "team", pods.get(g.pod_id) ?? "Team", { team: { id: g.pod_id, name: pods.get(g.pod_id) ?? "" } }), r);
    else add(bucket("no_team", "no_team", "Goals without a team"), r);
  }

  const out = [...buckets.values()]
    .map(({ sums, ...rest }) => ({ ...rest, ...sums }))
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

/** One goal's usage in [from, to): the total and one row per model, summed exactly as spend() sums a goal's row (every
 *  session's usage under the goal, by the epoch it was uploaded with). No visibility check: the caller decides who sees
 *  it (the change-request snapshot, lib/v2/evidence.ts, stores it and shows it to readers who may read spend). */
export function goalSpend(ws: string, goalId: string, from: string, to: string) {
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
  const total = emptySums();
  const models = new Map<string, Sums>();
  for (const r of rows) {
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
