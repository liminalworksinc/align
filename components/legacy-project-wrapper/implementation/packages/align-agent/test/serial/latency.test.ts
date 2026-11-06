// Hook latency as a person experiences it: the whole hook process, Node startup included, under 150 ms at p95.
// Runs on its own (`npm test` runs this folder after the concurrent suite, with --test-concurrency=1): timed alongside
// other test files spawning CLIs on the same cores, it measures their load, not the hook.
import assert from "node:assert/strict";
import path from "node:path";
import { after, describe, test } from "node:test";
import { ctxFor, makeEnv, PKG, runHook, shareSession, type TestEnv } from "../helpers.ts";

const BLOCK_NET = ["--import", path.join(PKG, "test", "fixtures", "block-net.mjs")];
const envs: TestEnv[] = [];
after(() => envs.forEach((e) => e.cleanup()));

function setup() {
  const t = makeEnv();
  envs.push(t);
  return { t, ctx: ctxFor(t) };
}

describe("claude hooks", () => {
  test("p95 latency under 150 ms with networking blocked", () => {
    const { t, ctx } = setup();
    const sid = "sess-latency";
    shareSession(ctx, "claude-code", sid);
    const times: number[] = [];
    const events: [string, object][] = [
      ["SessionStart", { session_id: sid, source: "startup" }],
      ["UserPromptSubmit", { session_id: sid, prompt_id: "p", prompt: "x" }],
      ["PreToolUse", { session_id: sid, tool_name: "Bash" }],
    ];
    for (let i = 0; i < 30; i++) {
      const [ev, input] = events[i % 3];
      const r = runHook(t, "claude", ev, input, {}, BLOCK_NET);
      assert.equal(r.code, 0, r.stderr);
      times.push(r.ms);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1];
    assert.ok(p95 < 150, `p95 ${p95.toFixed(1)} ms`);
  });
});
