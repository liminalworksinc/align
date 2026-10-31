import { all } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";

// Allocation (PORT29, main #29): where the workspace's shared agent time goes, against the target share each goal's
// approvers set (a versioned goal field, lib/v2/goals.ts). The unit is fresh tokens (input + output + cache writes),
// counted for every model, priced or not; cache reads are left out because they grow with session length rather than
// with work. List price is reported beside it. Usage counts under the goal of the epoch it was uploaded with, as in
// spend.ts, and rolled-up days (v2_spend_rollups) count by goal too. Shares are of everything shared in the workspace
// in the window, so unallocated and unnamed usage still take their part of the total.
// Privacy matches spend.ts: a goal the caller can't read is never named and its target is not shown (one "private"
// row); there is no per-person or per-session view.

const DAY = 86_400_000;
/** Fresh tokens of a row (`p` is the table's alias and a dot, or nothing). */
const fresh = (p = "") => `(${p}input + ${p}output + ${p}cache_write_5m + ${p}cache_write_1h + ${p}cache_write_unsplit)`;

interface GoalAgg {
  goal_id: string | null;
  fresh: number;
  est: number;
  unpriced: number;
  sessions: number;
}

/** Fresh tokens, list price, unpriced requests and sessions per goal (null: no goal) in [from, to). */
function sums(wsId: string, from: string | null, to: string | null): GoalAgg[] {
  const live = all<GoalAgg>(
    `SELECT e.goal_id, SUM(${fresh("u.")}) AS fresh,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced, COUNT(DISTINCT u.session_key) AS sessions
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id`,
    wsId,
    from,
    from,
    to,
    to,
  );
  const rolled = all<GoalAgg>(
    `SELECT NULLIF(goal_id, '') AS goal_id, SUM(${fresh()}) AS fresh, SUM(est_list_usd_micros) AS est, SUM(unpriced_requests) AS unpriced, 0 AS sessions
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id`,
    wsId,
    from,
    from,
    to,
    to,
  );
  const by = new Map<string | null, GoalAgg>();
  for (const r of [...live, ...rolled]) {
    const a = by.get(r.goal_id);
    if (!a) by.set(r.goal_id, { ...r });
    else Object.assign(a, { fresh: a.fresh + r.fresh, est: a.est + r.est, unpriced: a.unpriced + r.unpriced, sessions: a.sessions + r.sessions });
  }
  return [...by.values()];
}

const pct = (part: number, total: number, digits = 1) => (total > 0 ? Math.round((part / total) * 100 * 10 ** digits) / 10 ** digits : 0);

export interface AllocationRow {
  kind: "goal" | "private" | "unallocated";
  goal: { id: string; title: string } | null;
  fresh_tokens: number;
  share: number;
  target_share: number | null;
  gap: number | null;
  est_list_usd_micros: number;
  unpriced_requests: number;
  sessions: number;
}

/** Actual against target for [from, to). Active goals the caller can read appear with no usage when they have a target. */
export function allocation(pp: PolicyPrincipal, from: string | null, to: string | null) {
  need(pp, "spend.read");
  if (from && to && from >= to) throw badRequest("from must be before to");
  const rows = sums(pp.wsId, from, to);
  const goals = new Map(all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ?", pp.wsId).map((g) => [g.id, g]));
  const total = rows.reduce((a, r) => a + r.fresh, 0);
  const out: AllocationRow[] = [];
  const priv: AllocationRow = { kind: "private", goal: null, fresh_tokens: 0, share: 0, target_share: null, gap: null, est_list_usd_micros: 0, unpriced_requests: 0, sessions: 0 };
  const unalloc: AllocationRow = { ...priv, kind: "unallocated" };
  const seen = new Set<string>();
  for (const r of rows) {
    const g = r.goal_id ? goals.get(r.goal_id) : undefined;
    const into = !r.goal_id ? unalloc : g && canReadGoal(pp, goalObj(g)) ? null : priv;
    if (into) {
      into.fresh_tokens += r.fresh;
      into.est_list_usd_micros += r.est;
      into.unpriced_requests += r.unpriced;
      into.sessions += r.sessions;
      continue;
    }
    seen.add(g!.id);
    const share = pct(r.fresh, total);
    const target = g!.status === "active" ? (g!.target_share ?? null) : null;
    out.push({
      kind: "goal",
      goal: { id: g!.id, title: g!.title },
      fresh_tokens: r.fresh,
      share,
      target_share: target,
      gap: target === null ? null : Math.round((share - target) * 10) / 10,
      est_list_usd_micros: r.est,
      unpriced_requests: r.unpriced,
      sessions: r.sessions,
    });
  }
  for (const g of goals.values()) {
    if (seen.has(g.id) || g.status !== "active" || g.target_share === null || g.target_share === undefined || !canReadGoal(pp, goalObj(g))) continue;
    out.push({ kind: "goal", goal: { id: g.id, title: g.title }, fresh_tokens: 0, share: 0, target_share: g.target_share, gap: -g.target_share, est_list_usd_micros: 0, unpriced_requests: 0, sessions: 0 });
  }
  for (const r of [priv, unalloc]) r.share = pct(r.fresh_tokens, total);
  out.sort((a, b) => b.fresh_tokens - a.fresh_tokens || (b.target_share ?? -1) - (a.target_share ?? -1) || a.goal!.title.localeCompare(b.goal!.title));
  if (priv.fresh_tokens) out.push(priv);
  if (unalloc.fresh_tokens) out.push(unalloc);
  return {
    from,
    to,
    total_fresh_tokens: total,
    total_est_list_usd_micros: rows.reduce((a, r) => a + r.est, 0),
    unpriced_requests: rows.reduce((a, r) => a + r.unpriced, 0),
    rows: out,
    note: "Agent time is counted in fresh tokens (input, output and cache writes) for every model. Costs are estimates at list price, not a bill.",
  };
}

/** Monday 00:00 UTC of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

/** The last `weeks` calendar weeks (UTC, Monday start), oldest first: each week's share per readable goal. */
export function weeklyAllocation(pp: PolicyPrincipal, weeks = 6, now = Date.now()) {
  need(pp, "spend.read");
  const n = Math.max(1, Math.min(26, Math.floor(weeks)));
  const thisWeek = weekStart(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = new Date(thisWeek - i * 7 * DAY).toISOString();
    const to = new Date(thisWeek - (i - 1) * 7 * DAY).toISOString();
    const a = allocation(pp, from, to);
    out.push({ week_start: from, total_fresh_tokens: a.total_fresh_tokens, rows: a.rows.map((r) => ({ kind: r.kind, goal: r.goal, share: r.share, target_share: r.target_share })) });
  }
  return out;
}

export interface FeedAllocation {
  target_share: number | null;
  share_7d: number;
  /** null without a target, or with no shared usage in the window. */
  gap_7d: number | null;
  /** The goal is on hold (lib/v2/requests.ts): agents never steer from or toward it. */
  held: boolean;
}

/** Trailing-7-day share and gap per active goal the caller can read, as whole percents, for the goals feed. */
export function feedAllocation(pp: PolicyPrincipal, now = Date.now()): Map<string, FeedAllocation> {
  const rows = sums(pp.wsId, new Date(now - 7 * DAY).toISOString(), null);
  const total = rows.reduce((a, r) => a + r.fresh, 0);
  const byGoal = new Map(rows.filter((r) => r.goal_id).map((r) => [r.goal_id as string, r.fresh]));
  const held = new Set(all<{ goal_id: string }>("SELECT goal_id FROM v2_goal_holds WHERE ws_id = ?", pp.wsId).map((h) => h.goal_id));
  const out = new Map<string, FeedAllocation>();
  for (const g of all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ? AND status = 'active'", pp.wsId)) {
    if (!canReadGoal(pp, goalObj(g))) continue;
    const share = Math.round(pct(byGoal.get(g.id) ?? 0, total, 0));
    const target = g.target_share ?? null;
    out.set(g.id, { target_share: target, share_7d: share, gap_7d: target === null || total === 0 ? null : share - target, held: held.has(g.id) });
  }
  return out;
}
