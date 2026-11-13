'use strict';

function create_store(context) {
  const {
    dataDir, shared, DatabaseSync, join, existsSync, mkdirSync, chmodSync,
    random, setTimeout, schemaVersion, changePrograms, applyMigrations, count,
  } = context;
  const programs = changePrograms();
  if (programs.length !== schemaVersion) {
    throw new Error(`lib/v2/core.mts SCHEMA_VERSION is ${schemaVersion}, but there are ${programs.length} migrations`);
  }
  let depth = 0;

  function dbDir() { return join(dataDir(), 'v2'); }
  function dbFile() { return join(dbDir(), 'align.sqlite'); }

  function protect(file) {
    for (const path of [file, `${file}-wal`, `${file}-shm`]) {
      try {
        if (existsSync(path)) chmodSync(path, 0o600);
      } catch (_) {
        // File protection is best effort for each individual path.
      }
    }
  }

  function openDb() {
    if (shared.__alignV2Db) return shared.__alignV2Db;
    const directory = dbDir();
    const file = join(directory, 'align.sqlite');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const auth = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
    auth.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    protect(file);
    const domain = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 0 });
    domain.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 0; PRAGMA synchronous = NORMAL;');
    protect(file);
    const bundle = { file, domain, auth, stmts: new Map() };
    shared.__alignV2Db = bundle;
    return bundle;
  }

  function authDb() { return openDb().auth; }
  function statement(query) {
    const bundle = openDb();
    if (bundle.stmts.has(query)) return bundle.stmts.get(query);
    const prepared = bundle.domain.prepare(query);
    bundle.stmts.set(query, prepared);
    return prepared;
  }
  function all(query, ...values) { return statement(query).all(...values); }
  function get(query, ...values) { return statement(query).get(...values); }
  function run(query, ...values) { return Number(statement(query).run(...values).changes); }
  function exec(query) { openDb().domain.exec(query); }
  const sql = { run, get, all };

  function busy(error) {
    if (error != null && error.errcode === 5) return true;
    return /SQLITE_BUSY|database is locked/i.test(String(error?.message ?? error));
  }

  async function tx(callback) {
    if (depth > 0) return callback();
    const connection = openDb().domain;
    for (let retry = 0; ; retry += 1) {
      try {
        connection.exec('BEGIN IMMEDIATE');
        break;
      } catch (error) {
        if (retry >= 100 || !busy(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 + random() * 25));
      }
    }
    depth += 1;
    try {
      const result = callback();
      if (result instanceof Promise) throw new Error('tx() callbacks must be synchronous');
      connection.exec('COMMIT');
      return result;
    } catch (error) {
      try { connection.exec('ROLLBACK'); } catch (_) { /* Preserve the original failure. */ }
      throw error;
    } finally {
      depth -= 1;
    }
  }

  function migrate() {
    const bundle = openDb();
    const connection = bundle.domain;
    applyMigrations({
      changeCount: programs.length,
      readVersion() { return Number(connection.prepare('PRAGMA user_version').get().user_version); },
      setReferences(enabled) { connection.exec(`PRAGMA foreign_keys = ${enabled ? 'ON' : 'OFF'}`); },
      begin() { connection.exec('BEGIN IMMEDIATE'); },
      apply(version) { connection.exec(programs[version - 1]); },
      brokenReferences() { return connection.prepare('PRAGMA foreign_key_check').all().length; },
      referenceError(version, broken) { return new Error(`migration ${version} left ${count(broken, 'broken reference')}`); },
      writeVersion(version) { connection.exec(`PRAGMA user_version = ${version}`); },
      commit() { connection.exec('COMMIT'); },
      rollback() { connection.exec('ROLLBACK'); },
      complete() { protect(bundle.file); },
    });
  }

  function LIVE_WS(expression) {
    return `${expression} IN (SELECT id FROM v2_workspaces WHERE deleted_at IS NULL)`;
  }
  function audit(ws, actor, action, objectId, at) {
    run('INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, ?, ?, ?)',
      ws, actor, action, objectId, at);
  }
  return { dbDir, dbFile, openDb, authDb, all, get, run, exec, sql, tx, migrate, LIVE_WS, audit };
}

module.exports = { create_store };
