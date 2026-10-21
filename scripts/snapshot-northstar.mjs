#!/usr/bin/env node
// Northstar API and MCP snapshot gate. Replays scripts/test-flow.mjs and records /api/state per step
// (product, security, leadership, anonymous), plus the MCP listings and results, all normalized.
//
// The server must start from a fresh state (stop it, rm data/state.json, start it) with ALIGN_MCP_TOKEN
// set to the same value this script gets.
//
//   Capture: ALIGN_MCP_TOKEN=<t> node scripts/snapshot-northstar.mjs http://127.0.0.1:3200 --out test/snapshots/northstar-850971e
//   Check:   ALIGN_MCP_TOKEN=<t> node scripts/snapshot-northstar.mjs http://127.0.0.1:320N   (diffs against the committed baseline)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "test/snapshots/northstar-850971e");

const args = process.argv.slice(2);
const base = baseUrl(args.find((a) => !a.startsWith("--")));
const outArg = args.indexOf("--out") >= 0 ? args[args.indexOf("--out") + 1] : null;
const outDir = outArg ? path.resolve(outArg) : mkdtempSync(path.join(tmpdir(), "align-snapshot-"));

if (!process.env.ALIGN_MCP_TOKEN) {
  console.error("ALIGN_MCP_TOKEN is not set. Start the server and this script with the same token.");
  process.exit(2);
}

// A server that has already run anything has audit rows, and the snapshot would not compare.
const cookie = await signIn(base, "leadership");
const fresh = await (await fetch(base + "/api/state", { headers: { cookie } })).json();
if ((fresh.audit ?? []).length !== 0 || (fresh.sessions ?? []).length !== 0) {
  console.error("Server state is not fresh. Stop the server, rm data/state.json, start it again.");
  process.exit(2);
}

rmSync(path.join(outDir, "steps"), { recursive: true, force: true });
mkdirSync(path.join(outDir, "steps"), { recursive: true });
const run = spawnSync(process.execPath, ["--import", path.join(ROOT, "scripts/lib/harness.mjs"), path.join(ROOT, "scripts/test-flow.mjs"), base], {
  env: { ...process.env, SNAPSHOT_HOOK_OUT: path.join(outDir, "steps") },
  encoding: "utf8",
});
if (run.error) throw run.error;
// stdout minus the banner line, which names the port.
const stdout = run.stdout.split("\n").filter((l) => !l.startsWith("Align acceptance test against ")).join("\n");
writeFileSync(path.join(outDir, "test-flow.out"), stdout);
if (run.stderr.trim()) console.error(run.stderr);

const steps = readdirSync(path.join(outDir, "steps")).sort();
console.log(`captured ${steps.length} steps, test-flow exit ${run.status}, into ${outDir}`);
if (outArg) process.exit(0);

// Check mode: compare against the committed baseline, file by file, in order.
if (!existsSync(BASELINE)) {
  console.error(`No baseline at ${path.relative(ROOT, BASELINE)}`);
  process.exit(2);
}
const want = readdirSync(path.join(BASELINE, "steps")).sort();
const diffs = [];
if (JSON.stringify(want) !== JSON.stringify(steps)) diffs.push(`step list differs:\n  baseline ${want.join(" ")}\n  this run ${steps.join(" ")}`);
for (const name of want.filter((n) => steps.includes(n))) {
  if (readFileSync(path.join(BASELINE, "steps", name), "utf8") !== readFileSync(path.join(outDir, "steps", name), "utf8")) diffs.push(`steps/${name}`);
}
if (readFileSync(path.join(BASELINE, "test-flow.out"), "utf8") !== stdout) diffs.push("test-flow.out");
if (diffs.length) {
  console.log(`FAIL  Northstar snapshot differs from ${path.relative(ROOT, BASELINE)}:`);
  for (const d of diffs) console.log(`  ${d}`);
  console.log(`  run: diff -r ${path.relative(ROOT, BASELINE)} ${outDir}`);
  process.exit(1);
}
console.log("PASS  Northstar snapshot identical to the 850971e baseline");
rmSync(outDir, { recursive: true, force: true });
