#!/usr/bin/env node
// node scripts/retention.mjs [--dry-run]: the same as `node scripts/align-admin.mjs retention run [--dry-run]` (run
// the retention job, docs/RETENTION.md, on this machine's database now and print what it did, or with --dry-run what
// it would do). Kept as a short name for the operator; everything, its checks included, is in scripts/align-admin.mjs.

const args = process.argv.slice(2);
if (args.some((a) => a !== "--dry-run")) {
  console.error("usage: node scripts/retention.mjs [--dry-run]   (the same as: node scripts/align-admin.mjs retention run [--dry-run])");
  process.exit(2);
}
process.argv.splice(2, args.length, "retention", "run", ...args);
await import("./align-admin.mjs");
