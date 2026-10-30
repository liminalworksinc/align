import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { layout } from "./shared/layout.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  local_id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  native_id TEXT NOT NULL,
  cwd TEXT,
  started_at TEXT,
  last_active TEXT,
  api_key_env INTEGER NOT NULL DEFAULT 0,
  cloud_env INTEGER NOT NULL DEFAULT 0,
  hooked INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  last_source TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS root_turns (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id TEXT NOT NULL,
  root_turn TEXT NOT NULL,
  ts TEXT NOT NULL,
  UNIQUE(local_id, root_turn)
);
CREATE TABLE IF NOT EXISTS epochs (
  epoch_id TEXT PRIMARY KEY,
  local_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  goal_id TEXT,
  starts_at TEXT NOT NULL,
  root_turn TEXT,
  cause TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0,
  goal_version_at_start INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS epochs_by_session ON epochs(local_id, starts_at);
CREATE TABLE IF NOT EXISTS requests (
  request_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  local_id TEXT NOT NULL,
  harness TEXT NOT NULL,
  ts TEXT,
  model TEXT NOT NULL,
  query_source TEXT NOT NULL,
  input INTEGER NOT NULL DEFAULT 0,
  output INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write_5m INTEGER NOT NULL DEFAULT 0,
  cache_write_1h INTEGER NOT NULL DEFAULT 0,
  cache_write_unsplit INTEGER NOT NULL DEFAULT 0,
  counts_valid INTEGER NOT NULL DEFAULT 1,
  basis TEXT NOT NULL,
  est_list_usd_micros INTEGER,
  unpriced TEXT,
  price_table_version TEXT NOT NULL,
  source TEXT NOT NULL,
  root_turn TEXT,
  epoch_id TEXT,
  finalized INTEGER NOT NULL DEFAULT 1,
  harness_cost_usd_micros INTEGER,
  uploaded INTEGER NOT NULL DEFAULT 0,
  conflict INTEGER NOT NULL DEFAULT 0,
  retract_group TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_by_session ON requests(local_id, uploaded);
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  dev INTEGER NOT NULL,
  ino INTEGER NOT NULL,
  size INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  prefix_len INTEGER NOT NULL,
  prefix_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  rewrites INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS directives (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  json TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS directive_sessions (
  directive_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  state TEXT NOT NULL,
  PRIMARY KEY(directive_id, local_id)
);
CREATE TABLE IF NOT EXISTS shares (
  local_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  session_key TEXT NOT NULL,
  goal_id TEXT,
  state TEXT NOT NULL,
  alias TEXT,
  from_mode TEXT NOT NULL,
  suspended_at TEXT,
  stopped_at TEXT,
  created_at TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  conflicts INTEGER NOT NULL DEFAULT 0,
  goal_json TEXT,
  binding_epoch TEXT,
  binding_goal TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS pending_bindings (
  local_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  goal_id TEXT,
  goal_json TEXT,
  cause TEXT NOT NULL,
  directive_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  local_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS latches (
  local_id TEXT PRIMARY KEY,
  stopped INTEGER NOT NULL,
  directive_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  at TEXT NOT NULL
);
-- REQ-002: requests sent to a session (one row per request and session) and goal holds on a session.
CREATE TABLE IF NOT EXISTS goal_requests (
  request_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  directive_id TEXT NOT NULL,
  type TEXT NOT NULL,
  json TEXT NOT NULL,
  state TEXT NOT NULL,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(request_id, local_id)
);
CREATE TABLE IF NOT EXISTS holds (
  local_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  held INTEGER NOT NULL,
  json TEXT NOT NULL,
  directive_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY(local_id, goal_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS shares_by_key ON shares(session_key);
CREATE TABLE IF NOT EXISTS repo_aliases (
  workspace_id TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  alias TEXT NOT NULL,
  PRIMARY KEY(workspace_id, repo_root)
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gaps (reason TEXT PRIMARY KEY, n INTEGER NOT NULL);
`;

export type Db = DatabaseSync;

export function openDb(alignHome: string): Db {
  const file = layout.db(alignHome);
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=OFF;");
  db.exec(SCHEMA);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
  return db;
}

export function kvGet(db: Db, key: string): string | null {
  const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key) as { value: string } | undefined;
  return r ? r.value : null;
}

export function kvSet(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export function bumpGap(db: Db, reason: string, n = 1): void {
  db.prepare("INSERT INTO gaps(reason,n) VALUES(?,?) ON CONFLICT(reason) DO UPDATE SET n=n+excluded.n").run(reason, n);
}

export const nowIso = (): string => new Date().toISOString();
