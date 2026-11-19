import type { Sql } from "./core.mts";

/** Both the scheduled pass and excerpt routes call this inside a transaction. */
export function deleteExpiredExcerpts(db: Sql, at: string, ws?: string) {
  const where = ws === undefined ? "expires_at <= ?" : "expires_at <= ? AND ws_id = ?";
  const args = ws === undefined ? [at] : [at, ws];
  db.run(`INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at)
    SELECT ws_id, NULL, 'session_excerpt.expired', id, ? FROM v2_session_excerpts WHERE ${where}`, at, ...args);
  return db.run(`DELETE FROM v2_session_excerpts WHERE ${where}`, ...args);
}

/** After commit, erase WAL frames that predate secure deletion. Leave a durable retry marker if SQLite is busy. */
export function flushExcerptStorage(db: Sql) {
  const pending = db.get<{ generation: Uint8Array }>("SELECT generation FROM v2_excerpt_storage_cleanup WHERE id = 1");
  if (!pending) return true;
  const checkpoint = db.get<{ busy: number }>("PRAGMA wal_checkpoint(TRUNCATE)");
  if (checkpoint?.busy !== 0) return false;
  // Another connection may have deleted an excerpt after the checkpoint.
  return db.run("DELETE FROM v2_excerpt_storage_cleanup WHERE id = 1 AND generation = ?", pending.generation) === 1;
}
