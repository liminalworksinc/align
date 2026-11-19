import { signPayload } from "../secret";
import { freshTokensSql } from "./allocation";
import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { event } from "./events";
import { expectationsForGoalReview } from "./expectations";
import { contentOf, goalObj, visibleGoal, visibleGoals, type GoalRow } from "./goals";
import { nowIso } from "./ids";
import { authorize, type PolicyPrincipal } from "./policy";
import { measureReview } from "./readings";
import { ID_RE, type Body } from "./validate";
import { canReviewGoalList, memberPrincipal } from "./workspaces";

const DAY = 86_400_000;
const THREE_WEEKS = 21 * DAY;
const MIN_UNBOUND_CONTRIBUTORS = 5;
const shift = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const percentage = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

function period(at: string) {
  const d = new Date(at);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString();
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  return { from, to, period_end: to.slice(0, 10) };
}

function status(pp: PolicyPrincipal, at: string, end: string) {
  const saved = get<{ period_end: string; reviewed_at: string | null; deferred_until: string | null }>(
    "SELECT period_end, reviewed_at, deferred_until FROM v2_goal_list_reviews WHERE ws_id = ? AND user_id = ?", pp.wsId, pp.userId,
  );
  const reviewed_at = saved?.period_end === end ? saved.reviewed_at : null;
  const deferred_until = saved?.deferred_until && saved.deferred_until > at ? saved.deferred_until : null;
  return { due: !reviewed_at && !deferred_until, reviewed_at, deferred_until };
}

export function goalListReviewDue(pp: PolicyPrincipal) {
  if (!canReviewGoalList(pp)) return false;
  const at = nowIso();
  return status(pp, at, period(at).period_end).due;
}

const USAGE_EPOCHS = `FROM v2_usage u
  JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id`;
const FRESH = freshTokensSql("u.");
const ROLLED_FRESH = freshTokensSql();

function monthUsage(ws: string, from: string, to: string) {
  const rows = all<{ goal_id: string; fresh: number; last_at: string }>(
    `SELECT goal_id, SUM(fresh) AS fresh, MAX(last_at) AS last_at FROM (
       SELECT e.goal_id, SUM(${FRESH}) AS fresh, MAX(u.ts) AS last_at
       ${USAGE_EPOCHS}
       WHERE u.ws_id = ? AND u.ts >= ? AND u.ts < ? AND e.goal_id IS NOT NULL AND ${FRESH} > 0
       GROUP BY e.goal_id
       UNION ALL
       SELECT goal_id, SUM(${ROLLED_FRESH}), MAX(day) || 'T00:00:00.000Z'
       FROM v2_spend_rollups
       WHERE ws_id = ? AND day >= ? AND day < ? AND goal_id <> '' AND ${ROLLED_FRESH} > 0
       GROUP BY goal_id
     ) GROUP BY goal_id`, ws, from, to, ws, from.slice(0, 10), to.slice(0, 10),
  );
  return new Map(rows.map((row) => [row.goal_id, row]));
}

// Called inside the review transaction so readers agree on the same first release, even during uploads or deletion.
function unboundShare(ws: string, from: string, to: string, workspaceGoalTokens: number) {
  const end = to.slice(0, 10);
  const released = get<{ usage_hash: string | null }>(
    "SELECT usage_hash FROM v2_goal_review_releases WHERE ws_id = ? AND period_end = ?", ws, end,
  );
  if (released?.usage_hash === null) return null;

  const row = get<{ fresh: number }>(
    `SELECT SUM(${FRESH}) AS fresh ${USAGE_EPOCHS}
     JOIN v2_sessions s ON s.ws_id = u.ws_id AND s.session_key = u.session_key
     LEFT JOIN ba_user person ON person.id = s.user_id
     WHERE u.ws_id = ? AND u.ts >= ? AND u.ts < ? AND e.goal_id IS NULL AND ${FRESH} > 0
     HAVING COUNT(DISTINCT person.id) >= ?`, ws, from, to, MIN_UNBOUND_CONTRIBUTORS,
  );
  const usageHash = row ? signPayload(`goal-review.${ws}.${end}.${row.fresh}.${workspaceGoalTokens}`) : null;
  if (released && released.usage_hash !== usageHash) {
    // A second figure could reveal a single contribution by subtraction. Retain only the suppression marker.
    run("UPDATE v2_goal_review_releases SET usage_hash = NULL WHERE ws_id = ? AND period_end = ?", ws, end);
    return null;
  }
  if (!row) return null;
  if (!released) run("INSERT INTO v2_goal_review_releases (ws_id, period_end, usage_hash) VALUES (?, ?, ?)", ws, end, usageHash);
  return percentage(row.fresh, row.fresh + workspaceGoalTokens);
}

function inactivity(ws: string, goal: GoalRow, to: string, latest: string | undefined) {
  const cutoff = shift(to, -THREE_WEEKS);
  if (goal.created_at > cutoff || (latest && (latest >= cutoff || goal.target_share == null))) return null;
  const prior = latest ?? get<{ last_at: string | null }>(
    `SELECT MAX(last_at) AS last_at FROM (
       SELECT MAX(u.ts) AS last_at ${USAGE_EPOCHS}
       WHERE u.ws_id = ? AND e.goal_id = ? AND u.ts < ? AND ${FRESH} > 0
       UNION ALL
       SELECT MAX(day) || 'T00:00:00.000Z' FROM v2_spend_rollups
       WHERE ws_id = ? AND goal_id = ? AND day < ? AND ${ROLLED_FRESH} > 0
     )`, ws, goal.id, to, ws, goal.id, to.slice(0, 10),
  )?.last_at ?? null;
  return { last_at: prior };
}

export function goalListReview(pp: PolicyPrincipal) {
  if (!canReviewGoalList(pp)) throw notFound();
  const at = nowIso();
  const { from, to, period_end } = period(at);
  const goals = visibleGoals(pp);
  const usage = monthUsage(pp.wsId, from, to);
  const workspaceGoalTokens = goals.filter((g) => g.visibility === "workspace").reduce((sum, g) => sum + (usage.get(g.id)?.fresh ?? 0), 0);
  const snoozed = new Set(all<{ goal_id: string }>(
    "SELECT goal_id FROM v2_goal_list_snoozes WHERE ws_id = ? AND user_id = ? AND until_at > ?", pp.wsId, pp.userId, at,
  ).map((row) => row.goal_id));
  const expectations = Map.groupBy(expectationsForGoalReview(pp.wsId, at.slice(0, 10)), (e) => e.goal_id);
  const held = new Set(all<{ goal_id: string }>("SELECT goal_id FROM v2_goal_holds WHERE ws_id = ?", pp.wsId).map((h) => h.goal_id));
  const since = shift(at, -THREE_WEEKS);
  const questions = goals.filter((g) => g.status === "active").flatMap((g) => {
    const observed = usage.get(g.id);
    const idle = snoozed.has(g.id) ? null : inactivity(pp.wsId, g, to, observed?.last_at);
    const measures = contentOf(g).measures.flatMap((m) => {
      const hint = measureReview(pp.wsId, g.id, m.id, at, since);
      return hint ? [{ id: m.id, text: m.text, ...hint }] : [];
    });
    const outcomes = (expectations.get(g.id) ?? []).map(({ goal_id: _, ...e }) => e);
    if (!idle && !measures.length && !outcomes.length) return [];
    return [{
      goal: { id: g.id, title: g.title },
      inactivity: idle, measures, outcomes,
      can_edit: authorize(pp, "goal.edit", goalObj(g)).ok,
      can_hold: !held.has(g.id),
    }];
  });
  return { from: from.slice(0, 10), period_end, ...status(pp, at, period_end), unbound_share: unboundShare(pp.wsId, from, to, workspaceGoalTokens), questions };
}
export type GoalListReview = ReturnType<typeof goalListReview>;

export function recordGoalListReview(pp: PolicyPrincipal, b: Body) {
  return tx(() => {
    const owner = memberPrincipal(pp.wsId, pp.userId);
    if (!canReviewGoalList(owner)) throw notFound();
    const { action } = b;
    if (action !== "reviewed" && action !== "defer" && action !== "snooze") throw badRequest("Choose a review action.");
    const goal = action === "snooze" ? visibleGoal(owner, typeof b.goal_id === "string" && ID_RE.test(b.goal_id) ? b.goal_id : "") : null;
    if (goal && goal.status !== "active") throw notFound();
    const at = nowIso();
    const { from, to, period_end } = period(at);
    if (b.period_end !== period_end) throw conflict("stale_review", "The review period has changed. Reload to see the current review.");
    const nextWeek = shift(at, 7 * DAY);
    if (goal) {
      const last = monthUsage(pp.wsId, from, to).get(goal.id)?.last_at;
      if (!inactivity(pp.wsId, goal, to, last)) throw conflict("no_inactivity", "This goal no longer has an inactivity question.");
      const changed = run(
        `INSERT INTO v2_goal_list_snoozes (ws_id, user_id, goal_id, until_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (ws_id, user_id, goal_id) DO UPDATE SET until_at = excluded.until_at WHERE until_at <= ?`,
        pp.wsId, pp.userId, goal.id, nextWeek, at,
      );
      if (changed) audit(pp.wsId, pp.userId, "goal_list_review.snoozed", pp.wsId, at);
    } else {
      const current = status(owner, at, period_end);
      if (current.reviewed_at || (action === "defer" && current.deferred_until)) return current;
      run(
        `INSERT INTO v2_goal_list_reviews (ws_id, user_id, period_end, reviewed_at, deferred_until) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (ws_id, user_id) DO UPDATE SET
           period_end = excluded.period_end, reviewed_at = excluded.reviewed_at, deferred_until = excluded.deferred_until`,
        pp.wsId, pp.userId, period_end, action === "reviewed" ? at : null, action === "defer" ? nextWeek : null,
      );
      audit(pp.wsId, pp.userId, action === "reviewed" ? "goal_list_review.reviewed" : "goal_list_review.deferred", pp.wsId, at);
      if (action === "reviewed") event("goal_list_reviewed", { ws: pp.wsId, user: pp.userId, at });
    }
    return status(owner, at, period_end);
  });
}
