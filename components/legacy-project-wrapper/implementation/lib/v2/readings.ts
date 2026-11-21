import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, notFound } from "./errors";
import { event } from "./events";
import { contentOf, goalObj, visibleGoal, type Measure } from "./goals";
import { newId, nowIso } from "./ids";
import { count } from "./plural.mts";
import type { PolicyPrincipal } from "./policy";
import { optIso, str, type Body } from "./validate";
import { memberName, memberPrincipal, need } from "./workspaces";

interface ReadingRow {
  id: string;
  value_text: string;
  value_num: number | null;
  source: "self";
  observed_at: string;
  recorded_by: string;
  recorded_at: string;
}

const FUTURE_SKEW_MS = 5 * 60 * 1000;
const READING_ORDER = "observed_at DESC, recorded_at DESC, rowid DESC";
const MEASURE_READINGS = `SELECT id, value_text, value_num, source, observed_at, recorded_by, recorded_at
  FROM v2_measure_readings WHERE ws_id = ? AND goal_id = ? AND measure_id = ?`;

export function latestMeasureReadings(ws: string, goal: string, measures: Measure[]): Record<string, ReadingRow | undefined> {
  return Object.fromEntries(measures.map(({ id }) => [id, get<ReadingRow>(`${MEASURE_READINGS} ORDER BY ${READING_ORDER} LIMIT 1`, ws, goal, id)]));
}

export function readingView(r: ReadingRow) {
  return { ...r, recorded_by: { id: r.recorded_by, name: memberName(r.recorded_by) } };
}
export type MeasureReading = ReturnType<typeof readingView>;

function readingGoal(pp: PolicyPrincipal, goal: string, measure: string) {
  const g = visibleGoal(pp, goal);
  if (!contentOf(g).measures.some((m) => m.id === measure)) throw notFound();
  return g;
}

export function measureReadingHistory(pp: PolicyPrincipal, goal: string, measure: string) {
  readingGoal(pp, goal, measure);
  return all<ReadingRow>(`${MEASURE_READINGS} ORDER BY ${READING_ORDER} LIMIT 20`, pp.wsId, goal, measure).map(readingView);
}

export async function recordMeasureReading(pp: PolicyPrincipal, goal: string, measure: string, b: Body) {
  return tx(() => {
    const reader = memberPrincipal(pp.wsId, pp.userId);
    const g = readingGoal(reader, goal, measure);
    need(reader, "goal.record_reading", goalObj(g));
    if (b.source !== undefined && b.source !== "self") throw badRequest("Only self-reported readings can be recorded.");
    const value_text = str(b, "value_text", 80);
    const num = Number(value_text);
    const value_num = Number.isFinite(num) ? num : null;
    const at = nowIso();
    const observed_at = optIso(b, "observed_at") ?? at;
    const observedMs = Date.parse(observed_at);
    const aheadMs = observedMs - Date.parse(at);
    if (aheadMs > FUTURE_SKEW_MS) {
      const minutes = Math.round(aheadMs / 60_000);
      throw new V2Error(400, "clock_skew", `observed_at is ${count(minutes, "minute")} ahead of the server's clock`, { server_time: at });
    }
    if (observedMs < Date.parse(g.created_at)) throw badRequest("observed_at is before the goal was created");
    const id = newId("mr");
    const first = !get("SELECT 1 FROM v2_measure_readings WHERE ws_id = ? LIMIT 1", pp.wsId);
    run(
      `INSERT INTO v2_measure_readings (id, ws_id, goal_id, measure_id, value_text, value_num, source, observed_at, recorded_by, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, 'self', ?, ?, ?)`,
      id, pp.wsId, goal, measure, value_text, value_num, observed_at, pp.userId, at,
    );
    audit(pp.wsId, pp.userId, "measure.reading_recorded", id, at);
    if (first) event("first_reading", { ws: pp.wsId, user: pp.userId, at });
    return readingView({ id, value_text, value_num, source: "self", observed_at, recorded_by: pp.userId, recorded_at: at });
  });
}
