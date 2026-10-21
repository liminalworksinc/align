#!/usr/bin/env node
// Northstar API and MCP snapshot gate. Replays scripts/test-flow.mjs and records /api/state per step
// (product, security, leadership, anonymous), plus the MCP listings and results, all normalized.
//
// Format: steps/NN-*.json are compact JSON (no indentation, original key order). Every `simulations` array
// is replaced by {"$sha256": "<hex of the array's compact JSON>"}, and simulations.json holds each distinct
// array once, keyed by that hash. Check mode compares every step byte for byte (markers included), compares
// simulations.json byte for byte, and re-hashes every baseline simulations entry, so no field is checked
// less strictly than before.
//
// The server must start from a fresh state (stop it, rm data/state.json, start it) with ALIGN_MCP_TOKEN
// set to the same value this script gets.
//
//   Capture: ALIGN_MCP_TOKEN=<t> node scripts/snapshot-northstar.mjs http://127.0.0.1:3200 --out test/snapshots/northstar-850971e
//   Check:   ALIGN_MCP_TOKEN=<t> node scripts/snapshot-northstar.mjs http://127.0.0.1:320N [--baseline <dir>]
//            (diffs against the committed baseline next to this script, or <dir>)
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIMS = "simulations.json";

const args = process.argv.slice(2);
const flag = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const flagValues = new Set([flag("--out"), flag("--baseline")]);
const base = baseUrl(args.find((a) => !a.startsWith("--") && !flagValues.has(a)));
const outArg = flag("--out");
const outDir = outArg ? path.resolve(outArg) : mkdtempSync(path.join(tmpdir(), "align-snapshot-"));
const BASELINE = path.resolve(flag("--baseline") ?? path.join(ROOT, "test/snapshots/northstar-850971e"));

if (!process.env.ALIGN_MCP_TOKEN) {
  console.error("ALIGN_MCP_TOKEN is not set. Start the server and this script with the same token.");
  process.exit(2);
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Replaces every `simulations` array with a hash marker, collecting the compact JSON of each distinct array.
// Object.fromEntries keeps an own "__proto__" key as data, and keeps key order.
function hashOutSimulations(v, sims) {
  if (Array.isArray(v)) return v.map((x) => hashOutSimulations(x, sims));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        if (k === "simulations" && Array.isArray(x)) {
          const json = JSON.stringify(x);
          const hash = sha256(json);
          if (!sims.has(hash)) sims.set(hash, json);
          return [k, { $sha256: hash }];
        }
        return [k, hashOutSimulations(x, sims)];
      }),
    );
  }
  return v;
}

/** Every hash marker in a parsed step. */
function markers(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => markers(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "simulations" && x && typeof x === "object" && !Array.isArray(x)) out.push(x.$sha256);
      else markers(x, out);
    }
  }
  return out;
}

// A server that has already run anything has audit rows, and the snapshot would not compare.
const cookie = await signIn(base, "leadership");
const fresh = await (await fetch(base + "/api/state", { headers: { cookie } })).json();
if ((fresh.audit ?? []).length !== 0 || (fresh.sessions ?? []).length !== 0) {
  console.error("Server state is not fresh. Stop the server, rm data/state.json, start it again.");
  process.exit(2);
}

rmSync(path.join(outDir, "steps"), { recursive: true, force: true });
rmSync(path.join(outDir, SIMS), { force: true });
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

// The hook writes full compact steps; hash the simulations out of each, in step order.
const steps = readdirSync(path.join(outDir, "steps")).sort();
const sims = new Map();
for (const name of steps) {
  const file = path.join(outDir, "steps", name);
  writeFileSync(file, JSON.stringify(hashOutSimulations(JSON.parse(readFileSync(file, "utf8")), sims)) + "\n");
}
writeFileSync(path.join(outDir, SIMS), "{" + [...sims].map(([h, json]) => `${JSON.stringify(h)}:${json}`).join(",") + "}\n");
console.log(`captured ${steps.length} steps (${sims.size} distinct simulations), test-flow exit ${run.status}, into ${outDir}`);
if (outArg) process.exit(0);

// Check mode: compare against the baseline, file by file, in order.
const rel = (p) => (p.startsWith(ROOT + path.sep) ? path.relative(ROOT, p) : p);
if (!existsSync(path.join(BASELINE, "steps"))) {
  console.error(`No baseline at ${rel(BASELINE)}`);
  process.exit(2);
}
console.log(`baseline ${BASELINE}`);
const want = readdirSync(path.join(BASELINE, "steps")).sort();
const diffs = [];
const differing = [];
if (JSON.stringify(want) !== JSON.stringify(steps)) diffs.push(`step list differs:\n  baseline ${want.join(" ")}\n  this run ${steps.join(" ")}`);
for (const name of want.filter((n) => steps.includes(n))) {
  if (readFileSync(path.join(BASELINE, "steps", name), "utf8") !== readFileSync(path.join(outDir, "steps", name), "utf8")) {
    diffs.push(`steps/${name}`);
    differing.push(`steps/${name}`);
  }
}

// simulations.json: present, every entry hashes to its key, every baseline marker resolves, and identical to this run's.
const simsPath = path.join(BASELINE, SIMS);
if (!existsSync(simsPath)) diffs.push(`${SIMS} missing from the baseline`);
else {
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(simsPath, "utf8"));
  } catch (e) {
    diffs.push(`${SIMS} in the baseline is not valid JSON: ${e.message}`);
  }
  if (stored) {
    for (const [hash, arr] of Object.entries(stored)) {
      if (!Array.isArray(arr) || sha256(JSON.stringify(arr)) !== hash) diffs.push(`${SIMS}: entry ${hash.slice(0, 12)} does not hash to its key`);
    }
    for (const name of want) {
      for (const hash of markers(JSON.parse(readFileSync(path.join(BASELINE, "steps", name), "utf8")))) {
        if (!Object.hasOwn(stored, hash ?? "")) diffs.push(`steps/${name}: simulations hash ${String(hash).slice(0, 12)} missing from ${SIMS}`);
      }
    }
  }
  if (readFileSync(simsPath, "utf8") !== readFileSync(path.join(outDir, SIMS), "utf8")) {
    diffs.push(SIMS);
    differing.push(SIMS);
  }
}
if (readFileSync(path.join(BASELINE, "test-flow.out"), "utf8") !== stdout) diffs.push("test-flow.out");

if (diffs.length) {
  console.log(`FAIL  Northstar snapshot differs from ${rel(BASELINE)}:`);
  for (const d of diffs) console.log(`  ${d}`);
  console.log(`  run: diff -r ${rel(BASELINE)} ${outDir}`);
  for (const f of differing.slice(0, 3)) console.log(`  run: diff <(jq . ${rel(path.join(BASELINE, f))}) <(jq . ${path.join(outDir, f)})`);
  process.exit(1);
}
console.log("PASS  Northstar snapshot identical to the 850971e baseline");
rmSync(outDir, { recursive: true, force: true });
