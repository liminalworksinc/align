import { caps } from "./config";
import { sessionCapError } from "./creation";
import { all, audit, get, run, tx } from "./db";
import { takeDurable } from "./limits";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { event } from "./events";
import { nowIso } from "./ids";
import { goalObj, goalRow, transferFor } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { stopStatus, writeDirective } from "./directives";
import type { DevicePrincipal } from "./devices";
import type { Principal } from "./http";
import { need } from "./workspaces";
import { holdNewlyBound } from "./requests";
import { personName } from "./retention";
import { b64url, iso, nonNegInt, oneOf, optInt, optStr, str, type Body } from "./validate";

// Shared sessions, binding epochs and usage. docs/v2/WIRE.md "Shared sessions".
// A session belongs to the device (and user) that shared it: any other caller gets 404 for its key, except that any
// live device of that user may delete its history (deleteSession).
// Audit rows for session actions name the actor but not the session key, so deleting a session's history leaves no
// row that mentions it.

export interface SessionRow {
  ws_id: string;
  session_key: string;
  user_id: string;
  device_id: string | null;
  harness: "claude-code" | "codex";
  repo_key: string;
  repo_alias: string | null;
  title: string | null;
  started_at: string;
  state: "shared" | "suspended" | "stopped";
  stopped_at: string | null;
  /** Why a stopped session ended when its person did not stop it: its device signed out (lib/v2/devices.ts), or its
   *  person was removed from the workspace or left it (lib/v2/lifecycle.ts). Nothing can reach it any more. */
  ended_reason: EndedReason | null;
  governing_goal_id: string | null;
  governing_alignment_id: string | null;
  agent_stopped: number;
  conflicts: number;
  created_at: string;
  updated_at: string;
}

interface EpochRow {
  ws_id: string;
  session_key: string;
  epoch_id: string;
  goal_id: string | null;
  goal_version_at_start: number | null;
  starts_at: string;
  ends_at: string | null;
  root_turn: string | null;
  cause: string;
  authority: "none" | "own" | "pod" | "alignment";
  alignment_id: string | null;
}

export type EndedReason = "device_signed_out" | "member_removed";

/**
 * End sessions nothing can deliver a stop, a resume or a release to any more (inside the caller's tx()): each one still
 * shared (or suspended) is stopped as stop-sharing would stop it (open epoch closed, no governing goal), marked with
 * why, and the requests still waiting on it expire, each target marked with the same reason (a request no device can
 * answer never stays open, and it says its sessions ended rather than that its goal closed). Its history
 * stays. A stop latch or goal hold already set on the machine stays until the developer runs `align stop-sharing`.
 * Used when a device is revoked (lib/v2/devices.ts) and when a member leaves or is removed (lib/v2/lifecycle.ts).
 * Returns how many ended.
 */
export function endSessions(live: { ws_id: string; session_key: string }[], reason: EndedReason, at: string): number {
  for (const s of live) {
    run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL", at, s.ws_id, s.session_key);
    run(
      `UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), ended_reason = ?, governing_goal_id = NULL,
         governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?`,
      at,
      reason,
      at,
      s.ws_id,
      s.session_key,
    );
    // The target keeps why it expired (C3-1): the request then says its sessions ended, never that the goal closed.
    run(
      "UPDATE v2_request_targets SET state = 'expired', ended_reason = ?, updated_at = ? WHERE ws_id = ? AND session_key = ? AND state IN ('sent','received')",
      reason,
      at,
      s.ws_id,
      s.session_key,
    );
  }
  return live.length;
}

/** The refusal for a time a device sent that lies too far ahead of the server's clock: its clock is off (400
 *  clock_skew with the server's time, as a refresh gets), never a bare bad_request. */
function clockSkew(field: string, sent: string) {
  const minutes = Math.round((Date.parse(sent) - Date.now()) / 60_000);
  return new V2Error(400, "clock_skew", `${field} is ${minutes} minutes ahead of the server's clock; this device's clock is off`, { server_time: nowIso() });
}

const epochOut = (e: EpochRow) => ({ epoch_id: e.epoch_id, goal_id: e.goal_id, goal_version_at_start: e.goal_version_at_start, starts_at: e.starts_at, ends_at: e.ends_at });

export const sessionRow = (ws: string, key: string) => get<SessionRow>("SELECT * FROM v2_sessions WHERE ws_id = ? AND session_key = ?", ws, key);
export const openEpoch = (ws: string, key: string) => get<EpochRow>("SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL", ws, key);

/** The session if this caller owns it (the device that shared it, or its user on the web), else 404. */
export function ownSession(pp: PolicyPrincipal, p: Principal, key: string): SessionRow {
  const s = sessionRow(pp.wsId, key);
  if (!s) throw notFound();
  need(pp, "session.manage", { kind: "session", ownerId: s.user_id });
  if (p.kind === "device" && s.device_id !== p.deviceId) throw notFound();
  return s;
}

const shareOut = (s: SessionRow) => {
  const e = openEpoch(s.ws_id, s.session_key);
  return { session_key: s.session_key, state: s.state as "shared" | "suspended" | "stopped", current_epoch: e ? epochOut(e) : null };
};

export async function putSession(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  need(pp, "session.share");
  const harness = oneOf(b, "harness", ["claude-code", "codex"] as const);
  const repoKey = b64url(b, "repo_key", 43, 43);
  const alias = optStr(b, "repo_alias", 100);
  const startedAt = iso(b, "started_at");
  if (Date.parse(startedAt) > Date.now() + FUTURE_SKEW_MS) throw clockSkew("started_at", startedAt);
  const title = optStr(b, "title", 200);
  const at = nowIso();
  const out = await tx(() => {
    const s = sessionRow(pp.wsId, key);
    const ended = s?.state === "stopped" && (s.ended_reason === "device_signed_out" ? s.device_id !== dev.deviceId : s.ended_reason === "member_removed");
    if (s && ended && s.user_id === dev.user.id) {
      // The session ended because the machine that shared it signed out, or because its person left the workspace (and
      // has been let back in): the same person's machine, paired again (it still derives the same session key from its
      // local secret), shares it again from now on.
      if (s.harness !== harness || s.repo_key !== repoKey) throw conflict("session_conflict", "This session key was shared with a different harness or repo");
      run(
        "UPDATE v2_sessions SET device_id = ?, state = 'shared', stopped_at = NULL, ended_reason = NULL, repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?",
        dev.deviceId,
        alias,
        title,
        at,
        pp.wsId,
        key,
      );
      audit(pp.wsId, dev.user.id, "session.shared_again", null, at);
    } else if (s) {
      if (s.user_id !== dev.user.id) throw notFound();
      // A session its person stopped sharing stays stopped, whichever of their devices asks (C4-8): the same answer the
      // device that shared it gets, not a 404 that reads as "another device holds it".
      if (s.state === "stopped") throw conflict("sharing_stopped", "Sharing was stopped for this session");
      if (s.device_id !== dev.deviceId) throw notFound();
      if (s.harness !== harness || s.repo_key !== repoKey) throw conflict("session_conflict", "This session key was shared with a different harness or repo");
      run("UPDATE v2_sessions SET repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", alias, title, at, pp.wsId, key);
    } else {
      // Hosted: at most ALIGN_MAX_SESSIONS_PER_DEVICE_DAY new sessions per device in any 24 hours (counted durably, so
      // deleting a session doesn't give the slot back).
      const c = caps();
      if (c && !takeDurable([{ key: `sessions-device:${dev.deviceId}`, max: c.sessionsPerDeviceDay, windowMs: 24 * 3600 * 1000 }])) throw sessionCapError(c.sessionsPerDeviceDay);
      run(
        `INSERT INTO v2_sessions (ws_id, session_key, user_id, device_id, harness, repo_key, repo_alias, title, started_at, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', ?, ?)`,
        pp.wsId,
        key,
        dev.user.id,
        dev.deviceId,
        harness,
        repoKey,
        alias,
        title,
        startedAt,
        at,
        at,
      );
      // The workspace's first shared session, and each person's first in it.
      event("first_session_captured", { ws: pp.wsId, user: dev.user.id, props: { harness }, at });
      event("member_first_session_captured", { ws: pp.wsId, user: dev.user.id, props: { harness }, at });
    }
    return shareOut(sessionRow(pp.wsId, key)!);
  });
  if (out.state === "stopped") throw conflict("sharing_stopped", "Sharing was stopped for this session");
  return out;
}

const EPOCH_ID = /^ep_[A-Za-z0-9_-]{22,64}$/;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export async function openBindingEpoch(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  const s = ownSession(pp, dev, key);
  if (s.state === "stopped") throw conflict("sharing_stopped", "Sharing was stopped for this session");
  const epochId = str(b, "epoch_id", 70);
  if (!EPOCH_ID.test(epochId)) throw badRequest("epoch_id must be ep_ followed by 22+ url-safe characters");
  const goalId = b.goal_id === null || b.goal_id === undefined ? null : str(b, "goal_id", 64);
  const startsAt = iso(b, "starts_at");
  const rootTurn = optStr(b, "root_turn", 200);
  const cause = str(b, "cause", 80);
  if (cause !== "manual" && !/^directive:dir_[a-z2-7]{24}$/.test(cause)) throw badRequest('cause must be "manual" or "directive:<dir_id>"');
  if (cause !== "manual" && !get("SELECT 1 AS x FROM v2_directive_targets WHERE ws_id = ? AND directive_id = ? AND session_key = ?", pp.wsId, cause.slice(10), key)) {
    throw badRequest("cause names a directive that was not sent to this session");
  }
  if (Date.parse(startsAt) > Date.now() + FUTURE_SKEW_MS) throw clockSkew("starts_at", startsAt);
  // A start stored in the future came from a clock that ran ahead: an epoch from the corrected clock moves it back
  // (below, in the transaction) instead of waiting for real time to catch up.
  const futureStart = Date.parse(s.started_at) > Date.now();
  if (Date.parse(startsAt) < Date.parse(s.started_at) && !futureStart) throw badRequest("starts_at is before the session started");

  // Idempotent: the same epoch again returns it; the same id with other values is a conflict.
  const same = get<EpochRow>("SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", pp.wsId, key, epochId);
  if (same) {
    if (same.goal_id === goalId && same.starts_at === startsAt) return epochOut(same);
    throw conflict("epoch_conflict", "This epoch id was already used with different values");
  }

  // Authority for the binding: own goal, pod goal, or an approved allocation transfer for this session.
  let authority: EpochRow["authority"] = "none";
  let alignmentId: string | null = null;
  let version: number | null = null;
  if (goalId) {
    const g = goalRow(pp.wsId, goalId);
    if (!g || !canReadGoal(pp, goalObj(g))) throw notFound();
    const transfer = transferFor(pp.wsId, key, goalId);
    const d = authorize(pp, "goal.bind", { kind: "bind", goal: goalObj(g), hasTransfer: !!transfer });
    if (!d.ok) throw new V2Error(d.status, d.code, d.message);
    if (g.status !== "active") throw conflict("goal_not_active", "That goal is no longer active");
    authority = g.owner_id === pp.userId ? "own" : g.pod_id && pp.pods.has(g.pod_id) ? "pod" : "alignment";
    alignmentId = authority === "alignment" ? transfer : null;
    version = g.version;
  }

  const at = nowIso();
  const out = await tx(() => {
    const open = openEpoch(pp.wsId, key);
    const lastEnd = get<{ m: string | null }>("SELECT MAX(ends_at) AS m FROM v2_epochs WHERE ws_id = ? AND session_key = ?", pp.wsId, key)?.m ?? null;
    if (open && startsAt < open.starts_at) throw conflict("epoch_overlap", "starts_at is before the current epoch started");
    if (lastEnd && startsAt < lastEnd) throw conflict("epoch_overlap", "starts_at is before the last epoch ended");
    if (open) run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", startsAt, pp.wsId, key, open.epoch_id);
    if (startsAt < s.started_at) run("UPDATE v2_sessions SET started_at = ? WHERE ws_id = ? AND session_key = ?", startsAt, pp.wsId, key);
    run(
      `INSERT INTO v2_epochs (ws_id, session_key, epoch_id, goal_id, goal_version_at_start, starts_at, root_turn, cause, authority, alignment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pp.wsId,
      key,
      epochId,
      goalId,
      version,
      startsAt,
      rootTurn,
      cause,
      authority,
      alignmentId,
      at,
    );
    // Picking a goal ends a suspension. A manual binding to another goal ends any governing goal.
    const cur = sessionRow(pp.wsId, key)!;
    const keepGoverning = cur.governing_goal_id !== null && cur.governing_goal_id === goalId;
    run(
      "UPDATE v2_sessions SET state = 'shared', governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?",
      keepGoverning ? cur.governing_goal_id : null,
      keepGoverning ? cur.governing_alignment_id : null,
      at,
      pp.wsId,
      key,
    );
    // A held goal holds this session too.
    if (goalId) holdNewlyBound(pp.wsId, goalId, key);
    // First value: the first time a session in this workspace is bound to a goal.
    if (goalId && authority !== "none") event("first_session_bound", { ws: pp.wsId, user: pp.userId, props: { harness: cur.harness, authority }, at });
    return epochOut(get<EpochRow>("SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", pp.wsId, key, epochId)!);
  });
  return out;
}

const QUERY_SOURCES = ["main", "subagent", "auxiliary", "unknown"] as const;
const BASES = ["api_usd", "subscription_included", "workspace_credits", "estimated_list_usd", "unknown"] as const;
const SOURCES = ["otel", "transcript", "rollout"] as const;
export const USAGE_FIELDS = ["epoch_id", "ts", "model", "query_source", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "basis", "est_list_usd_micros", "price_table_version", "source"] as const;

type UsageRow = Record<(typeof USAGE_FIELDS)[number] | "request_key", string | number | null>;

function usageRowIn(v: unknown, i: number): UsageRow {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest(`rows[${i}] must be an object`);
  const b = v as Body;
  try {
    return {
      request_key: b64url(b, "request_key", 16, 128),
      epoch_id: str(b, "epoch_id", 70),
      ts: iso(b, "ts"),
      model: str(b, "model", 100),
      query_source: oneOf(b, "query_source", QUERY_SOURCES),
      input: nonNegInt(b, "input"),
      output: nonNegInt(b, "output"),
      cache_read: nonNegInt(b, "cache_read"),
      cache_write_5m: nonNegInt(b, "cache_write_5m"),
      cache_write_1h: nonNegInt(b, "cache_write_1h"),
      cache_write_unsplit: nonNegInt(b, "cache_write_unsplit"),
      basis: oneOf(b, "basis", BASES),
      est_list_usd_micros: optInt(b, "est_list_usd_micros"),
      price_table_version: optStr(b, "price_table_version", 64),
      source: oneOf(b, "source", SOURCES),
    };
  } catch (e) {
    if (e instanceof V2Error) throw badRequest(`rows[${i}]: ${e.message}`);
    throw e;
  }
}

/** Idempotent usage batch: INSERT OR IGNORE on (ws, session_key, request_key). The same key with different values is
 *  a conflict and never overwrites; a row whose epoch is unknown or another session's is a conflict too. */
export async function ingestUsage(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  const s = ownSession(pp, dev, key);
  if (s.state === "stopped") throw conflict("sharing_stopped", "Sharing was stopped for this session");
  if (!Array.isArray(b.rows)) throw badRequest("rows must be a list");
  if (b.rows.length > 500) throw new V2Error(413, "too_many_rows", "At most 500 rows per batch");
  const rows = b.rows.map(usageRowIn);
  const at = nowIso();
  return tx(() => {
    const epochs = new Set(all<{ epoch_id: string }>("SELECT epoch_id FROM v2_epochs WHERE ws_id = ? AND session_key = ?", pp.wsId, key).map((e) => e.epoch_id));
    let accepted = 0;
    let duplicates = 0;
    let conflicts = 0;
    for (const r of rows) {
      if (!epochs.has(r.epoch_id as string)) {
        conflicts++;
        continue;
      }
      const n = run(
        `INSERT OR IGNORE INTO v2_usage (ws_id, session_key, request_key, ${USAGE_FIELDS.join(", ")}, received_at)
         VALUES (?, ?, ?, ${USAGE_FIELDS.map(() => "?").join(", ")}, ?)`,
        pp.wsId,
        key,
        r.request_key,
        ...USAGE_FIELDS.map((f) => r[f]),
        at,
      );
      if (n) {
        accepted++;
        continue;
      }
      const prev = get<Record<string, unknown>>(`SELECT ${USAGE_FIELDS.join(", ")} FROM v2_usage WHERE ws_id = ? AND session_key = ? AND request_key = ?`, pp.wsId, key, r.request_key);
      if (prev && USAGE_FIELDS.every((f) => prev[f] === r[f])) duplicates++;
      else conflicts++;
    }
    if (conflicts) run("UPDATE v2_sessions SET conflicts = conflicts + ? WHERE ws_id = ? AND session_key = ?", conflicts, pp.wsId, key);
    return { accepted, duplicates, conflicts };
  });
}

/** Stop sharing (future only): no more uploads; the open epoch ends now. History stays until deleted. */
export async function stopSharing(pp: PolicyPrincipal, p: Principal, key: string) {
  ownSession(pp, p, key);
  const at = nowIso();
  await tx(() => {
    run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL", at, pp.wsId, key);
    run(
      "UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?",
      at,
      at,
      pp.wsId,
      key,
    );
    audit(pp.wsId, pp.userId, "session.sharing_stopped", null, at);
  });
  return { session_key: key, state: "stopped" as const };
}

/** Delete shared history: the session, its epochs, usage, directive deliveries and receipts, hard-deleted.
 *  Spend totals change. Directives left with no recipient are removed too. Unlike the session's other calls, any live
 *  device of the person who shared it may do this, not only the device that shared it (C4-1): a re-pair would
 *  otherwise strand the history where only the web could delete it. The audit row names the device that did it. */
export async function deleteSession(pp: PolicyPrincipal, p: Principal, key: string) {
  const s = sessionRow(pp.wsId, key);
  if (!s) throw notFound();
  need(pp, "session.manage", { kind: "session", ownerId: s.user_id });
  await tx(() => {
    run("DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?", pp.wsId, key);
    run("DELETE FROM v2_directives WHERE ws_id = ? AND NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)", pp.wsId);
    audit(pp.wsId, pp.userId, "session.history_deleted", p.kind === "device" ? p.deviceId : null, nowIso());
  });
}

/** Stop or resume the session's agent (its local stop latch). The session owner or a workspace owner. */
export async function setAgentStop(pp: PolicyPrincipal, key: string, stop: boolean) {
  const s = sessionRow(pp.wsId, key);
  if (!s) throw notFound();
  need(pp, "session.stop", { kind: "session", ownerId: s.user_id });
  // Never report a stop or resume as sent when nothing can deliver it.
  if (s.ended_reason === "device_signed_out") {
    throw conflict(
      "device_signed_out",
      "The machine that shared this session signed out of Align, so its sharing ended and a stop or resume can't reach it. If it was stopped, it stays stopped until its developer runs align stop-sharing there.",
    );
  }
  if (s.ended_reason === "member_removed") {
    throw conflict(
      "member_removed",
      "This session's developer is no longer a member of this workspace, so its sharing ended and a stop or resume can't reach it. If it was stopped, it stays stopped until they run align stop-sharing on their machine.",
    );
  }
  if (s.state === "stopped") throw conflict("sharing_stopped", "Sharing was stopped for this session");
  const at = nowIso();
  const id = await tx(() => {
    run("UPDATE v2_sessions SET agent_stopped = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", stop ? 1 : 0, at, pp.wsId, key);
    audit(pp.wsId, pp.userId, stop ? "session.agent_stopped" : "session.agent_resumed", null, at);
    return writeDirective(pp.wsId, stop ? "stop" : "resume", [key], null, null);
  });
  return { directive_id: id, agent_stopped: stop };
}

/** The sessions page: the caller's own shared sessions in full; for workspace owners, every shared session's
 *  alias, owner, start and state (for stop/resume), never its title or usage. */
export function listSessions(pp: PolicyPrincipal) {
  const goalLabel = (id: string | null) => {
    if (!id) return null;
    const g = goalRow(pp.wsId, id);
    return g && canReadGoal(pp, goalObj(g)) ? { id: g.id, title: g.title, version: g.version } : { id: null, title: null, private: true };
  };
  const mine = all<SessionRow>("SELECT * FROM v2_sessions WHERE ws_id = ? AND user_id = ? ORDER BY started_at DESC", pp.wsId, pp.userId).map((s) => {
    const e = openEpoch(pp.wsId, s.session_key);
    const tokens = get<{ requests: number; input: number; output: number }>(
      "SELECT COUNT(*) AS requests, COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output FROM v2_usage WHERE ws_id = ? AND session_key = ?",
      pp.wsId,
      s.session_key,
    );
    return {
      session_key: s.session_key,
      harness: s.harness,
      repo_alias: s.repo_alias,
      title: s.title,
      started_at: s.started_at,
      state: s.state,
      stopped_at: s.stopped_at,
      ended_reason: s.ended_reason,
      current_epoch: e ? { ...epochOut(e), goal: goalLabel(e.goal_id) } : null,
      governing_goal: goalLabel(s.governing_goal_id),
      agent_stopped: !!s.agent_stopped,
      stop_status: stopStatus(pp.wsId, s.session_key),
      conflicts: s.conflicts,
      usage: tokens,
    };
  });
  const everyone =
    pp.wsRole === "owner"
      ? all<SessionRow & { owner_name: string | null }>(
          "SELECT s.*, u.name AS owner_name FROM v2_sessions s LEFT JOIN ba_user u ON u.id = s.user_id WHERE s.ws_id = ? AND s.state <> 'stopped' ORDER BY s.started_at DESC",
          pp.wsId,
        ).map((s) => ({
          session_key: s.session_key,
          owner: { id: s.user_id, name: personName(s.user_id, s.owner_name) },
          repo_alias: s.repo_alias,
          harness: s.harness,
          // When it started: with the key's end, it tells one person's sessions in one repository apart (W3).
          started_at: s.started_at,
          state: s.state,
          agent_stopped: !!s.agent_stopped,
          stop_status: stopStatus(pp.wsId, s.session_key),
        }))
      : null;
  return { mine, all: everyone };
}
