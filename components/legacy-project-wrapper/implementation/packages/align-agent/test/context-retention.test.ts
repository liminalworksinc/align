import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CONTEXT_PRUNE_LIMIT, CONTEXT_RETENTION_MS, pruneContextCost } from "../src/context-cost-retention.ts";
import { countOutput, readContextCost } from "../src/shared/context-cost.ts";
import { layout } from "../src/shared/layout.ts";
import { syncOnce } from "../src/sync.ts";
import { ctxFor, makeEnv, runCli } from "./helpers.ts";

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

test("cleanup streams entries, caps removals per pass and spares recently appended and unrelated files", () => {
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
    const read = fs.Dir.prototype.readSync;
    tc.mock.method(fs.Dir.prototype, "readSync", function (this: fs.Dir) { reads++; return read.call(this); });
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
