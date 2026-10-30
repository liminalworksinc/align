import { all, get, run, tx } from "./db";
import { sessionMaxDays, testIdpEnabled } from "./config";

// The retention schedule (docs/RETENTION.md): one idempotent job, runRetention(now), run at every server start and
// every 24 hours (instrumentation.ts), and by the operator with `node scripts/retention.mjs [--dry-run]`.
//   1. A workspace deleted more than 30 days ago is purged: every row, its audit included.
//   2. A shared session whose end (stop, else its last activity) is more than 13 months old is rolled up into
//      v2_spend_rollups (workspace, goal, UTC day, model, basis: no person, no session) and its rows are deleted.
//   3. A person who left or was removed more than 30 days ago becomes "Former member #n" in that workspace's rows.
//   4. Audit rows older than 1 year are deleted.
//   5. Expired email codes (and other expired Better Auth verification values), expired sign-in sessions and those
//      past the absolute cap (ALIGN_SESSION_MAX_DAYS after their sign-in: lib/v2/auth.ts), expired activity signals,
//      and invites 7 days past their expiry are deleted.
// This module imports only the database helpers, so scripts/retention.mjs can load it outside Next (Node strips the
// types). Account deletion (lib/v2/account.ts) uses pseudonymise() at once instead of after 30 days.

export const RESTORE_DAYS = 30;
export const FORMER_MEMBER_DAYS = 30;
export const SESSION_MONTHS = 13;
export const AUDIT_MONTHS = 12;
export const INVITE_GRACE_DAYS = 7;
export const RETENTION_INTERVAL_MS = 24 * 3600 * 1000;

const DAY_MS = 24 * 3600 * 1000;
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
const monthsBefore = (now: Date, months: number) => {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
};

/** The time the job runs at: now, or ALIGN_TEST_NOW for tests (only with ALIGN_TEST_IDP=1, never hosted). */
export function retentionNow(env: NodeJS.ProcessEnv = process.env): Date {
  if (testIdpEnabled(env) && env.ALIGN_TEST_NOW) {
    const t = Date.parse(env.ALIGN_TEST_NOW);
    if (Number.isFinite(t)) return new Date(t);
  }
  return new Date();
}

// ---- former members ----

/** A pseudonymised person in one workspace: fm_<n>, shown as "Former member #n". */
const FORMER = /^fm_(\d+)$/;
export const formerMemberId = (n: number) => `fm_${n}`;

/** The name to show for a person id in a workspace's rows: "Former member #n" for a pseudonym, `name` when the
 *  account exists, else "Former member". */
export function personName(id: string, name: string | null | undefined): string {
  const m = FORMER.exec(id);
  if (m) return `Former member #${m[1]}`;
  return name ?? "Former member";
}

/** Columns that name a person in a workspace's rows (ws_id names the workspace). Pseudonymisation rewrites each. */
export const PERSON_COLUMNS: readonly (readonly [table: string, column: string])[] = [
  ["v2_invites", "created_by"],
  ["v2_goals", "owner_id"],
  ["v2_goal_versions", "created_by"],
  ["v2_audit", "actor_id"],
  ["v2_audit", "object_id"],
  ["v2_alignments", "requester_id"],
  ["v2_alignments", "revoked_by"],
  ["v2_alignment_revisions", "author_id"],
  ["v2_alignment_approvals", "user_id"],
  ["v2_sessions", "user_id"],
  ["v2_activity", "user_id"],
  ["v2_change_requests", "requester_id"],
  ["v2_change_requests", "approved_by"],
  ["v2_change_requests", "rejected_by"],
  ["v2_change_request_revisions", "author_id"],
];

/** Every workspace whose rows name this person (or hold their pending departure). */
export function workspacesNaming(userId: string): string[] {
  const parts = PERSON_COLUMNS.map(([t, c]) => `SELECT ws_id FROM ${t} WHERE ${c} = ?1 AND ws_id IS NOT NULL`);
  parts.push("SELECT id AS ws_id FROM v2_workspaces WHERE created_by = ?1");
  parts.push("SELECT ws_id FROM v2_former_members WHERE user_id = ?1");
  parts.push("SELECT ws_id FROM v2_alignment_revisions WHERE instr(approvers_json, ?1) > 0");
  parts.push("SELECT ws_id FROM v2_directives WHERE goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?1");
  parts.push("SELECT ws_id FROM v2_invites WHERE accepted_by = ?1");
  return all<{ ws_id: string }>(parts.join(" UNION "), userId).map((r) => r.ws_id);
}

/** Note that a person left or was removed (call inside the removal's tx): 30 days later they become a former member
 *  in this workspace's rows. Leaving again before then keeps the first date. */
export function noteDeparture(wsId: string, userId: string, at: string) {
  run("INSERT OR IGNORE INTO v2_former_members (ws_id, user_id, removed_at) VALUES (?, ?, ?)", wsId, userId, at);
}

/** A person joined again before being pseudonymised: their pending departure is dropped. */
export function cancelDeparture(wsId: string, userId: string) {
  run("DELETE FROM v2_former_members WHERE ws_id = ? AND user_id = ? AND n IS NULL", wsId, userId);
}

/** Replace a person's identity in one workspace's rows with "Former member #n" (n stable in that workspace), clear
 *  their sessions' device, and drop their email from the workspace (invites to or accepted by them). Call inside a
 *  tx, after the person's membership is gone. Returns the pseudonym. */
export function pseudonymise(wsId: string, userId: string, at: string): string {
  const n = (get<{ n: number | null }>("SELECT MAX(n) AS n FROM v2_former_members WHERE ws_id = ?", wsId)?.n ?? 0) + 1;
  const pending = get<{ id: number; removed_at: string }>("SELECT rowid AS id, removed_at FROM v2_former_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
  if (pending) run("UPDATE v2_former_members SET user_id = NULL, n = ?, pseudonymised_at = ? WHERE rowid = ?", n, at, pending.id);
  else run("INSERT INTO v2_former_members (ws_id, user_id, n, removed_at, pseudonymised_at) VALUES (?, NULL, ?, ?, ?)", wsId, n, at, at);
  const pid = formerMemberId(n);
  const email = get<{ email: string }>("SELECT lower(email) AS email FROM ba_user WHERE id = ?", userId)?.email ?? null;
  run("DELETE FROM v2_invites WHERE ws_id = ? AND (accepted_by = ? OR (? IS NOT NULL AND lower(email) = ?))", wsId, userId, email, email);
  run("UPDATE v2_sessions SET device_id = NULL WHERE ws_id = ? AND user_id = ?", wsId, userId);
  for (const [t, c] of PERSON_COLUMNS) run(`UPDATE ${t} SET ${c} = ? WHERE ws_id = ? AND ${c} = ?`, pid, wsId, userId);
  run("UPDATE v2_workspaces SET created_by = ? WHERE id = ? AND created_by = ?", pid, wsId, userId);
  // Approval requirements (sets, approved_by, "sessions:<user id>") hold ids inside JSON; ids are 24 random
  // characters, so a plain replacement touches nothing else.
  run("UPDATE v2_alignment_revisions SET approvers_json = replace(approvers_json, ?, ?) WHERE ws_id = ? AND instr(approvers_json, ?) > 0", userId, pid, wsId, userId);
  // A directive's goal snapshot names the goal's owner.
  run(
    "UPDATE v2_directives SET goal_json = json_set(goal_json, '$.owner', json_object('id', ?, 'name', ?)) WHERE ws_id = ? AND goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?",
    pid,
    personName(pid, null),
    wsId,
    userId,
  );
  return pid;
}

// ---- purge, roll-up and trims ----

/** Every row of a workspace, its audit and the devices' grants for it included (other rows cascade). */
export function purgeWorkspace(wsId: string) {
  run("DELETE FROM v2_device_grants WHERE ws_id = ?", wsId);
  run("DELETE FROM v2_audit WHERE ws_id = ?", wsId);
  for (const r of all<{ id: string; ws_ids_json: string }>("SELECT id, ws_ids_json FROM v2_device_requests WHERE ws_ids_json IS NOT NULL")) {
    const ids = JSON.parse(r.ws_ids_json) as string[];
    if (ids.includes(wsId)) run("UPDATE v2_device_requests SET ws_ids_json = ? WHERE id = ?", JSON.stringify(ids.filter((w) => w !== wsId)), r.id);
  }
  run("DELETE FROM v2_workspaces WHERE id = ?", wsId);
}

/** Directives left with no recipient (their sessions were deleted or rolled up). */
export const deleteOrphanDirectives = () => run("DELETE FROM v2_directives WHERE NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)");

const ROLLUP_SUMS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "est_list_usd_micros", "unpriced_requests"] as const;

/** Add one session's usage to the roll-ups, then delete the session (its epochs, usage, deliveries and receipts
 *  cascade). Returns the number of usage rows rolled up. */
function rollUpSession(wsId: string, key: string): number {
  const rows = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_usage WHERE ws_id = ? AND session_key = ?", wsId, key)?.n ?? 0;
  run(
    `INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, ${ROLLUP_SUMS.join(", ")})
     SELECT u.ws_id, COALESCE(e.goal_id, ''), substr(u.ts, 1, 10), u.model, u.basis,
            COUNT(*), SUM(u.input), SUM(u.output), SUM(u.cache_read), SUM(u.cache_write_5m), SUM(u.cache_write_1h), SUM(u.cache_write_unsplit),
            COALESCE(SUM(u.est_list_usd_micros), 0), SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END)
     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND u.session_key = ?
     GROUP BY 1, 2, 3, 4, 5
     ON CONFLICT (ws_id, goal_id, day, model, basis) DO UPDATE SET ${ROLLUP_SUMS.map((k) => `${k} = ${k} + excluded.${k}`).join(", ")}`,
    wsId,
    key,
  );
  run("DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?", wsId, key);
  return rows;
}

const tableExists = (name: string) => !!get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", name);

export interface RetentionCounts {
  workspaces_purged: number;
  sessions_rolled_up: number;
  usage_rows_rolled_up: number;
  former_members_pseudonymised: number;
  audit_rows_deleted: number;
  codes_deleted: number;
  sign_in_sessions_deleted: number;
  activity_deleted: number;
  invites_deleted: number;
}

const STEPS: ((now: Date, c: RetentionCounts) => void)[] = [
  // 1. Deleted workspaces past the restore window.
  (now, c) => {
    for (const w of all<{ id: string }>("SELECT id FROM v2_workspaces WHERE deleted_at IS NOT NULL AND deleted_at <= ?", daysBefore(now, RESTORE_DAYS))) {
      purgeWorkspace(w.id);
      c.workspaces_purged++;
    }
  },
  // 2. Sessions whose end (stop, else last activity: the row, its last upload or epoch) is 13 months old.
  (now, c) => {
    const old = all<{ ws_id: string; session_key: string }>(
      `SELECT s.ws_id, s.session_key FROM v2_sessions s
       WHERE COALESCE(s.stopped_at, max(s.updated_at,
               COALESCE((SELECT MAX(u.received_at) FROM v2_usage u WHERE u.ws_id = s.ws_id AND u.session_key = s.session_key), ''),
               COALESCE((SELECT MAX(e.created_at) FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key), ''))) < ?`,
      monthsBefore(now, SESSION_MONTHS),
    );
    for (const s of old) {
      c.usage_rows_rolled_up += rollUpSession(s.ws_id, s.session_key);
      c.sessions_rolled_up++;
    }
    if (old.length) deleteOrphanDirectives();
  },
  // 3. People who left or were removed 30 days ago (unless they are members again).
  (now, c) => {
    const at = now.toISOString();
    for (const f of all<{ ws_id: string; user_id: string }>(
      "SELECT ws_id, user_id FROM v2_former_members WHERE user_id IS NOT NULL AND n IS NULL AND removed_at <= ? ORDER BY removed_at, rowid",
      daysBefore(now, FORMER_MEMBER_DAYS),
    )) {
      if (get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", f.ws_id, f.user_id)) cancelDeparture(f.ws_id, f.user_id);
      else {
        pseudonymise(f.ws_id, f.user_id, at);
        c.former_members_pseudonymised++;
      }
    }
  },
  // 4. The audit log keeps 1 year.
  (now, c) => {
    c.audit_rows_deleted += run("DELETE FROM v2_audit WHERE at < ?", monthsBefore(now, AUDIT_MONTHS));
  },
  // 5. Expired codes, sign-in sessions (expired, or past the absolute cap) and activity signals; invites 7 days after
  //    they expire.
  (now, c) => {
    const at = now.toISOString();
    if (tableExists("ba_verification")) c.codes_deleted += run("DELETE FROM ba_verification WHERE expiresAt < ?", at);
    if (tableExists("ba_session")) c.sign_in_sessions_deleted += run("DELETE FROM ba_session WHERE expiresAt < ? OR createdAt < ?", at, daysBefore(now, sessionMaxDays()));
    c.activity_deleted += run("DELETE FROM v2_activity WHERE expires_at < ?", at);
    c.invites_deleted += run("DELETE FROM v2_invites WHERE accepted_at IS NULL AND expires_at < ?", daysBefore(now, INVITE_GRACE_DAYS));
  },
];

const ROLLBACK = Symbol("dry run");

/** Apply the schedule as of `now`. Each step is one transaction; a dry run does every step in one transaction and
 *  rolls it back, so its counts are exactly what a real run would do. Running it again changes nothing. */
export async function runRetention(now: Date, { dryRun = false }: { dryRun?: boolean } = {}): Promise<RetentionCounts> {
  const c: RetentionCounts = {
    workspaces_purged: 0,
    sessions_rolled_up: 0,
    usage_rows_rolled_up: 0,
    former_members_pseudonymised: 0,
    audit_rows_deleted: 0,
    codes_deleted: 0,
    sign_in_sessions_deleted: 0,
    activity_deleted: 0,
    invites_deleted: 0,
  };
  if (dryRun) {
    try {
      await tx(() => {
        for (const s of STEPS) s(now, c);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
    return c;
  }
  for (const s of STEPS) await tx(() => s(now, c));
  return c;
}

/** One line for the log: counts only, never a name, email or id. */
export function describeCounts(c: RetentionCounts): string {
  return Object.entries(c)
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(", ");
}

// ---- the server's schedule ----

const g = globalThis as unknown as { __alignRetention?: ReturnType<typeof setInterval> };

async function runLogged(hosted: boolean) {
  try {
    const c = await runRetention(retentionNow());
    if (Object.values(c).some((v) => v > 0)) console.log(`Align retention: ${describeCounts(c)}`);
  } catch (e) {
    console.error("Align retention failed:", hosted ? ((e as Error)?.name ?? "unknown") : e);
  }
}

/** Run the job now and every 24 hours in this server process (instrumentation.ts; never during a build). */
export async function startRetention(hosted: boolean) {
  await runLogged(hosted);
  if (g.__alignRetention) return;
  g.__alignRetention = setInterval(() => void runLogged(hosted), RETENTION_INTERVAL_MS);
  g.__alignRetention.unref?.();
}
