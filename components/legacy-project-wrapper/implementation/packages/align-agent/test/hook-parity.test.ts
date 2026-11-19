import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import * as handlers from "../src/hooks/handlers.ts";
import { record } from "../src/hooks/siblings.ts";
import { readContextCost } from "../src/shared/context-cost.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { Harness, HotState } from "../src/shared/types.ts";
import { makeEnv, PKG, runHook, SHARE_GOAL, type TestEnv } from "./helpers.ts";

const AT = "2026-11-18T12:00:00.000Z";
const SID = "paired-context";
const names = ["sessionStart", "userPromptSubmit", "preToolUse", "latchDeny", "failureDeny", "command", "goalHoldDeny", "stopLatchDeny", "collisionDeny", "missingSession"] as const;
type Name = typeof names[number];

// Identical time and ids make all shared files comparable, including spool names and records.
function deterministic<T>(run: () => T): T {
  const RealDate = Date, random = crypto.randomBytes;
  let sequence = 0;
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [AT]) as [string]); }
    static now() { return RealDate.parse(AT); }
  } as DateConstructor;
  crypto.randomBytes = ((size: number) => crypto.createHash("sha256").update(String(sequence++)).digest().subarray(0, size)) as typeof crypto.randomBytes;
  try { return run(); } finally { globalThis.Date = RealDate; crypto.randomBytes = random; }
}

function files(home: string, relative = ""): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  for (const entry of fs.readdirSync(path.join(home, relative), { withFileTypes: true })) {
    if (!relative && entry.name === "context-cost") continue;
    const file = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(result, files(home, file));
    else result[file] = fs.readFileSync(path.join(home, file));
  }
  return result;
}

function seed(home: string, harness: Harness, cwd: string, established: boolean) {
  const lid = localId(harness, SID);
  const team = { id: "pod_context", name: "Build" };
  const goal = { ...SHARE_GOAL, title: 'Ship the caf\u00e9 "flow"', limits: [{ id: "limit_one", type: "must" as const, text: "Keep the accepted flow", source: null }] };
  const hot: HotState = { v: 1, updated_at: AT, local_id: lid, harness, native_session_id: SID, cwd,
    share: { workspace_id: "ws_context", workspace_name: "Build", session_key: "shared_context", state: "shared" },
    goal, binding: { epoch_id: "epoch_context", goal_id: goal.id }, pending_binding: null, pending_directives: [], notices: [], epochs_seen: ["epoch_context"] };
  writeJsonAtomic(layout.hot(home, lid), hot);
  writeJsonAtomic(layout.feed(home, "ws_context"), { goals: [{ ...goal, team }] });
  writeJsonAtomic(layout.asksFeed(home, "ws_context"), { asks: [{ id: "ask_one", state: "accepted", team,
    text: "Keep the accepted ask", from_label: "Faculty", source: { date: "2026-11-17" }, decided_by: { name: "Kim" }, decided_at: AT }] });
  if (established) deterministic(() => handlers.sessionStartUncounted(home, harness, { session_id: SID, cwd }, {}));
  hot.goal = { ...goal, version: 4 };
  hot.pending_directives = ["directive_context"];
  hot.notices = [{ id: "notice_context", text: "Align: the shared goal was updated." }];
  hot.requests = [{ id: "request_context", directive_id: "request_directive", type: "checkpoint", state: "pending",
    goal: { id: goal.id, title: goal.title, version: 4 }, target_goal: null, sender: { id: "person_one", name: "Kim", role: "owner" }, note: "Check the accepted flow", created_at: AT }];
  writeJsonAtomic(layout.hot(home, lid), hot);
  writeJsonAtomic(layout.budgetCache(home, lid), { workspace_id: "ws_context", session_key: "shared_context", epoch_id: "epoch_context",
    fetched_at: AT, as_of: AT, month: AT.slice(0, 7), team, effective_budget_usd_micros: 100,
    estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
  return lid;
}

function invoke(name: Name, home: string, harness: Harness, cwd: string, counted: boolean, source = "startup") {
  const result = spawnSync(process.execPath, ["--import", path.join(PKG, "test/fixtures/block-net.mjs"),
    path.join(PKG, "test/fixtures/context-parity-worker.mjs"), JSON.stringify({ name, home, harness, cwd, counted, source, at: AT })],
    { encoding: "utf8", timeout: 10_000, env: { PATH: process.env.PATH, HOME: cwd, ALIGN_HOME: home, ALIGN_NO_AUTOSTART: "1" } });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

function assertCount(home: string, lid: string, name: Name, out: any) {
  // The contract counts UTF-16 string lengths, not JSON bytes or UTF-8 bytes.
  const model = (out?.hookSpecificOutput?.additionalContext || "").length + (out?.hookSpecificOutput?.permissionDecisionReason || "").length;
  const person = typeof out === "string" ? out.length : (out?.systemMessage || "").length + (out?.decision === "block" ? out.reason.length : 0);
  const totals = readContextCost(home, lid);
  if (name === "missingSession") {
    assert.equal(fs.existsSync(layout.contextCostDir(home)), false);
    return;
  }
  const event = name === "sessionStart" ? "SessionStart" : ["command", "userPromptSubmit"].includes(name) ? "UserPromptSubmit" : "PreToolUse";
  for (const [key, length] of [["context_added", model], ["notices_added", person]] as const) {
    assert.deepEqual(totals[key], { characters: length, additions: length ? 1 : 0, last_at: length ? AT : null, last_event: length ? event : null });
  }
  const file = layout.contextCost(home, lid);
  const rows = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  assert.deepEqual(rows, [["model", model, AT, event], ["person", person, AT, event]].filter(([, length]) => length));
}

for (const harness of ["claude-code", "codex"] as const) {
  for (const name of names) {
    const sources = name === "sessionStart" ? ["startup", "clear", "compact", "resume"] : ["startup"];
    for (const source of sources) test(`${harness}: ${name} ${source} preserves output and every shared file`, () => {
      const t = makeEnv();
      try {
        const cwd = path.join(t.root, "work"); fs.mkdirSync(cwd);
        const lid = seed(t.home, harness, cwd, name !== "sessionStart");
        if (name === "preToolUse" || name === "collisionDeny") {
          const other = localId("codex", "paired_sibling");
          const hot = readJson<HotState>(layout.hot(t.home, lid))!;
          writeJsonAtomic(layout.hot(t.home, other), { ...hot, local_id: other, harness: "codex", native_session_id: "paired_sibling" });
          const file = path.join(cwd, "work.txt"); fs.writeFileSync(file, "changed\n");
          record(t.home, lid, [{ t: "read", at: "2026-11-18T11:59:58.000Z", p: file, g: SHARE_GOAL.id }]);
          record(t.home, other, [{ t: "edit", at: "2026-11-18T11:59:59.500Z", p: file, g: SHARE_GOAL.id }]);
        }
        if (["latchDeny", "failureDeny", "stopLatchDeny", "missingSession"].includes(name)) writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
        if (name === "goalHoldDeny") writeJsonAtomic(layout.hold(t.home, lid), { holds: [{ goal_id: SHARE_GOAL.id, goal_title: SHARE_GOAL.title, by: "Kim" }] });
        const plain = path.join(t.root, "plain"), counted = path.join(t.root, "counted");
        fs.cpSync(t.home, plain, { recursive: true }); fs.cpSync(t.home, counted, { recursive: true });
        assert.deepEqual(files(counted), files(plain), "identical initial homes");
        const expected = invoke(name, plain, harness, cwd, false, source);
        const actual = invoke(name, counted, harness, cwd, true, source);
        assert.deepEqual(actual, expected);
        assert.deepEqual(files(counted), files(plain), "all shared file names and bytes match, excluding only context-cost/");
        assertCount(counted, lid, name, actual);
        assert.equal(fs.existsSync(layout.contextCostDir(plain)), false);
        const text = JSON.stringify(actual);
        if (name === "sessionStart") {
          assert.match(text, /Keep the accepted flow/); assert.match(text, /Keep the accepted ask/);
          if (["startup", "resume"].includes(source)) assert.match(text, /80%/);
          else assert.doesNotMatch(text, /80%/);
        }
        if (name === "userPromptSubmit") { assert.match(text, /A request from Kim/); assert.match(text, /80%/); }
        if (name === "preToolUse") { assert.match(text, /now v4/); assert.match(text, /after this session last read it/); }
        if (["latchDeny", "failureDeny", "goalHoldDeny", "stopLatchDeny", "collisionDeny", "missingSession"].includes(name)) assert.equal(actual.hookSpecificOutput.permissionDecision, "deny");
        if (name === "goalHoldDeny") assert.match(text, /paused all agents on goal/);
        if (name === "stopLatchDeny") assert.match(text, /stopped/);
        if (name === "collisionDeny") assert.match(text, /work.txt/);
      } finally { t.cleanup(); }
    });
  }
}

// Measure the hook's internal deadline; whole-process startup latency has its unchanged serial gate.
function timedHook(t: TestEnv, event: string, input: unknown, env: NodeJS.ProcessEnv = {}) {
  const timing = path.join(t.root, `hook-timing-${crypto.randomBytes(8).toString("hex")}.json`);
  try {
    const run = runHook(t, "claude", event, input, { ...env, ALIGN_TEST_HOOK_TIMING: timing }, [
      "--import", path.join(PKG, "test/fixtures/block-net.mjs"), "--import", path.join(PKG, "test/fixtures/hook-paths.mjs"),
    ]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.stderr, "");
    const measured = JSON.parse(fs.readFileSync(timing, "utf8"));
    assert.ok(typeof measured.ms === "number" && measured.ms < 300, `hook exceeded its internal deadline: ${measured.ms} ms (process ${run.ms} ms)`);
    return { ...run, timing: measured };
  } finally { fs.rmSync(timing, { force: true }); }
}

for (const broken of ["directory-is-file", "read-only", "symlink", "fifo", "counter-is-directory"] as const) {
  test(`counter ${broken} leaves hook output and exit contract unchanged`, { timeout: 30_000 }, () => {
    const t = makeEnv();
    let fifoReader: number | undefined;
    try {
      const lid = seed(t.home, "claude-code", t.root, false);
      const clean = path.join(t.root, "clean"); fs.cpSync(t.home, clean, { recursive: true });
      const dir = layout.contextCostDir(t.home);
      if (broken === "directory-is-file") fs.writeFileSync(dir, "blocked");
      else {
        fs.mkdirSync(dir);
        if (broken === "read-only") fs.chmodSync(dir, 0o500);
        else if (broken === "counter-is-directory") fs.mkdirSync(layout.contextCost(t.home, lid));
        else if (broken === "symlink") {
          fs.writeFileSync(path.join(t.root, "outside.txt"), "unchanged\n");
          fs.symlinkSync(path.join(t.root, "outside.txt"), layout.contextCost(t.home, lid));
        } else {
          const fifo = spawnSync("mkfifo", [layout.contextCost(t.home, lid)], { encoding: "utf8" });
          assert.equal(fifo.status, 0, fifo.stderr);
        }
      }
      const input = { session_id: SID, source: "startup" };
      const expected = timedHook({ ...t, home: clean, env: { ...t.env, ALIGN_HOME: clean } }, "SessionStart", input);
      const actual = timedHook(t, "SessionStart", input);
      assert.equal(expected.code, 0, expected.stderr); assert.equal(actual.code, 0, actual.stderr);
      assert.deepEqual(JSON.parse(actual.stdout), JSON.parse(expected.stdout));
      if (["directory-is-file", "read-only"].includes(broken)) assert.equal(fs.existsSync(layout.contextCost(t.home, lid)), false);
      // The first FIFO open had no reader. This one succeeds, so fstat must reject the opened FIFO.
      if (broken === "fifo") fifoReader = fs.openSync(layout.contextCost(t.home, lid), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
      writeJsonAtomic(layout.latch(clean, lid), { stopped: true });
      const deny = { session_id: SID, tool_name: "Bash" };
      const expectedDeny = timedHook({ ...t, home: clean, env: { ...t.env, ALIGN_HOME: clean } }, "PreToolUse", deny);
      const actualDeny = timedHook(t, "PreToolUse", deny);
      assert.equal(expectedDeny.code, 0, expectedDeny.stderr); assert.equal(actualDeny.code, 0, actualDeny.stderr);
      assert.deepEqual(JSON.parse(actualDeny.stdout), JSON.parse(expectedDeny.stdout));
      assert.equal(JSON.parse(actualDeny.stdout).hookSpecificOutput.permissionDecision, "deny");
      if (fifoReader !== undefined) assert.equal(fs.readSync(fifoReader, Buffer.alloc(1024), 0, 1024, null), 0, "no counter bytes written to an opened FIFO");
      if (broken === "symlink") assert.equal(fs.readFileSync(path.join(t.root, "outside.txt"), "utf8"), "unchanged\n");
    } finally {
      if (fifoReader !== undefined) fs.closeSync(fifoReader);
      if (broken === "read-only") fs.chmodSync(layout.contextCostDir(t.home), 0o700);
      t.cleanup();
    }
  });
}

for (const mode of ["deadline", "failure"] as const) {
  test(`real hook ${mode} preserves the deny when counting works or fails`, () => {
    const t = makeEnv();
    try {
      const lid = seed(t.home, "claude-code", t.root, true);
      writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
      const broken = path.join(t.root, "broken"); fs.cpSync(t.home, broken, { recursive: true });
      fs.writeFileSync(layout.contextCostDir(broken), "blocked");
      // Trigger the actual deadline early and require completion inside the normal internal 300 ms contract.
      const env = { ALIGN_TEST_HOOK_PATH: mode, ALIGN_HOOK_DEADLINE_MS: "30" };
      const input = { session_id: SID, tool_name: "Bash" };
      const working = timedHook(t, "PreToolUse", input, env);
      const failed = timedHook({ ...t, home: broken, env: { ...t.env, ALIGN_HOME: broken } }, "PreToolUse", input, env);
      for (const run of [working, failed]) {
        assert.equal(run.code, 0, run.stderr);
        assert.equal(run.stderr, "");
        assert.equal(run.timing.deadline, mode === "deadline", "the intended real entry-point path ran");
      }
      assert.equal(failed.stdout, working.stdout);
      const out = JSON.parse(working.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /stopped/);
      assert.deepEqual(files(t.home), files(broken));
      assert.equal(readContextCost(t.home, lid).context_added.characters, out.hookSpecificOutput.permissionDecisionReason.length);
      assert.equal(readContextCost(t.home, lid).context_added.additions, 1);
      assert.equal(fs.existsSync(layout.contextCost(broken, lid)), false);
    } finally { t.cleanup(); }
  });
}

test("unsupported runtime returns notices and denials without creating or changing files", () => {
  const t = makeEnv();
  try {
    const args = ["--import", path.join(PKG, "test/fixtures/block-net.mjs"), "--import", path.join(PKG, "test/fixtures/hook-paths.mjs")];
    const env = { ALIGN_TEST_HOOK_PATH: "unsupported", ALIGN_ALLOW_UNSUPPORTED_NODE: "" };
    const start = runHook(t, "claude", "SessionStart", { session_id: SID }, env, args);
    assert.equal(start.code, 0, start.stderr);
    assert.match(JSON.parse(start.stdout).systemMessage, /Align is off/);
    assert.equal(fs.existsSync(t.home), false, "even the home stays absent");
    const lid = localId("claude-code", SID);
    writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
    writeJsonAtomic(layout.hold(t.home, lid), { holds: [{ goal_id: SHARE_GOAL.id, goal_title: SHARE_GOAL.title, by: "Kim" }] });
    const before = files(t.home);
    for (const [event, input] of [
      ["SessionStart", { session_id: SID }],
      ["UserPromptSubmit", { session_id: SID, prompt: "::align status" }],
      ["PreToolUse", { session_id: SID, tool_name: "Bash" }],
      ["PreToolUse", { session_id: SID, tool_name: "Read" }],
    ] as const) {
      const run = runHook(t, "claude", event, input, env, args);
      assert.equal(run.code, 0, run.stderr);
      const out = JSON.parse(run.stdout);
      if (event === "UserPromptSubmit") assert.equal(out.decision, "block");
      if (event === "PreToolUse") {
        assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
        assert.match(out.hookSpecificOutput.permissionDecisionReason, input.tool_name === "Read" ? /paused all agents on goal/ : /stopped/);
      }
      assert.deepEqual(files(t.home), before);
      assert.equal(fs.existsSync(layout.contextCostDir(t.home)), false);
    }
  } finally { t.cleanup(); }
});
