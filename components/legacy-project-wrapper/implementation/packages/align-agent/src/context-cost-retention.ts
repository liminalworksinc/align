// Sync-only cleanup. Keep directory enumeration and retention out of the hook import graph.
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";

export const CONTEXT_RETENTION_MS = 30 * 86_400_000;
export const CONTEXT_PRUNE_LIMIT = 100;
export const CONTEXT_EXAMINE_LIMIT = 500;
const WORK_MS = 10;

/** Names are listed once outside the budget; only bounded lstat/unlink work follows the saved name. */
export function pruneContextCost(home: string, now: () => number = Date.now, elapsed: () => number = () => performance.now()): number {
  const cutoff = now() - CONTEXT_RETENTION_MS;
  const directory = layout.contextCostDir(home), checkpoint = path.join(directory, ".retention.json");
  let removed = 0;
  try {
    const names = fs.readdirSync(directory).filter((name) => /^[A-Za-z0-9_-]+\.jsonl$/.test(name)).sort();
    const saved = readJson<{ after?: unknown }>(checkpoint);
    let after = typeof saved?.after === "string" ? saved.after : null;
    // Upper bound also resumes correctly when the last examined file was deleted.
    let index = 0, end = names.length;
    while (index < end) {
      const middle = Math.floor((index + end) / 2);
      if (after !== null && names[middle] <= after) index = middle + 1;
      else end = middle;
    }
    if (index === names.length) index = 0;
    const until = elapsed() + WORK_MS;
    let examined = 0;
    while (index < names.length && examined < CONTEXT_EXAMINE_LIMIT && removed < CONTEXT_PRUNE_LIMIT && elapsed() < until) {
      after = names[index++]; examined++;
      try {
        // Always lstat: a names-only listing needs no reliable directory-entry type information.
        const file = path.join(directory, after), stat = fs.lstatSync(file);
        if (stat.isFile() && stat.mtimeMs <= cutoff) { fs.unlinkSync(file); removed++; }
      } catch { /* A concurrent append, removal or inaccessible file cannot fail sync. */ }
    }
    writeJsonAtomic(checkpoint, { after: index === names.length ? null : after });
  } catch { /* Absent or inaccessible counter storage cannot fail sync. */ }
  return removed;
}
