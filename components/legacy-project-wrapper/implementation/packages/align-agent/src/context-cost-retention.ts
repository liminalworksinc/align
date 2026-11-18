// Sync-only cleanup. Keep directory enumeration and retention out of the hook import graph.
import fs from "node:fs";
import path from "node:path";
import { layout } from "./shared/layout.ts";

export const CONTEXT_RETENTION_MS = 30 * 86_400_000;
export const CONTEXT_PRUNE_LIMIT = 100;
const WORK_MS = 10;

/** Stream entries instead of allocating a directory listing. The next pass handles any remaining expired files. */
export function pruneContextCost(home: string, now: () => number = Date.now, elapsed: () => number = () => performance.now()): number {
  const cutoff = now() - CONTEXT_RETENTION_MS, until = elapsed() + WORK_MS;
  let dir: fs.Dir | undefined, removed = 0;
  try {
    dir = fs.opendirSync(layout.contextCostDir(home), { bufferSize: 1 });
    while (removed < CONTEXT_PRUNE_LIMIT && elapsed() < until) {
      const entry = dir.readSync();
      if (!entry) break;
      if (!entry.isFile() || !/^[A-Za-z0-9_-]+\.jsonl$/.test(entry.name)) continue;
      const file = path.join(dir.path, entry.name);
      try {
        // File mtime changes on every append, including an addition from a session unknown to the ledger.
        if (fs.lstatSync(file).mtimeMs <= cutoff) { fs.unlinkSync(file); removed++; }
      } catch { /* A concurrent append, removal or inaccessible file cannot fail sync. */ }
    }
  } catch { /* Absent or inaccessible counter storage cannot fail sync. */ }
  finally { try { dir?.closeSync(); } catch { /* Already closed. */ } }
  return removed;
}
