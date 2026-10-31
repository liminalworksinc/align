import { all } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";

// Allocation: where the workspace's agent time goes, against the share each goal's owner set as its target.
// The unit is fresh tokens (input + output + cache writes), counted for every model, priced or not; cache reads are
// left out because they grow with session length rather than with work. List price is reported next to it.
// Usage counts under the goal of the epoch it was uploaded with, as in spend.ts. Shares are of everything shared in
// the workspace in the window, so unallocated and private usage still take their part of the total.
// Privacy matches spend.ts: a goal the caller can't read is never named and its target is not shown; there is no
// per-person or per-session view.

const DAY = 86_400_000;
const FRESH = "(u.input + u.output + u.cache_write_5m + u.cache_write_1h + u.cache_write_unsplit)";

interface GoalAgg {
  goal_id: string | null;
  fresh: number;
  est: number;
  unpriced: number;
  sessions: number;
}

function sums(wsId: string, from: string | null, to: string | null): GoalAgg[] {
  return all<GoalAgg>(
    `SELECT e.goal_id, SUM(${FRESH}) AS fresh, COALESCE(SUM(u.est_list_usd_micros), 0) AS est,
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

/** Actual against target for [from, to). Goals the caller can read appear even with no usage when they have a target. */
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
  return { weeks: out };
}

/** Trailing-7-day share and gap per goal the caller can read, as whole percents, for the goals feed. */
export function feedShares(pp: PolicyPrincipal, now = Date.now()): Map<string, { target_share: number | null; share_7d: number; gap_7d: number | null }> {
  const rows = sums(pp.wsId, new Date(now - 7 * DAY).toISOString(), null);
  const total = rows.reduce((a, r) => a + r.fresh, 0);
  const byGoal = new Map(rows.filter((r) => r.goal_id).map((r) => [r.goal_id as string, r.fresh]));
  const out = new Map<string, { target_share: number | null; share_7d: number; gap_7d: number | null }>();
  for (const g of all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ? AND status = 'active'", pp.wsId)) {
    if (!canReadGoal(pp, goalObj(g))) continue;
    const share = Math.round(pct(byGoal.get(g.id) ?? 0, total, 0));
    const target = g.target_share ?? null;
    out.set(g.id, { target_share: target, share_7d: share, gap_7d: target === null || total === 0 ? null : share - target });
  }
  return out;
}
