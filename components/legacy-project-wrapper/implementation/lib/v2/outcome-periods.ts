import { all } from "./db";
import { notFound } from "./errors";
import { goalObj, goalRow, visibleGoal } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { readingsDuring, readingView } from "./readings";
import { goalSpend, hasPartialSpendDay } from "./spend";

export function outcomePeriods(pp: PolicyPrincipal, goalId: string | null, requestId: string | null) {
  if (goalId) visibleGoal(pp, goalId);
  const rows = all<{ change_request_id: string; goal_id: string; measure_id: string; measure_text: string; from_at: string; to_at: string }>(
    `SELECT e.change_request_id, e.goal_id, e.measure_id, e.measure_text, e.created_at AS from_at, o.reported_at AS to_at
     FROM v2_expectations e JOIN v2_outcome_reports o ON o.ws_id = e.ws_id AND o.change_request_id = e.change_request_id AND o.answer = 1
     WHERE e.ws_id = ? AND (? IS NULL OR e.goal_id = ?) AND (? IS NULL OR e.change_request_id = ?)
     ORDER BY o.reported_at DESC, e.change_request_id`,
    pp.wsId, goalId, goalId, requestId, requestId,
  );
  const readable = rows.flatMap((r) => {
    const g = goalRow(pp.wsId, r.goal_id);
    return g && canReadGoal(pp, goalObj(g)) ? [{ ...r, goal_title: g.title }] : [];
  });
  if (requestId && !readable.length) throw notFound();
  const showSpend = authorize(pp, "spend.read", { kind: "workspace" }).ok;
  return readable.slice(0, 20).map((r) => {
    const readings = readingsDuring(pp.wsId, r.goal_id, r.measure_id, r.from_at, r.to_at);
    const totals = showSpend ? goalSpend(pp.wsId, r.goal_id, r.from_at, r.to_at, true).total : null;
    const incomplete = !!totals && hasPartialSpendDay(pp.wsId, r.goal_id, r.from_at, r.to_at);
    return {
      ...r,
      readings: readings.slice(0, 20).map(readingView),
      more_readings: readings.length > 20,
      spend: totals ? {
        estimate: totals.requests > 0 && totals.unpriced_requests === 0 && !incomplete ? totals.est_list_usd_micros : null,
        partial_estimate: totals.requests > totals.unpriced_requests && (totals.unpriced_requests > 0 || incomplete) ? totals.est_list_usd_micros : null,
      } : null,
    };
  });
}
export type OutcomePeriod = ReturnType<typeof outcomePeriods>[number];
