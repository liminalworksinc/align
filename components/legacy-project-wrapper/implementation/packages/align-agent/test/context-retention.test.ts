import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CONTEXT_EXAMINE_LIMIT, CONTEXT_PRUNE_LIMIT, CONTEXT_RETENTION_MS, pruneContextCost } from "../src/context-cost-retention.ts";
import { countOutput, readContextCost } from "../src/shared/context-cost.ts";
import { layout } from "../src/shared/layout.ts";
import { syncOnce } from "../src/sync.ts";
import { ctxFor, makeEnv, PKG, runCli } from "./helpers.ts";

const AT = Date.parse("2026-11-18T12:00:00.000Z");
function added(home: string, lid: string, at: number) {
  countOutput(home, lid, { hookSpecificOutput: { additionalContext: "saved text" } }, "SessionStart");
  fs.utimesSync(layout.contextCost(home, lid), new Date(at), new Date(at));
}

test("injected clock expires a log at 30 days without an addition and preserves other session files", () => {
  const t = makeEnv();
  try {
    const lid = "retained_session", other = layout.injected(t.home, lid);
    fs.mkdirSync(path.dirname(other), { recursive: true }); fs.writeFileSync(other, "retained hook state\n");
    added(t.home, lid, AT);
    let clock = AT + CONTEXT_RETENTION_MS - 1;
    assert.equal(pruneContextCost(t.home, () => clock, () => 0), 0);
    assert.equal(readContextCost(t.home, lid).context_added.characters, 10);
    clock++;
    assert.equal(pruneContextCost(t.home, () => clock, () => 0), 1);
    assert.equal(fs.existsSync(layout.contextCost(t.home, lid)), false);
    assert.equal(fs.readFileSync(other, "utf8"), "retained hook state\n");
    countOutput(t.home, lid, { hookSpecificOutput: { additionalContext: "new" } }, "PreToolUse");
    assert.equal(readContextCost(t.home, lid).context_added.characters, 3);
    assert.equal(readContextCost(t.home, lid).context_added.additions, 1);
  } finally { t.cleanup(); }
});

test("cleanup sorts names, caps removals per pass and spares recently appended and unrelated files", () => {
  const t = makeEnv();
  try {
    for (let i = 0; i < CONTEXT_PRUNE_LIMIT + 3; i++) added(t.home, `expired_${i}`, AT - CONTEXT_RETENTION_MS);
    added(t.home, "recent", AT);
    const dir = layout.contextCostDir(t.home), unrelated = path.join(dir, "keep.txt"), link = path.join(dir, "link.jsonl");
    fs.writeFileSync(unrelated, "keep"); fs.utimesSync(unrelated, new Date(0), new Date(0)); fs.symlinkSync(unrelated, link);
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), CONTEXT_PRUNE_LIMIT);
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 3);
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 0);
    assert.ok(fs.existsSync(layout.contextCost(t.home, "recent")));
    assert.equal(fs.readFileSync(unrelated, "utf8"), "keep"); assert.ok(fs.lstatSync(link).isSymbolicLink());
  } finally { t.cleanup(); }
});

test("cleanup starts no more work after its scan budget and tolerates missing or unwritable storage", (tc) => {
  const t = makeEnv();
  try {
    assert.equal(pruneContextCost(t.home, () => AT), 0);
    added(t.home, "old", AT - CONTEXT_RETENTION_MS);
    let elapsed = 0, reads = 0;
    const lstat = fs.lstatSync;
    tc.mock.method(fs, "lstatSync", (...args: Parameters<typeof fs.lstatSync>) => { reads++; return lstat(...args); });
    assert.equal(pruneContextCost(t.home, () => AT, () => elapsed += 10), 0);
    assert.equal(reads, 0);
    const unlink = tc.mock.method(fs, "unlinkSync", () => { throw new Error("read-only counter directory"); });
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 0);
    assert.ok(fs.existsSync(layout.contextCost(t.home, "old"))); unlink.mock.restore();
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 1);
  } finally { t.cleanup(); }
});

test("only an acquired sync pass expires counters, including while signed out; commands retain them", async () => {
  const t = makeEnv(), ctx = ctxFor(t);
  try {
    added(t.home, "old", Date.now() - CONTEXT_RETENTION_MS - 1000);
    const status = await runCli(t, ["status"]); assert.equal(status.code, 0, status.stderr);
    assert.ok(fs.existsSync(layout.contextCost(t.home, "old")), "ordinary status does not prune");
    fs.writeFileSync(path.join(t.home, "sync.lock"), String(process.pid));
    assert.equal((await syncOnce(ctx, { tailBudgetMs: 0 })).skipped, true);
    assert.ok(fs.existsSync(layout.contextCost(t.home, "old")), "a skipped pass does not prune");
    fs.unlinkSync(path.join(t.home, "sync.lock"));
    assert.equal((await syncOnce(ctx, { tailBudgetMs: 0 })).skipped, false);
    assert.equal(fs.existsSync(layout.contextCost(t.home, "old")), false);
  } finally { ctx.db.close(); t.cleanup(); }
});

for (const live of [6000, 20000]) test(`real-clock cleanup reaches expired logs late among ${live} live logs across fresh sync processes`, { timeout: 60_000 }, () => {
  const t = makeEnv();
  try {
    const dir = layout.contextCostDir(t.home); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < live + 50; i++) {
      const file = layout.contextCost(t.home, `large_${String(i).padStart(5, "0")}`);
      fs.writeFileSync(file, "saved\n"); fs.utimesSync(file, new Date(AT), new Date(AT));
    }
    // Place expired logs after the live prefix in the sorted order used by cleanup.
    const expired = fs.readdirSync(dir).sort().slice(-50);
    for (const name of expired) fs.utimesSync(path.join(dir, name), new Date(AT - CONTEXT_RETENTION_MS), new Date(AT - CONTEXT_RETENTION_MS));
    const script = `import fs from "node:fs";
      import { pruneContextCost } from ${JSON.stringify(path.join(PKG, "src/context-cost-retention.ts"))};
      let examined = 0;
      const lstat = fs.lstatSync;
      fs.lstatSync = (...args) => { examined++; return lstat(...args); };
      const removed = pruneContextCost(process.argv[1], () => Number(process.argv[2]));
      console.log(JSON.stringify({ removed, examined }));`;
    let passes = 0, removed = 0;
    while (expired.some((name) => fs.existsSync(path.join(dir, name))) && passes < 200) {
      const run = spawnSync(process.execPath, ["--input-type=module", "-e", script, t.home, String(AT)], { env: t.env, encoding: "utf8", timeout: 5000 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.ok(result.removed >= 0 && result.removed <= CONTEXT_PRUNE_LIMIT);
      assert.ok(result.examined >= 0 && result.examined <= CONTEXT_EXAMINE_LIMIT);
      removed += result.removed; passes++;
    }
    assert.ok(passes > 1, "the directory exceeds a single pass");
    assert.equal(removed, expired.length, `all expired logs removed after ${passes} passes`);
    assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith(".jsonl")).length, live);
  } finally { t.cleanup(); }
});

test("name-only listing needs no entry types; lstat spares symlinks", (tc) => {
  const t = makeEnv();
  try {
    added(t.home, "unknown", AT - CONTEXT_RETENTION_MS);
    const target = path.join(t.root, "outside.txt"); fs.writeFileSync(target, "keep");
    fs.utimesSync(target, new Date(0), new Date(0));
    const link = layout.contextCost(t.home, "unknown_link"); fs.symlinkSync(target, link);
    const readdir = fs.readdirSync, lstat = fs.lstatSync, examined: string[] = [];
    tc.mock.method(fs, "readdirSync", (...args: Parameters<typeof fs.readdirSync>) => {
      assert.equal(args[1], undefined, "names only, never entry types");
      return readdir(...args);
    });
    tc.mock.method(fs, "lstatSync", (...args: Parameters<typeof fs.lstatSync>) => {
      examined.push(String(args[0])); return lstat(...args);
    });
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 1);
    assert.deepEqual(examined, [layout.contextCost(t.home, "unknown"), link]);
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(fs.readFileSync(target, "utf8"), "keep");
  } finally { t.cleanup(); }
});

test("at most 500 lstat calls per pass; the saved name advances, survives deletion and wraps", (tc) => {
  const t = makeEnv();
  try {
    for (let i = 0; i < CONTEXT_EXAMINE_LIMIT + 3; i++) added(t.home, `live_${String(i).padStart(4, "0")}`, AT);
    const dir = layout.contextCostDir(t.home), checkpoint = path.join(dir, ".retention.json");
    const names = fs.readdirSync(dir).sort(), lstat = fs.lstatSync;
    let examined = 0, listed = 0;
    const readdir = fs.readdirSync;
    tc.mock.method(fs, "readdirSync", (...args: Parameters<typeof fs.readdirSync>) => { listed++; return readdir(...args); });
    tc.mock.method(fs, "lstatSync", (...args: Parameters<typeof fs.lstatSync>) => { examined++; return lstat(...args); });
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 0);
    assert.equal(examined, CONTEXT_EXAMINE_LIMIT); assert.equal(listed, 1);
    assert.equal(JSON.parse(fs.readFileSync(checkpoint, "utf8")).after, names[CONTEXT_EXAMINE_LIMIT - 1]);
    fs.unlinkSync(path.join(dir, names[CONTEXT_EXAMINE_LIMIT - 1]));
    examined = 0;
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 0);
    assert.equal(examined, 3); assert.equal(listed, 2);
    assert.equal(JSON.parse(fs.readFileSync(checkpoint, "utf8")).after, null);
    examined = 0;
    assert.equal(pruneContextCost(t.home, () => AT, () => 0), 0);
    assert.equal(examined, CONTEXT_EXAMINE_LIMIT);
  } finally { t.cleanup(); }
});
