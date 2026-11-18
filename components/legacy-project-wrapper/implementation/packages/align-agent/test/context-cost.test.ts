import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { renderHot } from "../src/hot.ts";
import { record } from "../src/hooks/siblings.ts";
import { failureDeny, preToolUse, sessionStart, userPromptSubmit, type HookOutput } from "../src/hooks/handlers.ts";
import { contextAddedLine, emptyAddedText } from "../src/shared/context-cost.ts";
import type { BudgetSnapshot } from "../src/shared/budget-notes.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, listSpool } from "../src/shared/layout.ts";
import type { Harness, HotState, InjectedState } from "../src/shared/types.ts";
import { CLI, ctxFor, makeEnv, PKG, runCli, runHook, SHARE_GOAL, shareSession, type TestEnv } from "./helpers.ts";

const envs: TestEnv[] = [];
after(() => envs.forEach((e) => e.cleanup()));
const BLOCK_NET = ["--import", path.join(PKG, "test/fixtures/block-net.mjs")];
function setup(harness: Harness = "claude-code") {
  const t = makeEnv();
  envs.push(t);
  const ctx = ctxFor(t);
  const sid = "context-cost-session";
  const lid = shareSession(ctx, harness, sid);
  const file = layout.injected(t.home, lid);
  const state = () => readJson<InjectedState>(file)!;
  const budget = (spent: number) => {
    const hot = readJson<HotState>(layout.hot(t.home, lid))!;
    const at = new Date().toISOString();
    const snapshot: BudgetSnapshot = { workspace_id: hot.share!.workspace_id, session_key: hot.share!.session_key,
      epoch_id: hot.binding!.epoch_id, fetched_at: at, as_of: at, month: at.slice(0, 7), team: { id: "pod_context", name: "Build" },
      effective_budget_usd_micros: 100, estimated_spend_usd_micros: spent, spend_bound: "exact", unpriced_requests: 0 };
    writeJsonAtomic(layout.budgetCache(t.home, lid), snapshot);
    return snapshot;
  };
  return { t, ctx, sid, lid, file, state, budget };
}

for (const harness of ["claude-code", "codex"] as const) {
  for (const delivery of ["startup", "resume", "prompt"] as const) {
    test(`${harness}: exact totals for budget ${delivery}, tool messages and later prompt context`, () => {
      const { t, sid, file, state, budget } = setup(harness);
      let model = 0, person = 0, modelAdds = 0, personAdds = 0;
      const checked = (run: () => HookOutput, event: string, writesExpected: number) => {
        const before = { model: state()?.context_added, person: state()?.notices_added };
        let writes = 0;
        const rename = fs.renameSync;
        fs.renameSync = (...args) => { if (args[1] === file) writes++; return rename(...args); };
        let out: any;
        try { out = run(); } finally { fs.renameSync = rename; }
        const text = (out?.hookSpecificOutput?.additionalContext || "") + (out?.hookSpecificOutput?.permissionDecisionReason || "");
        const notice = (out?.systemMessage || "") + (out?.decision === "block" ? out.reason : "");
        if (text) { model += text.length; modelAdds++; }
        if (notice) { person += notice.length; personAdds++; }
        assert.equal(writes, writesExpected, "only the existing or one accounting state write");
        assert.equal(state()?.context_added?.characters || 0, model);
        assert.equal(state()?.context_added?.additions || 0, modelAdds);
        assert.equal(state()?.notices_added?.characters || 0, person);
        assert.equal(state()?.notices_added?.additions || 0, personAdds);
        if (text) assert.equal(state().context_added?.last_event, event);
        else assert.deepEqual(state()?.context_added, before.model);
        if (notice) assert.equal(state().notices_added?.last_event, event);
        else assert.deepEqual(state()?.notices_added, before.person);
        return out;
      };
      const start = (source: string) => sessionStart(t.home, harness, { session_id: sid, source }, t.env);
      const prompt = () => userPromptSubmit(t.home, harness, { session_id: sid, prompt: "Continue", prompt_id: "budget", turn_id: "budget" });
      const tool = (agent_id?: string) => preToolUse(t.home, harness, { session_id: sid, tool_name: "Read", ...(agent_id ? { agent_id } : {}) });
      if (delivery !== "startup") checked(() => start("startup"), "SessionStart", 1);
      budget(80);
      const out = delivery === "prompt" ? checked(prompt, "UserPromptSubmit", 1) : checked(() => start(delivery), "SessionStart", 1);
      assert.match(out.hookSpecificOutput.additionalContext, /80% of its team budget/);
      assert.match(out.systemMessage, /80% of its team budget/);
      assert.equal(checked(prompt, "UserPromptSubmit", 1), null);
      budget(100);
      assert.equal(checked(() => tool("child"), "PreToolUse", 0), null);
      fs.mkdirSync(file + ".lock");
      try { assert.equal(checked(() => tool(), "PreToolUse", 0), null); }
      finally { fs.rmdirSync(file + ".lock"); }
      const beforeTool = state();
      const message = checked(() => tool(), "PreToolUse", harness === "claude-code" ? 1 : 0);
      const withoutCounters = ({ context_added, notices_added, ...fields }: InjectedState) => fields;
      assert.deepEqual(withoutCounters(state()), withoutCounters(beforeTool), "a message-only tool return preserves normal hook state");
      if (harness === "claude-code") {
        assert.match(message.systemMessage, /100% of its team budget/);
        assert.equal(message.hookSpecificOutput, undefined);
      } else assert.equal(message, null);
      const next = checked(prompt, "UserPromptSubmit", 1);
      assert.match(next.hookSpecificOutput.additionalContext, /100% of its team budget/);
      if (harness === "claude-code") assert.equal(next.systemMessage, undefined);
      else assert.match(next.systemMessage, /100% of its team budget/);
      assert.equal(checked(() => tool(), "PreToolUse", 0), null);
      for (let i = 0; i < 3; i++) assert.equal(checked(prompt, "UserPromptSubmit", 1), null);
    });
  }
}

for (const harness of ["claude-code", "codex"] as const) {
  test(`${harness}: exact returned total through startup, goal change and unchanged prompts; unchanged prompts preserve recorded totals and last-addition times and return exactly 0 bytes`, () => {
    const { t, ctx, sid, lid, state } = setup(harness);
    const provider = harness === "claude-code" ? "claude" : "codex";
    const start = runHook(t, provider, "SessionStart", { session_id: sid, source: "startup" }, {}, BLOCK_NET);
    assert.equal(start.code, 0, start.stderr);
    const first = JSON.parse(start.stdout).hookSpecificOutput.additionalContext as string;
    assert.equal(state().context_added?.characters, first.length);
    assert.equal(state().context_added?.additions, 1);
    assert.equal(state().context_added?.last_event, "SessionStart");
    const unchanged = () => {
      const before = { context: state().context_added, person: state().notices_added };
      for (let i = 0; i < 8; i++) {
        const r = runHook(t, provider, "UserPromptSubmit", { session_id: sid, prompt: "continue", prompt_id: `p${i}`, turn_id: `p${i}` }, {}, BLOCK_NET);
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, "");
        assert.deepEqual({ context: state().context_added, person: state().notices_added }, before);
      }
    };
    unchanged();
    ctx.db.prepare("UPDATE shares SET goal_json=? WHERE local_id=?").run(JSON.stringify({ ...SHARE_GOAL, version: 4, title: 'Ship the caf\u00e9 flow "first"' }), lid);
    renderHot(ctx, lid);
    const change = runHook(t, provider, "UserPromptSubmit", { session_id: sid, prompt: "next", prompt_id: "changed", turn_id: "changed" }, {}, BLOCK_NET);
    assert.equal(change.code, 0, change.stderr);
    const delta = JSON.parse(change.stdout).hookSpecificOutput.additionalContext as string;
    assert.match(delta, /v4/);
    assert.equal(state().context_added?.characters, first.length + delta.length);
    assert.equal(state().context_added?.additions, 2);
    assert.equal(state().context_added?.last_event, "UserPromptSubmit");
    assert.ok(Number.isFinite(Date.parse(state().context_added!.last_at!)));
    unchanged();
  });
}

test("final output counts both audiences separately, with one state write and no accounting reread", () => {
  const { t, sid, lid, file, state } = setup();
  let model = 0, person = 0, modelAdds = 0, personAdds = 0;
  const checked = (run: () => HookOutput, event: string, modelPattern?: RegExp, personPattern?: RegExp) => {
    let writes = 0, reads = 0;
    const rename = fs.renameSync, read = fs.readFileSync;
    fs.renameSync = (...args) => { if (args[1] === file) writes++; return rename(...args); };
    fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => { if (args[0] === file) reads++; return read(...args); }) as typeof fs.readFileSync;
    let out: any;
    try { out = run(); } finally { fs.renameSync = rename; fs.readFileSync = read; }
    const text = [out?.hookSpecificOutput?.additionalContext, out?.hookSpecificOutput?.permissionDecisionReason].filter(Boolean).join("\n");
    const notice = [out?.systemMessage, out?.decision === "block" ? out.reason : null].filter(Boolean).join("\n");
    if (modelPattern) assert.match(text, modelPattern);
    if (personPattern) assert.match(notice, personPattern);
    if (text) { model += text.length; modelAdds++; }
    if (notice) { person += notice.length; personAdds++; }
    assert.equal(writes, text || notice ? 1 : 0, "one shared state write for the whole return");
    // Existing feed-hold checks also read state; accounting must reuse the handler's state.
    if (event === "SessionStart" || out?.decision === "block") assert.equal(reads, 1);
    assert.equal(state().context_added?.characters || 0, model);
    assert.equal(state().context_added?.additions || 0, modelAdds);
    assert.equal(state().notices_added?.characters || 0, person);
    assert.equal(state().notices_added?.additions || 0, personAdds);
    if (text) assert.equal(state().context_added?.last_event, event);
    return out;
  };
  const hotFile = layout.hot(t.home, lid);
  const hot = readJson<HotState>(hotFile)!;
  const start = () => sessionStart(t.home, "claude-code", { session_id: sid, source: "startup" }, t.env);
  checked(start, "SessionStart", /Align goal context/);
  // Multiple parts in one return, including an accented character and quoted data.
  hot.requests = [{ id: "rq_context", directive_id: "d_request", type: "checkpoint", state: "pending", goal: { id: SHARE_GOAL.id, title: SHARE_GOAL.title, version: 3 }, target_goal: null, sender: { name: "Kim", role: "owner" }, note: 'Check the caf\u00e9 "flow"', created_at: new Date().toISOString() }];
  writeJsonAtomic(hotFile, hot);
  const prompt = (text = "continue") => userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: text });
  checked(() => prompt(), "UserPromptSubmit", /request from/, /Kim/);
  checked(() => prompt("::align decline context"), "UserPromptSubmit", undefined, /you declined/);
  checked(() => prompt(), "UserPromptSubmit", /developer declined/);
  checked(() => sessionStart(t.home, "claude-code", { session_id: sid, source: "compact" }, t.env), "SessionStart", /Align goal context/);
  hot.goal = { ...SHARE_GOAL, version: 5 };
  writeJsonAtomic(hotFile, hot);
  const tool = () => preToolUse(t.home, "claude-code", { session_id: sid, tool_name: "Bash" });
  checked(tool, "PreToolUse", /v5/);
  writeJsonAtomic(layout.latch(t.home, lid), { stopped: true });
  checked(tool, "PreToolUse", /stopped/);
  checked(tool, "PreToolUse", /stopped/);
  checked(() => failureDeny(t.home, "claude-code", sid), "PreToolUse", /stopped/);
  fs.unlinkSync(layout.latch(t.home, lid));
  hot.resumed = "resume-one";
  writeJsonAtomic(hotFile, hot);
  checked(() => prompt(), "UserPromptSubmit", /resumed/);
  writeJsonAtomic(layout.hold(t.home, lid), { holds: [{ goal_id: SHARE_GOAL.id, goal_title: SHARE_GOAL.title, by: "Kim" }] });
  checked(tool, "PreToolUse", /paused/);
  fs.unlinkSync(layout.hold(t.home, lid));
  hot.released_holds = [{ goal_id: SHARE_GOAL.id, goal_title: SHARE_GOAL.title, by: "Kim", directive_id: "release-one" }];
  writeJsonAtomic(hotFile, hot);
  checked(() => prompt(), "UserPromptSubmit", /released the hold/);
});

test("status selects only the latest session in this folder; sessions shows exact counts and zero defaults", async () => {
  const { t, ctx, sid, lid, state } = setup();
  ctx.db.prepare("UPDATE sessions SET cwd=? WHERE local_id=?").run(PKG, lid);
  const other = shareSession(ctx, "codex", "elsewhere");
  sessionStart(t.home, "claude-code", { session_id: sid }, t.env);
  const expected = contextAddedLine(state().context_added);
  const status = spawnSync(process.execPath, [CLI, "status"], { cwd: PKG, env: t.env, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.split("\n").filter((l) => l.startsWith("Align has added")).join("\n"), expected);
  const sessions = await runCli(t, ["sessions"]);
  assert.equal(sessions.code, 0, sessions.stderr);
  assert.ok(sessions.stdout.includes(expected));
  assert.match(sessions.stdout, /Align has added no characters to this session's context\./);
  const rows = JSON.parse((await runCli(t, ["sessions", "--json"])).stdout);
  assert.deepEqual(rows.find((r: any) => r.local_id === lid).context_added, state().context_added);
  assert.deepEqual(rows.find((r: any) => r.local_id === other).context_added, emptyAddedText());
  assert.deepEqual(rows.find((r: any) => r.local_id === other).notices_added, emptyAddedText());
  const alias = path.join(t.root, "folder-alias");
  fs.symlinkSync(PKG, alias, "dir");
  ctx.db.prepare("UPDATE sessions SET cwd=?, last_active=? WHERE local_id=?").run(alias, "2099-01-01T00:00:00.000Z", other);
  const newer = spawnSync(process.execPath, [CLI, "status"], { cwd: PKG, env: t.env, encoding: "utf8" });
  assert.equal(newer.status, 0, newer.stderr);
  assert.match(newer.stdout, /Align has added no characters to this session's context\./);
  assert.ok(!newer.stdout.includes(expected), "the older session is not reported as current");
  const absent = spawnSync(process.execPath, [CLI, "status"], { cwd: t.root, env: t.env, encoding: "utf8" });
  assert.equal(absent.status, 0, absent.stderr);
  assert.doesNotMatch(absent.stdout, /Align has added/);
});

test("a tool return counts the joined goal delta and sibling note once with a separate budget message; a collision counts its exact denial", () => {
  const { t, ctx, sid, lid, state, budget } = setup();
  const other = shareSession(ctx, "codex", "sibling-cost");
  const file = path.join(t.root, "work.txt");
  fs.writeFileSync(file, "changed\n");
  sessionStart(t.home, "claude-code", { session_id: sid }, t.env);
  const before = state().context_added!;
  record(t.home, lid, [{ t: "read", at: new Date(Date.now() - 2_000).toISOString(), p: file, g: SHARE_GOAL.id }]);
  record(t.home, other, [{ t: "edit", at: new Date(Date.now() - 500).toISOString(), p: file, g: SHARE_GOAL.id }]);
  ctx.db.prepare("UPDATE shares SET goal_json=? WHERE local_id=?").run(JSON.stringify({ ...SHARE_GOAL, version: 4 }), lid);
  renderHot(ctx, lid);
  budget(80);
  const out = preToolUse(t.home, "claude-code", { session_id: sid, tool_name: "Bash", cwd: t.root }) as any;
  const text = out.hookSpecificOutput.additionalContext as string;
  assert.match(text, /v4/);
  assert.match(text, /after this session last read it/);
  assert.match(out.systemMessage, /80% of its team budget/);
  assert.equal(state().context_added?.characters, before.characters + text.length);
  assert.equal(state().context_added?.additions, before.additions + 1);
  assert.equal(state().notices_added?.characters, out.systemMessage.length);
  assert.equal(state().notices_added?.additions, 1);
  const deny = preToolUse(t.home, "claude-code", { session_id: sid, tool_name: "Edit", cwd: t.root, tool_input: { file_path: file, old_string: "changed", new_string: "next" } }) as any;
  assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(state().context_added?.characters, before.characters + text.length + deny.hookSpecificOutput.permissionDecisionReason.length);
  assert.equal(state().context_added?.additions, before.additions + 2);
});

test("an explicit same-goal choice stays silent, is saved once and does not change the counters", () => {
  const { t, sid, lid, file, state } = setup();
  sessionStart(t.home, "claude-code", { session_id: sid }, t.env);
  const hotFile = layout.hot(t.home, lid);
  const hot = readJson<HotState>(hotFile)!;
  hot.pending_binding = { id: "pb_explicit", goal_id: SHARE_GOAL.id, goal: SHARE_GOAL, cause: "manual", directive_id: null };
  writeJsonAtomic(hotFile, hot);
  const before = { context: state().context_added, person: state().notices_added };
  fs.utimesSync(file, new Date(0), new Date(0));
  assert.equal(userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: "go", prompt_id: "choice" }), null);
  assert.equal(state().consumed_binding, "pb_explicit");
  assert.notEqual(fs.statSync(file).mtimeMs, 0, "the base's normal bookkeeping write still happens");
  for (let i = 0; i < 3; i++) assert.equal(userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: "continue", prompt_id: `after-${i}` }), null);
  assert.deepEqual({ context: state().context_added, person: state().notices_added }, before);
  const epochs = listSpool(t.home).map((f) => readJson<{ type: string }>(f)).filter((r) => r?.type === "epoch_open");
  assert.equal(epochs.length, 1);
});

test("an added accounting-only write preserves all existing hook-state fields", () => {
  const { t, sid, state } = setup();
  sessionStart(t.home, "claude-code", { session_id: sid }, t.env);
  const before = state();
  const out = userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: "::align status" }) as any;
  assert.equal(out.decision, "block");
  const after = state();
  assert.equal(after.notices_added?.characters, out.reason.length);
  const withoutCounters = ({ context_added, notices_added, ...fields }: InjectedState) => fields;
  assert.deepEqual(withoutCounters(after), withoutCounters(before));
});
