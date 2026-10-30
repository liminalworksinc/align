#!/usr/bin/env node
// node scripts/retention.mjs [--dry-run]: run the retention job (docs/RETENTION.md) on this machine's database now and
// print what it did, or with --dry-run what it would do (nothing is changed). The server already runs the same job at
// every start and every 24 hours; this is for an operator who wants to see or force it.
// Reads ALIGN_DATA_DIR (default ./data, as the server) and opens <data>/v2/align.sqlite. Safe while the server runs:
// each step is one short transaction. The database must have been migrated by a server of this version.
// It loads lib/v2/retention.ts directly (Node strips its types), so it needs the app's source tree beside it, and
// node:sqlite (Node 22.13+). ALIGN_TEST_NOW (an ISO time) is honoured only with ALIGN_TEST_IDP=1, for tests.

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--dry-run");
if (unknown.length) {
  console.error("usage: node scripts/retention.mjs [--dry-run]");
  process.exit(2);
}
const dryRun = args.includes("--dry-run");
if (process.env.HOSTED === "1" && process.env.ALIGN_TEST_NOW) {
  console.error("retention: ALIGN_TEST_NOW is not allowed when hosted");
  process.exit(2);
}

// The app's modules import each other without a file extension (Next's bundler resolves them): add ".ts" here, and
// load them as ES modules (the package has no "type").
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
  load(url, ctx, next) {
    return next(url, url.endsWith(".ts") ? { ...ctx, format: "module-typescript" } : ctx);
  },
});
process.removeAllListeners("warning"); // node:sqlite's experimental notice

const lib = (f) => pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "../lib/v2", f)).href;
const { dbFile, schemaCurrent } = await import(lib("db.ts"));
const { describeCounts, retentionNow, runRetention } = await import(lib("retention.ts"));

const file = dbFile();
if (!existsSync(file)) {
  console.error(`retention: no database at ${file} (set ALIGN_DATA_DIR to the server's data directory)`);
  process.exit(2);
}
if (!schemaCurrent()) {
  console.error("retention: this database has not been migrated by this version of Align. Start the server once, then try again.");
  process.exit(2);
}
const now = retentionNow();
const counts = await runRetention(now, { dryRun });
console.log(`${dryRun ? "Would" : "Did"} (as of ${now.toISOString()}): ${describeCounts(counts)}`);
console.log(JSON.stringify({ now: now.toISOString(), dry_run: dryRun, ...counts }));
