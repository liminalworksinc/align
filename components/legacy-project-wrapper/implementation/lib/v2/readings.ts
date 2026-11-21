import { decimalText, plainDecimal } from "../../packages/align-agent/src/shared/decimal";
import { all, audit, get, run, tx } from "./db";
import type { DevicePrincipal } from "./devices";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { event } from "./events";
import { contentOf, goalObj, goalRow, visibleGoal, type GoalRow, type Measure } from "./goals";
import { newId, nowIso } from "./ids";
import { BRANCH, CHECK, REPOSITORY, ciField, commandReader, exactFields, readingCredential, type CiSource } from "./measure-sources";
import { count } from "./plural.mts";
import type { PolicyPrincipal } from "./policy";
import { optIso, str, type Body } from "./validate";
import { memberName, memberPrincipal, need } from "./workspaces";

type CiDetails = Omit<CiSource, "kind" | "stale_after_days"> & { run: string; commit: string };
type CommandDetails = { device_id: string; exit_status: number | null };
type RecordedSource = { source: "self" } | { source: "ci"; details: CiDetails } | { source: "command"; details: CommandDetails; runId: string };

interface ReadingRow {
  id: string;
  value_text: string | null;
  value_num: number | null;
  source: RecordedSource["source"];
  source_ref: string | null;
  goal_version: number | null;
  stale_after: string | null;
  observed_at: string;
  recorded_by: string;
  recorded_at: string;
}

const FUTURE_SKEW_MS = 5 * 60 * 1000;
const READING_ORDER = "observed_at DESC, recorded_at DESC, rowid DESC";
const MEASURE_READINGS = `SELECT id, value_text, value_num, source, source_ref, goal_version, stale_after, observed_at, recorded_by, recorded_at
  FROM v2_measure_readings WHERE ws_id = ? AND goal_id = ? AND measure_id = ?`;

export function latestMeasureReadings(ws: string, goal: string, measures: Measure[]): Record<string, ReadingRow | undefined> {
  return Object.fromEntries(measures.map(({ id }) => [id, get<ReadingRow>(`${MEASURE_READINGS} ORDER BY ${READING_ORDER} LIMIT 1`, ws, goal, id)]));
}

type ReviewValue = Pick<ReadingRow, "value_text" | "value_num">;

function reviewValue({ value_text, value_num }: ReviewValue) {
  const exact = value_text === null ? null : decimalText(value_text.trim());
  return exact ?? (value_num === null ? null : String(value_num));
}

export function measureReview(ws: string, goal: string, measure: string, at: string, since: string) {
  const latest = get<ReviewValue & Pick<ReadingRow, "source" | "stale_after" | "observed_at">>(
    `SELECT value_text, value_num, source, stale_after, observed_at FROM v2_measure_readings
     WHERE ws_id = ? AND goal_id = ? AND measure_id = ? AND observed_at <= ?
     ORDER BY ${READING_ORDER} LIMIT 1`, ws, goal, measure, at,
  );
  if (!latest) return { kind: "missing" } as const;
  const { source, observed_at: last_at, stale_after } = latest;
  if (stale_after && stale_after <= at) return { kind: "stale", source, last_at } as const;
  const value = reviewValue(latest);
  if (value === null) return { kind: "no_number", source } as const;
  if (last_at <= since) return { kind: "no_recent_reading", source, last_at } as const;

  // Pick one recording per observation date, using the same precedence as the latest reading.
  const baseline = get<ReviewValue>(
    `SELECT value_text, value_num FROM v2_measure_readings
     WHERE ws_id = ? AND goal_id = ? AND measure_id = ? AND observed_at <= ?
     ORDER BY ${READING_ORDER} LIMIT 1`, ws, goal, measure, since,
  );
  if (!baseline || reviewValue(baseline) !== value) return null;
  const recent = all<ReviewValue>(
    `SELECT DISTINCT value_text, value_num FROM (
       SELECT value_text, value_num, ROW_NUMBER() OVER (PARTITION BY observed_at ORDER BY recorded_at DESC, rowid DESC) AS rank
       FROM v2_measure_readings
       WHERE ws_id = ? AND goal_id = ? AND measure_id = ? AND observed_at > ? AND observed_at <= ?
     ) WHERE rank = 1`, ws, goal, measure, since, at,
  );
  return recent.some((reading) => reviewValue(reading) !== value) ? null : { kind: "unchanged", source } as const;
}

export function readingView(r: ReadingRow) {
  const { source_ref, ...row } = r;
  const base = { ...row, stale: !!row.stale_after && row.stale_after <= nowIso(), recorded_by: { id: r.recorded_by, name: memberName(r.recorded_by) } };
  if (r.source === "ci") return { ...base, source: r.source, details: JSON.parse(source_ref!) as CiDetails };
  if (r.source === "command") {
    const details = JSON.parse(source_ref!) as CommandDetails;
    const device = get<{ name: string }>("SELECT name FROM v2_devices WHERE id = ? AND user_id = ?", details.device_id, r.recorded_by);
    return { ...base, source: r.source, details: { ...details, device_name: device?.name ?? null } };
  }
  return { ...base, source: r.source, details: null };
}
export type MeasureReading = ReturnType<typeof readingView>;

function readingGoal(pp: PolicyPrincipal, goal: string, measure: string) {
  const g = visibleGoal(pp, goal);
  const m = contentOf(g).measures.find((item) => item.id === measure);
  if (!m) throw notFound();
  return { g, m };
}

export function measureReadingHistory(pp: PolicyPrincipal, goal: string, measure: string) {
  readingGoal(pp, goal, measure);
  return all<ReadingRow>(`${MEASURE_READINGS} ORDER BY ${READING_ORDER} LIMIT 20`, pp.wsId, goal, measure).map(readingView);
}

/** The caller already checked access to the expectation's goal. Retired measures still have their history. */
export function readingsDuring(ws: string, goal: string, measure: string, from: string, to: string) {
  return all<ReadingRow>(`${MEASURE_READINGS} AND observed_at >= ? AND observed_at <= ? ORDER BY ${READING_ORDER} LIMIT 21`,
    ws, goal, measure, from, to);
}

function insertReading(g: GoalRow, measure: string, actor: string, value_text: string | null, source: RecordedSource, at: string, observed_at = at, staleAfterDays?: number) {
  const id = newId("mr");
  const value_num = value_text === null ? null : plainDecimal(value_text);
  const stale_after = staleAfterDays === undefined ? null : new Date(Date.parse(observed_at) + staleAfterDays * 86_400_000).toISOString();
  const source_ref = source.source === "self" ? null : JSON.stringify(source.details);
  const first = !get("SELECT 1 FROM v2_measure_readings WHERE ws_id = ? LIMIT 1", g.ws_id);
  run(
    `INSERT INTO v2_measure_readings (id, ws_id, goal_id, measure_id, value_text, value_num, source, source_ref, goal_version, command_run_id, stale_after, observed_at, recorded_by, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, g.ws_id, g.id, measure, value_text, value_num, source.source, source_ref, g.version, source.source === "command" ? source.runId : null, stale_after, observed_at, actor, at,
  );
  audit(g.ws_id, actor, "measure.reading_recorded", id, at);
  if (first) event("first_reading", { ws: g.ws_id, user: actor, at });
  if (source.source !== "self") event("measure_source_reading", { ws: g.ws_id, user: actor, at, props: { source: source.source } });
  return readingView({ id, value_text, value_num, source: source.source, source_ref, goal_version: g.version, stale_after, observed_at, recorded_by: actor, recorded_at: at });
}

export async function recordMeasureReading(pp: PolicyPrincipal, goal: string, measure: string, b: Body) {
  return tx(() => {
    const reader = memberPrincipal(pp.wsId, pp.userId);
    const { g } = readingGoal(reader, goal, measure);
    need(reader, "goal.record_reading", goalObj(g));
    if (b.source !== undefined && b.source !== "self") throw badRequest("Only self-reported readings can be recorded here.");
    const value_text = str(b, "value_text", 80);
    const at = nowIso();
    const observed_at = optIso(b, "observed_at") ?? at;
    const observedMs = Date.parse(observed_at);
    const aheadMs = observedMs - Date.parse(at);
    if (aheadMs > FUTURE_SKEW_MS) {
      const minutes = Math.round(aheadMs / 60_000);
      throw new V2Error(400, "clock_skew", `observed_at is ${count(minutes, "minute")} ahead of the server's clock`, { server_time: at });
    }
    if (observedMs < Date.parse(g.created_at)) throw badRequest("observed_at is before the goal was created");
    return insertReading(g, measure, pp.userId, value_text, { source: "self" }, at, observed_at);
  });
}

function decimalReading(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 80 || decimalText(value) === null)
    throw badRequest("Reading value must be a plain decimal or unknown.");
  return value;
}

export function requireReadingCredential(secret: string, ws: string) {
  const credential = readingCredential(secret);
  if (!credential) throw new V2Error(401, "invalid_token", "Use an active CI reading credential.");
  if (credential.ws_id !== ws || !get("SELECT 1 FROM v2_workspaces WHERE id = ? AND deleted_at IS NULL", ws)) throw notFound();
  return credential;
}

export async function recordCiReading(secret: string, ws: string, goal: string, measure: string, b: Body) {
  return tx(() => {
    const credential = requireReadingCredential(secret, ws);
    const g = goalRow(ws, goal);
    const source = g && contentOf(g).measures.find((m) => m.id === measure)?.source;
    if (!g || source?.kind !== "ci" || b.repository !== source.repository || b.branch !== source.branch || b.check !== source.check)
      throw notFound();
    exactFields(b, ["repository", "branch", "check", "run", "commit", "value"], "CI reading");
    const details = {
      repository: ciField(b.repository, REPOSITORY, "Repository (owner/name)"),
      branch: ciField(b.branch, BRANCH, "Branch"),
      check: ciField(b.check, CHECK, "CI check name"),
      run: ciField(b.run, /^[A-Za-z0-9._:/-]{1,120}$/, "Run ID"),
      commit: ciField(b.commit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i, "Commit").toLowerCase(),
    };
    const value = decimalReading(b.value);
    const previous = get<ReadingRow>(`${MEASURE_READINGS} AND source = 'ci' AND source_ref = ?`, ws, goal, measure, JSON.stringify(details));
    if (previous) {
      if (previous.value_text !== value) throw conflict("reading_conflict", "This CI run already recorded a different value.");
      return { id: previous.id, created: false };
    }
    const at = nowIso();
    const reading = insertReading(g, measure, credential.created_by, value, { source: "ci", details }, at, at, source.stale_after_days);
    return { id: reading.id, created: true };
  });
}

function chosenCommand(device: DevicePrincipal, ws: string, goal: string, measure: string) {
  const g = goalRow(ws, goal);
  if (!g || commandReader(ws, device.deviceId, goalObj(g))?.userId !== device.user.id) throw notFound();
  const source = contentOf(g).measures.find((m) => m.id === measure)?.source;
  if (source?.kind !== "command" || source.device_id !== device.deviceId) throw notFound();
  return { g, source };
}

export function commandForReading(device: DevicePrincipal, ws: string, goal: string, measure: string) {
  const { g, source } = chosenCommand(device, ws, goal, measure);
  return { goal_version: g.version, executable: source.executable, args: source.args };
}

export async function recordCommandReading(device: DevicePrincipal, ws: string, goal: string, measure: string, b: Body) {
  return tx(() => {
    const { g, source } = chosenCommand(device, ws, goal, measure);
    if (b.goal_version !== g.version) throw conflict("stale_version", "The goal changed before the reading arrived. Review the command and run it again.");
    exactFields(b, ["goal_version", "run_id", "value", "exit_status"], "Command reading");
    const runId = b.run_id;
    if (typeof runId !== "string" || runId.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId))
      throw badRequest("Command run ID must be a valid ID.");
    const status = b.exit_status;
    if (status !== null && (typeof status !== "number" || !Number.isSafeInteger(status) || status < 0 || status > 255))
      throw badRequest("Enter a valid exit status.");
    const value = decimalReading(b.value);
    if (status !== 0 && value !== null) throw badRequest("The reading must be unknown when the command does not succeed.");
    const previous = get<ReadingRow>(`${MEASURE_READINGS} AND source = 'command' AND goal_version = ? AND command_run_id = ?`,
      ws, goal, measure, g.version, runId);
    if (previous) {
      const details = JSON.parse(previous.source_ref!) as CommandDetails;
      if (previous.value_text !== value || details.exit_status !== status)
        throw conflict("reading_conflict", "This command run already recorded a different result.");
      return { id: previous.id, created: false };
    }
    const at = nowIso();
    const reading = insertReading(g, measure, device.user.id, value,
      { source: "command", runId, details: { device_id: device.deviceId, exit_status: status } }, at, at, source.stale_after_days);
    return { id: reading.id, created: true };
  });
}
