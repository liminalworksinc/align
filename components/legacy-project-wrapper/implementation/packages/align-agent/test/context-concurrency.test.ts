import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { sessionStart } from "../src/hooks/handlers.ts";
import { record } from "../src/hooks/siblings.ts";
import { readContextCost } from "../src/shared/context-cost.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { ctxFor, makeEnv, PKG, SHARE_GOAL, shareSession } from "./helpers.ts";

const worker = path.join(PKG, "test/fixtures/context-concurrency-worker.mjs");
const blockNet = path.join(PKG, "test/fixtures/block-net.mjs");
const current = path.join(PKG, "src/hooks/handlers.ts");
test("parallel sibling notes and denies lose no counter lines or delivery markers", { timeout: 30_000 }, async () => {
  const t = makeEnv(), ctx = ctxFor(t);
  const children: ReturnType<typeof spawn>[] = [];
  try {
    const sid = "parallel-context", lid = shareSession(ctx, "claude-code", sid);
    const other = shareSession(ctx, "codex", "parallel-sibling");
    const state = layout.injected(t.home, lid), file = path.join(t.root, "work.txt");
    fs.writeFileSync(file, "changed\n");
    sessionStart(t.home, "claude-code", { session_id: sid }, t.env);
    ctx.db.close();
    const now = Date.now();
    record(t.home, lid, [{ t: "read", at: new Date(now - 2_000).toISOString(), p: file, g: SHARE_GOAL.id }]);
    record(t.home, other, [{ t: "edit", at: new Date(now - 500).toISOString(), p: file, g: SHARE_GOAL.id }]);
    fs.rmSync(layout.contextCostDir(t.home), { recursive: true, force: true });
    const hot = readJson<HotState>(layout.hot(t.home, lid))!;
    hot.goal = { ...SHARE_GOAL, version: 4 };
    hot.pending_directives = ["delivered-parallel"];
    writeJsonAtomic(layout.hot(t.home, lid), hot);
    const run = (handlers: string, input: object, pause: { pauseRead?: number; pauseLock?: boolean; activityGate?: boolean; pauseAppend?: boolean } = {}) => {
      const config = { handlers, input: { session_id: sid, cwd: t.root, ...input }, home: t.home, state, activity: layout.activity(t.home, lid), now, ...pause };
      const child = spawn(process.execPath, ["--import", blockNet, worker, JSON.stringify(config)], { env: t.env, stdio: ["pipe", "pipe", "pipe"] });
      children.push(child);
      let ready!: () => void, paused!: () => void, activityReady!: () => void, output: any, text = "", stderr = "";
      const isReady = new Promise<void>((resolve) => { ready = resolve; });
      const isPaused = new Promise<void>((resolve) => { paused = resolve; });
      const hasActivity = new Promise<void>((resolve) => { activityReady = resolve; });
      child.stdout!.on("data", (chunk) => {
        text += chunk;
        let end: number;
        while ((end = text.indexOf("\n")) >= 0) {
          const message = JSON.parse(text.slice(0, end)); text = text.slice(end + 1);
          if (message.ready) ready();
          if (message.paused) paused();
          if (message.activityReady) activityReady();
          if ("output" in message) output = message.output;
        }
      });
      child.stderr!.on("data", (chunk) => { stderr += chunk; });
      const done = new Promise<any>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => {
          // Resolve the barriers on an early failure too, so failures never hang the test.
          ready(); paused(); activityReady();
          if (code !== 0) reject(new Error(`hook process exited ${code}: ${stderr}`));
          else resolve(output);
        });
      });
      // A barrier may be awaited before the output; retain early failures for that final await.
      void done.catch(() => undefined);
      return { ready: isReady, paused: isPaused, activityReady: hasActivity, done, release: () => child.stdin!.write("g") };
    };
    const single = async (handlers: string, input: object) => {
      const hook = run(handlers, input); await hook.ready; hook.release(); return hook.done;
    };
    const schedule = async (handlers: string) => {
      const outputs: any[] = [];
      fs.mkdirSync(state + ".lock");
      // Eight lock losers with sibling notes and eight collision denies read old state before a newer locked save.
      const first = Array.from({ length: 16 }, (_, i) => i < 8
        ? run(handlers, { tool_name: "Bash", tool_input: { command: "true" } }, { pauseLock: true, activityGate: true })
        : run(handlers, { tool_name: "Edit", tool_input: { file_path: file, old_string: "changed", new_string: "next" } }, { pauseAppend: true, activityGate: true }));
      await Promise.all(first.map((hook) => hook.ready));
      first.forEach((hook) => hook.release());
      // Capture real activity reads before any sibling can record its warning or note.
      await Promise.all(first.map((hook) => hook.activityReady));
      first.forEach((hook) => hook.release());
      await Promise.all(first.map((hook) => hook.paused));
      fs.rmdirSync(state + ".lock");
      outputs.push(await single(handlers, { tool_name: "Bash", tool_input: { command: "true" } }));
      writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
      outputs.push(await single(handlers, { tool_name: "Bash" }));
      fs.unlinkSync(layout.latch(t.home, lid));
      const hold = { holds: [{ goal_id: SHARE_GOAL.id, goal_title: SHARE_GOAL.title, by: "Kim" }] };
      writeJsonAtomic(layout.hold(t.home, lid), hold);
      outputs.push(await single(handlers, { tool_name: "Read" }));
      fs.unlinkSync(layout.hold(t.home, lid));
      fs.mkdirSync(state + ".lock");
      first.forEach((hook) => hook.release());
      outputs.push(...await Promise.all(first.map((hook) => hook.done)));
      fs.rmdirSync(state + ".lock");
      assert.equal(outputs.filter((out) => /now v4/.test(out?.hookSpecificOutput?.additionalContext)).length, 1);

      // Already-told stops and holds must make no shared-state write after another hook delivers v5.
      writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
      writeJsonAtomic(layout.hold(t.home, lid), hold);
      const denies = Array.from({ length: 16 }, (_, i) => run(handlers, { tool_name: i < 8 ? "Bash" : "Read" }, { pauseRead: 1 }));
      await Promise.all(denies.map((hook) => hook.ready));
      denies.forEach((hook) => hook.release());
      await Promise.all(denies.map((hook) => hook.paused));
      fs.unlinkSync(layout.latch(t.home, lid)); fs.unlinkSync(layout.hold(t.home, lid));
      const changed = readJson<HotState>(layout.hot(t.home, lid))!;
      changed.goal = { ...SHARE_GOAL, version: 5 };
      writeJsonAtomic(layout.hot(t.home, lid), changed);
      outputs.push(await single(handlers, { tool_name: "Bash", tool_input: { command: "true" } }));
      denies.forEach((hook) => hook.release());
      outputs.push(...await Promise.all(denies.map((hook) => hook.done)));
      const after = await single(handlers, { tool_name: "Bash", tool_input: { command: "true" } });
      outputs.push(after);
      assert.doesNotMatch(after?.hookSpecificOutput?.additionalContext || "", /now v[45]/, "a delivered delta never repeats");
      assert.equal(outputs.filter((out) => /now v5/.test(out?.hookSpecificOutput?.additionalContext)).length, 1);
      assert.equal(outputs.filter((out) => /after this session last read it/.test(out?.hookSpecificOutput?.additionalContext)).length, 8);
      assert.equal(outputs.filter((out) => out?.hookSpecificOutput?.permissionDecision === "deny").length, 26);
      const bytes = fs.readFileSync(state, "utf8"), saved = JSON.parse(bytes);
      assert.equal(saved.goal_version, 5);
      assert.ok(saved.applied.includes("delivered-parallel"));
      assert.equal(saved.stop_told, true);
      assert.deepEqual(saved.holds_told, [SHARE_GOAL.id]);
      assert.equal(saved.hold_titles[SHARE_GOAL.id], SHARE_GOAL.title);
      return { outputs, bytes };
    };
    const actual = await schedule(current);
    const lines = fs.readFileSync(layout.contextCost(t.home, lid), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const texts = actual.outputs.flatMap((out) => {
      const model = (out?.hookSpecificOutput?.additionalContext || "") + (out?.hookSpecificOutput?.permissionDecisionReason || "");
      const person = (out?.systemMessage || "") + (out?.decision === "block" ? out.reason : "");
      return [["model", model.length], ["person", person.length]].filter(([, length]) => length);
    });
    assert.equal(lines.length, texts.length, "no line from any parallel process is lost");
    assert.deepEqual(lines.map(([audience, characters]) => [audience, characters]).sort(), texts.sort());
    const totals = readContextCost(t.home, lid);
    for (const [audience, total] of [["model", totals.context_added], ["person", totals.notices_added]] as const) {
      const additions = texts.filter(([kind]) => kind === audience);
      assert.equal(total.additions, additions.length);
      assert.equal(total.characters, additions.reduce((sum, [, length]) => sum + Number(length), 0));
    }
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    if (ctx.db.isOpen) ctx.db.close();
    t.cleanup();
  }
});
