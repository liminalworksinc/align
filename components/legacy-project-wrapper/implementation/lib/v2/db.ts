import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { config } from "../config";
import { SCHEMA_VERSION, type Sql } from "./core.mts";

// Goal sessions storage: one SQLite file (WAL) at <ALIGN_DATA_DIR or ./data>/v2/align.sqlite, directory 0700, file 0600.
// Two connections to the same file:
//   auth   - Better Auth's (its Kysely adapter runs async transactions on it)
//   domain - ours. Every domain write runs inside tx(): BEGIN IMMEDIATE ... COMMIT within one synchronous call,
//            so no domain transaction ever spans an await. busy_timeout is 0 here, and tx() retries a busy start
//            asynchronously, so it never blocks the event loop while Better Auth finishes a transaction.
// No SQLite-specific domain logic beyond SQL itself (plan item 11: Postgres before multi-instance hosting).

type Row = Record<string, unknown>;

interface V2Db {
  file: string;
  domain: DatabaseSync;
  auth: DatabaseSync;
  stmts: Map<string, StatementSync>;
}

const g = globalThis as unknown as { __alignV2Db?: V2Db };

export const dbDir = () => path.join(config().dataDir, "v2");
export const dbFile = () => path.join(dbDir(), "align.sqlite");

function lockDown(file: string) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      if (existsSync(/*turbopackIgnore: true*/ f)) chmodSync(/*turbopackIgnore: true*/ f, 0o600);
    } catch {}
  }
}

function connect(file: string, busyMs: number): DatabaseSync {
  const d = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: busyMs });
  d.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = ${busyMs}; PRAGMA synchronous = NORMAL;`);
  return d;
}

/** Open both connections once per process (shared across route bundles through globalThis). */
export function openDb(): V2Db {
  if (g.__alignV2Db) return g.__alignV2Db;
  const dir = dbDir();
  mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o700 });
  chmodSync(/*turbopackIgnore: true*/ dir, 0o700);
  const file = dbFile();
  const auth = connect(file, 5000);
  lockDown(file);
  const domain = connect(file, 0);
  lockDown(file);
  g.__alignV2Db = { file, domain, auth, stmts: new Map() };
  return g.__alignV2Db;
}

export const authDb = () => openDb().auth;

function stmt(sql: string): StatementSync {
  const d = openDb();
  let s = d.stmts.get(sql);
  if (!s) {
    s = d.domain.prepare(sql);
    d.stmts.set(sql, s);
  }
  return s;
}

export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return stmt(sql).all(...params) as T[];
}
export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return stmt(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: SQLInputValue[]): number {
  return Number(stmt(sql).run(...params).changes);
}
/** The statement helpers as one value, for lib/v2/core.mts. */
export const sql: Sql = { run, get, all };

export function exec(sql: string) {
  openDb().domain.exec(sql);
}

const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(String((e as Error)?.message ?? e)) || (e as { errcode?: number })?.errcode === 5;

let depth = 0;
/** Run `fn` synchronously inside BEGIN IMMEDIATE ... COMMIT (ROLLBACK if it throws). A busy start is retried
 *  asynchronously for up to ~5 s. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => T): Promise<T> {
  if (depth > 0) return fn();
  const d = openDb().domain;
  for (let attempt = 0; ; attempt++) {
    try {
      d.exec("BEGIN IMMEDIATE");
      break;
    } catch (e) {
      if (!isBusy(e) || attempt >= 100) throw e;
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 25));
    }
  }
  depth++;
  try {
    const out = fn();
    if (out instanceof Promise) throw new Error("tx() callbacks must be synchronous");
    d.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      d.exec("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    depth--;
  }
}

// ---- migrations (PRAGMA user_version; every table prefixed v2_) ----
// Composite foreign keys (ws_id, id) everywhere a row points at a workspace-scoped row, so a reference across
// workspaces cannot be stored. Better Auth's tables (ba_user, ba_session, ba_account, ba_verification, ba_passkey) are
// created first by its own migrations (lib/v2/auth.ts).
const MIGRATIONS: string[] = [
  `
  CREATE TABLE v2_workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE v2_members (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner','member','viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, user_id)
  );
  CREATE INDEX v2_members_user ON v2_members(user_id);
  CREATE TABLE v2_invites (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','member','viewer')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    accepted_by TEXT,
    UNIQUE (ws_id, id)
  );
  CREATE TABLE v2_pods (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (ws_id, id)
  );
  CREATE TABLE v2_pod_members (
    ws_id TEXT NOT NULL,
    pod_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('lead','member')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (pod_id, user_id),
    FOREIGN KEY (ws_id, pod_id) REFERENCES v2_pods(ws_id, id) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, user_id) REFERENCES v2_members(ws_id, user_id) ON DELETE CASCADE
  );
  CREATE TABLE v2_goals (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    pod_id TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private','pod','workspace')),
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    measures_json TEXT NOT NULL,
    anchors_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','achieved','dropped')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (ws_id, id),
    CHECK (visibility <> 'pod' OR pod_id IS NOT NULL),
    FOREIGN KEY (ws_id, owner_id) REFERENCES v2_members(ws_id, user_id),
    FOREIGN KEY (ws_id, pod_id) REFERENCES v2_pods(ws_id, id)
  );
  CREATE INDEX v2_goals_ws ON v2_goals(ws_id);
  CREATE TABLE v2_goal_versions (
    ws_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    measures_json TEXT NOT NULL,
    anchors_json TEXT NOT NULL,
    status TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, version),
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE
  );
  CREATE TABLE v2_audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ws_id TEXT,
    actor_id TEXT,
    action TEXT NOT NULL,
    object_id TEXT,
    at TEXT NOT NULL
  );

  CREATE TABLE v2_device_requests (
    id TEXT PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    interval_s INTEGER NOT NULL,
    last_poll_at TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending','approved','denied','consumed')),
    user_id TEXT REFERENCES ba_user(id) ON DELETE CASCADE,
    ws_ids_json TEXT,
    device_id TEXT
  );
  CREATE TABLE v2_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at TEXT,
    revoked_reason TEXT
  );
  CREATE INDEX v2_devices_user ON v2_devices(user_id);
  CREATE TABLE v2_device_grants (
    device_id TEXT NOT NULL REFERENCES v2_devices(id) ON DELETE CASCADE,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (device_id, ws_id)
  );
  CREATE TABLE v2_device_tokens (
    token_hash TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES v2_devices(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('access','refresh')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    rotated_at TEXT
  );
  CREATE INDEX v2_device_tokens_device ON v2_device_tokens(device_id);

  CREATE TABLE v2_alignments (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    requester_id TEXT NOT NULL,
    target_goal_id TEXT NOT NULL,
    source_goal_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','revoked')),
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT,
    revoked_at TEXT,
    revoked_by TEXT,
    UNIQUE (ws_id, id),
    FOREIGN KEY (ws_id, requester_id) REFERENCES v2_members(ws_id, user_id),
    FOREIGN KEY (ws_id, target_goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, source_goal_id) REFERENCES v2_goals(ws_id, id)
  );
  CREATE TABLE v2_alignment_revisions (
    ws_id TEXT NOT NULL,
    alignment_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    choice TEXT NOT NULL CHECK (choice IN ('contribution','work_toward')),
    effects_json TEXT NOT NULL,
    approvers_json TEXT NOT NULL,
    note TEXT,
    author_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (alignment_id, revision),
    UNIQUE (ws_id, alignment_id, revision),
    FOREIGN KEY (ws_id, alignment_id) REFERENCES v2_alignments(ws_id, id) ON DELETE CASCADE
  );
  CREATE TABLE v2_alignment_approvals (
    ws_id TEXT NOT NULL,
    alignment_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (alignment_id, revision, user_id),
    FOREIGN KEY (ws_id, alignment_id, revision) REFERENCES v2_alignment_revisions(ws_id, alignment_id, revision) ON DELETE CASCADE
  );

  CREATE TABLE v2_sessions (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL REFERENCES v2_devices(id),
    harness TEXT NOT NULL CHECK (harness IN ('claude-code','codex')),
    repo_key TEXT NOT NULL,
    repo_alias TEXT,
    title TEXT,
    started_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('shared','suspended','stopped')),
    stopped_at TEXT,
    governing_goal_id TEXT,
    governing_alignment_id TEXT,
    agent_stopped INTEGER NOT NULL DEFAULT 0,
    conflicts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, session_key),
    FOREIGN KEY (ws_id, user_id) REFERENCES v2_members(ws_id, user_id),
    FOREIGN KEY (ws_id, governing_goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, governing_alignment_id) REFERENCES v2_alignments(ws_id, id)
  );
  CREATE INDEX v2_sessions_device ON v2_sessions(device_id);
  CREATE TABLE v2_alignment_sessions (
    ws_id TEXT NOT NULL,
    alignment_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    session_key TEXT NOT NULL,
    PRIMARY KEY (alignment_id, revision, session_key),
    FOREIGN KEY (ws_id, alignment_id, revision) REFERENCES v2_alignment_revisions(ws_id, alignment_id, revision) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE
  );
  CREATE INDEX v2_alignment_sessions_key ON v2_alignment_sessions(ws_id, session_key);
  CREATE TABLE v2_epochs (
    ws_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    epoch_id TEXT NOT NULL,
    goal_id TEXT,
    goal_version_at_start INTEGER,
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    root_turn TEXT,
    cause TEXT NOT NULL,
    authority TEXT NOT NULL CHECK (authority IN ('none','own','pod','alignment')),
    alignment_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, session_key, epoch_id),
    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, alignment_id) REFERENCES v2_alignments(ws_id, id)
  );
  CREATE UNIQUE INDEX v2_epochs_open ON v2_epochs(ws_id, session_key) WHERE ends_at IS NULL;
  CREATE TABLE v2_usage (
    ws_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    request_key TEXT NOT NULL,
    epoch_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    model TEXT NOT NULL,
    query_source TEXT NOT NULL,
    input INTEGER NOT NULL,
    output INTEGER NOT NULL,
    cache_read INTEGER NOT NULL,
    cache_write_5m INTEGER NOT NULL,
    cache_write_1h INTEGER NOT NULL,
    cache_write_unsplit INTEGER NOT NULL,
    basis TEXT NOT NULL,
    est_list_usd_micros INTEGER,
    price_table_version TEXT,
    source TEXT NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, session_key, request_key),
    FOREIGN KEY (ws_id, session_key, epoch_id) REFERENCES v2_epochs(ws_id, session_key, epoch_id) ON DELETE CASCADE
  );
  CREATE INDEX v2_usage_ws_ts ON v2_usage(ws_id, ts);

  CREATE TABLE v2_directives (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('goal_version','binding_changed','binding_suspended','stop','resume')),
    goal_id TEXT,
    goal_json TEXT,
    binding_json TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (ws_id, id),
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id)
  );
  CREATE TABLE v2_directive_targets (
    ws_id TEXT NOT NULL,
    directive_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    PRIMARY KEY (directive_id, session_key),
    UNIQUE (ws_id, directive_id, session_key),
    FOREIGN KEY (ws_id, directive_id) REFERENCES v2_directives(ws_id, id) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE
  );
  CREATE INDEX v2_directive_targets_key ON v2_directive_targets(ws_id, session_key);
  CREATE TABLE v2_receipts (
    ws_id TEXT NOT NULL,
    directive_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('received','applied','enforced')),
    at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (directive_id, session_key, state),
    FOREIGN KEY (ws_id, directive_id, session_key) REFERENCES v2_directive_targets(ws_id, directive_id, session_key) ON DELETE CASCADE
  );
  `,
  // 2: the goal tree (dependencies between goals, a child's review of its parents' versions) and in-flight activity.
  `
  ALTER TABLE v2_goals ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE v2_goal_versions ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]';
  CREATE TABLE v2_goal_acks (
    ws_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    parent_version INTEGER NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (goal_id, parent_id),
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, parent_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE
  );
  CREATE TABLE v2_activity (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    goal_id TEXT,
    repo_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('edit','commit','task','claim')),
    path_hash TEXT,
    path TEXT,
    text TEXT,
    at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE
  );
  CREATE INDEX v2_activity_ws ON v2_activity(ws_id, seq);
  CREATE INDEX v2_activity_expiry ON v2_activity(ws_id, expires_at);
  `,
  // 3: company and team goals, invites that name a team, and people who leave. A goal, session or alignment keeps
  // naming a person after they leave or are removed, so those rows no longer point at v2_members (the tables are
  // rebuilt without that foreign key; SQLite can't drop one in place). v2_members holds current members only.
  `
  CREATE TABLE v2_goals_new (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    pod_id TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private','pod','workspace')),
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    measures_json TEXT NOT NULL,
    anchors_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','achieved','dropped')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    depends_on_json TEXT NOT NULL DEFAULT '[]',
    level TEXT NOT NULL DEFAULT 'team' CHECK (level IN ('company','team')),
    UNIQUE (ws_id, id),
    CHECK (visibility <> 'pod' OR pod_id IS NOT NULL),
    CHECK (level <> 'company' OR (pod_id IS NULL AND visibility = 'workspace')),
    FOREIGN KEY (ws_id, pod_id) REFERENCES v2_pods(ws_id, id)
  );
  INSERT INTO v2_goals_new (id, ws_id, owner_id, pod_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at, depends_on_json, level)
    SELECT id, ws_id, owner_id, pod_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at, depends_on_json, 'team' FROM v2_goals;
  DROP TABLE v2_goals;
  ALTER TABLE v2_goals_new RENAME TO v2_goals;
  CREATE INDEX v2_goals_ws ON v2_goals(ws_id);

  CREATE TABLE v2_alignments_new (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    requester_id TEXT NOT NULL,
    target_goal_id TEXT NOT NULL,
    source_goal_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','revoked')),
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT,
    revoked_at TEXT,
    revoked_by TEXT,
    UNIQUE (ws_id, id),
    FOREIGN KEY (ws_id, target_goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, source_goal_id) REFERENCES v2_goals(ws_id, id)
  );
  INSERT INTO v2_alignments_new SELECT id, ws_id, requester_id, target_goal_id, source_goal_id, state, revision, created_at, updated_at, decided_at, revoked_at, revoked_by FROM v2_alignments;
  DROP TABLE v2_alignments;
  ALTER TABLE v2_alignments_new RENAME TO v2_alignments;

  CREATE TABLE v2_sessions_new (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL REFERENCES v2_devices(id),
    harness TEXT NOT NULL CHECK (harness IN ('claude-code','codex')),
    repo_key TEXT NOT NULL,
    repo_alias TEXT,
    title TEXT,
    started_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('shared','suspended','stopped')),
    stopped_at TEXT,
    governing_goal_id TEXT,
    governing_alignment_id TEXT,
    agent_stopped INTEGER NOT NULL DEFAULT 0,
    conflicts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, session_key),
    FOREIGN KEY (ws_id, governing_goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, governing_alignment_id) REFERENCES v2_alignments(ws_id, id)
  );
  INSERT INTO v2_sessions_new SELECT ws_id, session_key, user_id, device_id, harness, repo_key, repo_alias, title, started_at, state, stopped_at, governing_goal_id, governing_alignment_id, agent_stopped, conflicts, created_at, updated_at FROM v2_sessions;
  DROP TABLE v2_sessions;
  ALTER TABLE v2_sessions_new RENAME TO v2_sessions;
  CREATE INDEX v2_sessions_device ON v2_sessions(device_id);

  ALTER TABLE v2_invites ADD COLUMN team_id TEXT;
  ALTER TABLE v2_invites ADD COLUMN team_role TEXT CHECK (team_role IN ('lead','member'));
  CREATE INDEX v2_audit_ws ON v2_audit(ws_id, seq);
  `,
  // 4: connected AI apps (lib/oauth/grants.ts). A grant belongs to one person in one workspace: removing the
  // membership (leaving, being removed) or deleting the workspace deletes it in the same statement.
  `
  CREATE TABLE v2_oauth_grants (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    redirect_host TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    refresh_hash TEXT NOT NULL,
    prev_refresh_hash TEXT,
    refresh_exp INTEGER NOT NULL,
    kid TEXT NOT NULL,
    FOREIGN KEY (ws_id, user_id) REFERENCES v2_members(ws_id, user_id) ON DELETE CASCADE
  );
  CREATE INDEX v2_oauth_grants_member ON v2_oauth_grants(ws_id, user_id, created_at);
  `,
  // 5: change requests: a proposed new version of a goal the requester does not own (lib/v2/changes.ts). One open
  // (pending or countered) request per goal and requester. Each revision keeps the changes and the base version it
  // was made against; the decision (approved_by or rejected_by, its note, the resulting goal version) is on the row.
  `
  CREATE TABLE v2_change_requests (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','superseded')),
    revision INTEGER NOT NULL,
    base_version INTEGER NOT NULL,
    changes_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    approved_by TEXT,
    rejected_by TEXT,
    decision_note TEXT,
    version INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT,
    UNIQUE (ws_id, id),
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE
  );
  CREATE INDEX v2_change_requests_goal ON v2_change_requests(ws_id, goal_id);
  CREATE UNIQUE INDEX v2_change_requests_open ON v2_change_requests(goal_id, requester_id) WHERE state IN ('pending','countered');
  CREATE TABLE v2_change_request_revisions (
    ws_id TEXT NOT NULL,
    change_request_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    base_version INTEGER NOT NULL,
    changes_json TEXT NOT NULL,
    note TEXT,
    author_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (change_request_id, revision),
    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE
  );
  `,
  // PRESEED-004: account deletion and the retention schedule (lib/v2/retention-core.mts, lib/v2/account.ts).
  // - A deleted workspace is marked (deleted_at) and kept 30 days for restore, then purged.
  // - A session no longer needs its device: deleting a device (account deletion) or pseudonymising a former member
  //   clears device_id, so the row no longer leads back to the person (v2_sessions is rebuilt: device_id nullable,
  //   ON DELETE SET NULL).
  // - Spend roll-ups: per workspace, goal ('' = no goal), UTC day, model and basis; no person, no session.
  // - Former members: who left or was removed when, and the "Former member #n" number once pseudonymised. user_id is
  //   cleared at pseudonymisation, so nothing maps the number back to the person.
  `
  ALTER TABLE v2_workspaces ADD COLUMN deleted_at TEXT;

  CREATE TABLE v2_sessions_new (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT REFERENCES v2_devices(id) ON DELETE SET NULL,
    harness TEXT NOT NULL CHECK (harness IN ('claude-code','codex')),
    repo_key TEXT NOT NULL,
    repo_alias TEXT,
    title TEXT,
    started_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('shared','suspended','stopped')),
    stopped_at TEXT,
    governing_goal_id TEXT,
    governing_alignment_id TEXT,
    agent_stopped INTEGER NOT NULL DEFAULT 0,
    conflicts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (ws_id, session_key),
    FOREIGN KEY (ws_id, governing_goal_id) REFERENCES v2_goals(ws_id, id),
    FOREIGN KEY (ws_id, governing_alignment_id) REFERENCES v2_alignments(ws_id, id)
  );
  INSERT INTO v2_sessions_new SELECT ws_id, session_key, user_id, device_id, harness, repo_key, repo_alias, title, started_at, state, stopped_at, governing_goal_id, governing_alignment_id, agent_stopped, conflicts, created_at, updated_at FROM v2_sessions;
  DROP TABLE v2_sessions;
  ALTER TABLE v2_sessions_new RENAME TO v2_sessions;
  CREATE INDEX v2_sessions_device ON v2_sessions(device_id);
  CREATE INDEX v2_sessions_user ON v2_sessions(ws_id, user_id);

  CREATE TABLE v2_spend_rollups (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL,
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    basis TEXT NOT NULL,
    requests INTEGER NOT NULL,
    input INTEGER NOT NULL,
    output INTEGER NOT NULL,
    cache_read INTEGER NOT NULL,
    cache_write_5m INTEGER NOT NULL,
    cache_write_1h INTEGER NOT NULL,
    cache_write_unsplit INTEGER NOT NULL,
    est_list_usd_micros INTEGER NOT NULL,
    unpriced_requests INTEGER NOT NULL,
    PRIMARY KEY (ws_id, goal_id, day, model, basis)
  );

  CREATE TABLE v2_former_members (
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    user_id TEXT,
    n INTEGER,
    removed_at TEXT NOT NULL,
    pseudonymised_at TEXT
  );
  CREATE UNIQUE INDEX v2_former_members_pending ON v2_former_members(ws_id, user_id) WHERE user_id IS NOT NULL;
  CREATE UNIQUE INDEX v2_former_members_n ON v2_former_members(ws_id, n) WHERE n IS NOT NULL;
  `,
  // PRESEED-005: when each passkey last signed someone in (Better Auth's ba_passkey has no such column), and the
  // people who dismissed the "add a passkey" prompt.
  `
  CREATE TABLE v2_passkey_use (
    passkey_id TEXT PRIMARY KEY REFERENCES ba_passkey(id) ON DELETE CASCADE,
    last_used_at TEXT NOT NULL
  );
  CREATE TABLE v2_passkey_prompt_dismissed (
    user_id TEXT PRIMARY KEY REFERENCES ba_user(id) ON DELETE CASCADE,
    dismissed_at TEXT NOT NULL
  );
  `,
  // PRESEED-002/003: hosted creation codes (only an HMAC of each code is stored; ws_id is the workspace a code created
  // and is not a foreign key: deleting that workspace keeps the record that the code was used, and purging it clears
  // ws_id), access requests, and durable rate-limit hits (lib/v2/limits.ts).
  `
  CREATE TABLE v2_creation_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    email TEXT,
    request_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    redeemed_at TEXT,
    redeemed_by TEXT,
    ws_id TEXT
  );
  CREATE INDEX v2_creation_codes_email ON v2_creation_codes(email);
  CREATE TABLE v2_access_requests (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    team_size TEXT,
    use_case TEXT NOT NULL,
    interest TEXT NOT NULL CHECK (interest IN ('try','evaluate')),
    status TEXT NOT NULL CHECK (status IN ('pending','approved','declined')),
    created_at TEXT NOT NULL,
    decided_at TEXT,
    code_id TEXT
  );
  CREATE INDEX v2_access_requests_status ON v2_access_requests(status, created_at);
  CREATE INDEX v2_access_requests_email ON v2_access_requests(email);
  CREATE TABLE v2_rate_hits (
    key TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX v2_rate_hits_key ON v2_rate_hits(key, at);
  CREATE INDEX v2_rate_hits_at ON v2_rate_hits(at);
  `,
  // PRESEED-006: evidence on change requests (lib/v2/evidence.ts). Each revision keeps the snapshot Align recorded when
  // it was written (snapshot_json: the goal's 30-day spend, bound sessions and last activity; never from a client).
  // Evidence links belong to one revision and are frozen once it is superseded or the request decided; `source` says
  // whether a person (web session) or an agent (MCP or a device token) added it. An approval records whether its
  // revision had any evidence. An OAuth grant records its scopes: goals:read, plus the opt-in changes:evidence that lets
  // a connected app add evidence links (lib/oauth/server.ts).
  `
  ALTER TABLE v2_change_request_revisions ADD COLUMN snapshot_json TEXT;
  ALTER TABLE v2_oauth_grants ADD COLUMN scope TEXT NOT NULL DEFAULT 'goals:read';
  ALTER TABLE v2_change_requests ADD COLUMN approved_without_evidence INTEGER;
  CREATE TABLE v2_change_request_evidence (
    id TEXT PRIMARY KEY,
    ws_id TEXT NOT NULL,
    change_request_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pr','ci_run','incident','dashboard','doc','other')),
    url TEXT NOT NULL,
    label TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('person','agent')),
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE,
    FOREIGN KEY (change_request_id, revision) REFERENCES v2_change_request_revisions(change_request_id, revision) ON DELETE CASCADE
  );
  CREATE INDEX v2_change_request_evidence_rev ON v2_change_request_evidence(change_request_id, revision);
  `,
  // PRESEED-007: content-free product events (lib/v2/core.mts recordEvent, lib/v2/events.ts; the operator's report is
  // lib/v2/metrics-core.mts). Append-only: name, at and props never change; actor is cleared by account deletion and
  // ws_id replaced by purging a workspace. The first-time events are once per workspace (and the per-person session
  // event once per person in a workspace) by unique partial indexes; recordEvent inserts with ON CONFLICT DO NOTHING.
  `
  CREATE TABLE v2_events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ws_id TEXT,
    actor TEXT,
    at TEXT NOT NULL,
    props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props) AND json_type(props) = 'object')
  );
  CREATE INDEX v2_events_name_at ON v2_events(name, at);
  CREATE INDEX v2_events_ws ON v2_events(ws_id, name);
  CREATE INDEX v2_events_actor ON v2_events(actor) WHERE actor IS NOT NULL;
  CREATE UNIQUE INDEX v2_events_once_ws ON v2_events(name, ws_id) WHERE ws_id IS NOT NULL AND name IN (
    'workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined',
    'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed');
  CREATE UNIQUE INDEX v2_events_once_person ON v2_events(name, ws_id, actor)
    WHERE name = 'member_first_session_captured' AND ws_id IS NOT NULL AND actor IS NOT NULL;
  CREATE TRIGGER v2_events_append_only BEFORE UPDATE OF id, name, at, props ON v2_events
    BEGIN SELECT RAISE(ABORT, 'v2_events is append-only'); END;
  `,
  // PORT-001: the v1 features ported onto v2 (limits lib/v2/goal-limits.ts, asks lib/v2/asks.ts, value reports
  // lib/v2/value.ts) and the new product events. It only adds; the SQL comments say what each part holds.
  `
  -- 11 (PORT-001): limits on goal versions, asks, value reports and once-per-person value events.
  -- Limits are goal content (limits_json, a JSON list), so they are versioned, hashed, approved and delivered like
  -- measures. Asks belong to the team asked; their history ("came up again") is v2_ask_mentions.
  ALTER TABLE v2_goals ADD COLUMN limits_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE v2_goal_versions ADD COLUMN limits_json TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE v2_asks (
    id TEXT PRIMARY KEY,                       -- ask_<24 base32>
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL,                     -- the team asked (a pod)
    goal_id TEXT,                              -- optional: the asked team's goal it concerns
    text TEXT NOT NULL,                        -- 1..400
    from_label TEXT,                           -- who asked, as people say it ("Faculty"), 1..80
    created_by TEXT NOT NULL,                  -- the person who recorded it
    source_kind TEXT NOT NULL CHECK (source_kind IN ('meeting','manual')),
    source_title TEXT,                         -- 1..120, required for meeting
    source_date TEXT NOT NULL,                 -- YYYY-MM-DD
    state TEXT NOT NULL CHECK (state IN ('open','accepted','done','declined','withdrawn')),
    decided_by TEXT,                           -- last person who changed state
    decided_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (ws_id, id),
    FOREIGN KEY (ws_id, team_id) REFERENCES v2_pods(ws_id, id) ON DELETE CASCADE,
    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id)
  );
  CREATE INDEX v2_asks_team ON v2_asks(ws_id, team_id, state);
  CREATE INDEX v2_asks_ws ON v2_asks(ws_id, updated_at);
  CREATE TABLE v2_ask_mentions (
    ws_id TEXT NOT NULL,
    ask_id TEXT NOT NULL,
    n INTEGER NOT NULL,                        -- 1..10
    date TEXT NOT NULL,
    text TEXT NOT NULL,                        -- 1..300
    source_title TEXT NOT NULL,                -- 1..120
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (ask_id, n),
    FOREIGN KEY (ws_id, ask_id) REFERENCES v2_asks(ws_id, id) ON DELETE CASCADE
  );

  -- A person's estimate of how long an approved change request's decision would have taken without Align, with an
  -- optional note: one per person per request, editable by its author for 7 days, deleted with the request.
  CREATE TABLE v2_value_reports (
    id TEXT PRIMARY KEY,                       -- vr_<24 base32>
    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,
    change_request_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    estimate TEXT NOT NULL CHECK (estimate IN ('same_day','two_to_three_days','about_a_week','longer','would_not_be_decided')),
    note TEXT CHECK (note IS NULL OR length(note) <= 500),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (ws_id, change_request_id, person_id),
    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE
  );

  DROP INDEX v2_events_once_ws;
  CREATE UNIQUE INDEX v2_events_once_ws ON v2_events(name, ws_id) WHERE ws_id IS NOT NULL AND name IN (
    'workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined',
    'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed',
    'first_ask', 'first_limit');
  DROP INDEX v2_events_once_person;
  CREATE UNIQUE INDEX v2_events_once_person ON v2_events(name, ws_id, actor)
    WHERE ws_id IS NOT NULL AND actor IS NOT NULL AND name IN (
    'member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked');
  `,
];

// The operator script (scripts/align-admin.mjs) accepts only a database at SCHEMA_VERSION (lib/v2/core.mts).
if (MIGRATIONS.length !== SCHEMA_VERSION) throw new Error(`lib/v2/core.mts SCHEMA_VERSION is ${SCHEMA_VERSION}, but there are ${MIGRATIONS.length} migrations`);

export function migrate() {
  const d = openDb().domain;
  const current = Number((d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (current >= MIGRATIONS.length) return lockDown(openDb().file);
  // Rebuilding a table (drop, then rename the copy) needs foreign keys off; it can't change inside a transaction.
  d.exec("PRAGMA foreign_keys = OFF");
  try {
    for (let v = current; v < MIGRATIONS.length; v++) {
      d.exec("BEGIN IMMEDIATE");
      try {
        d.exec(MIGRATIONS[v]);
        const broken = d.prepare("PRAGMA foreign_key_check").all();
        if (broken.length) throw new Error(`migration ${v + 1} left ${broken.length} broken references`);
        d.exec(`PRAGMA user_version = ${v + 1}`);
        d.exec("COMMIT");
      } catch (e) {
        d.exec("ROLLBACK");
        throw e;
      }
    }
  } finally {
    d.exec("PRAGMA foreign_keys = ON");
  }
  lockDown(openDb().file);
}

/** SQL: the workspace that `ws` (a column or a placeholder) names is not deleted. A deleted workspace, waiting out its
 *  restore window, is unreachable to everyone, exactly like one that does not exist. */
export const LIVE_WS = (ws: string) => `${ws} IN (SELECT id FROM v2_workspaces WHERE deleted_at IS NULL)`;

export function audit(ws: string | null, actor: string | null, action: string, objectId: string | null, at: string) {
  run("INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, ?, ?, ?)", ws, actor, action, objectId, at);
}
