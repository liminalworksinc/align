// Hook latency as a person experiences it: the whole hook process, Node startup included, under 150 ms at p95 on a
// quiet machine. Each case also times a bare Node process between hook runs, so a busy machine is told apart from a slow hook.
// Runs on its own (`npm test` runs this folder after the concurrent suite, with --test-concurrency=1): timed alongside
// other test files spawning CLIs on the same cores, it measures their load, not the hook.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { after, describe, test } from "node:test";
import { writeJsonAtomic } from "../../src/shared/fsx.ts";
import { layout } from "../../src/shared/layout.ts";
import { ctxFor, makeEnv, PKG, runHook, shareSession, type TestEnv } from "../helpers.ts";

const BLOCK_NET = ["--import", path.join(PKG, "test", "fixtures", "block-net.mjs")];
const envs: TestEnv[] = [];
after(() => envs.forEach((e) => e.cleanup()));

const LIMIT_MS = 150;
/** p95 of a Node process that does nothing, on a machine with spare cores. Above this, the machine is busy. */
const QUIET_BARE_P95_MS = 60;
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

/** A Node process that loads nothing and exits, started the same way as a hook and timed the same way. */
function bareNodeMs(): number {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [...BLOCK_NET, "-e", "0"], { input: "{}", encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** Bare Node p95 above which the machine is too busy for the run to say anything about the hook. */
const TOO_BUSY_BARE_P95_MS = 160;

/** The limit is 150 ms on a quiet machine, where a bare Node start has a p95 of at most 60 ms. Bare Node runs are
 *  interleaved with the hook runs. On a busy machine every process slows by about the same factor, so the limit grows
 *  by the factor bare Node slowed by (150 ms times bare p95 over 60 ms). A slower hook still fails: the factor comes
 *  from bare Node alone. Past a bare p95 of 160 ms the case is skipped with its numbers, never passed. */
function assertWithinLimit(tcase: { diagnostic(message: string): void; skip(message?: string): void }, hook: number[], bare: number[]): void {
  const h = p95(hook), b = p95(bare), limit = LIMIT_MS * Math.max(1, b / QUIET_BARE_P95_MS);
  const line = `hook p95 ${h.toFixed(1)} ms, bare Node p95 ${b.toFixed(1)} ms, limit ${limit.toFixed(1)} ms`;
  tcase.diagnostic(line);
  if (b > TOO_BUSY_BARE_P95_MS) return tcase.skip(`machine too busy to measure hook latency: ${line}`);
  assert.ok(h < limit, line);
}

function setup() {
  const t = makeEnv();
  envs.push(t);
  return { t, ctx: ctxFor(t) };
}

describe("claude hooks", () => {
  test("p95 latency under 150 ms with networking blocked", (tcase) => {
    const { t, ctx } = setup();
    const sid = "sess-latency";
    const lid = shareSession(ctx, "claude-code", sid);
    const at = new Date().toISOString();
    writeJsonAtomic(layout.budgetCache(t.home, lid), {
      workspace_id: "ws_1", session_key: `key-${sid}`, epoch_id: "ep_1", fetched_at: at, as_of: at,
      month: at.slice(0, 7), team: { id: "pod_latency", name: "Build" }, effective_budget_usd_micros: 100,
      estimated_spend_usd_micros: 100, spend_bound: "exact", unpriced_requests: 0,
    });
    const times: number[] = [];
    const events: [string, object][] = [
      ["SessionStart", { session_id: sid, source: "startup" }],
      ["UserPromptSubmit", { session_id: sid, prompt_id: "p", prompt: "x" }],
      ["PreToolUse", { session_id: sid, tool_name: "Bash" }],
    ];
    const bare: number[] = [];
    for (let i = 0; i < 30; i++) {
      const [ev, input] = events[i % 3];
      bare.push(bareNodeMs());
      const r = runHook(t, "claude", ev, input, {}, BLOCK_NET);
      assert.equal(r.code, 0, r.stderr);
      times.push(r.ms);
    }
    assertWithinLimit(tcase, times, bare);
  });
  test("p95 latency under 150 ms with a budget below 80 percent and networking blocked", (tcase) => {
    const { t, ctx } = setup();
    const sid = "sess-latency-below";
    const lid = shareSession(ctx, "claude-code", sid);
    const at = new Date().toISOString();
    writeJsonAtomic(layout.budgetCache(t.home, lid), {
      workspace_id: "ws_1", session_key: `key-${sid}`, epoch_id: "ep_1", fetched_at: at, as_of: at,
      month: at.slice(0, 7), team: { id: "pod_latency", name: "Build" }, effective_budget_usd_micros: 100,
      estimated_spend_usd_micros: 79, spend_bound: "exact", unpriced_requests: 0,
    });
    const times: number[] = [];
    const events: [string, object][] = [
      ["SessionStart", { session_id: sid, source: "startup" }],
      ["UserPromptSubmit", { session_id: sid, prompt_id: "p", prompt: "x" }],
      ["PreToolUse", { session_id: sid, tool_name: "Bash" }],
    ];
    const bare: number[] = [];
    for (let i = 0; i < 30; i++) {
      const [ev, input] = events[i % 3];
      bare.push(bareNodeMs());
      const r = runHook(t, "claude", ev, input, {}, BLOCK_NET);
      assert.equal(r.code, 0, r.stderr);
      times.push(r.ms);
    }
    assertWithinLimit(tcase, times, bare);
  });
});
