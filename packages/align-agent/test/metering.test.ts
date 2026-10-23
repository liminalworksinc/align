// Goldens for the metering plane: transcript and rollout parsing, prices, keys, epochs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { applyEvents, ensureSession, epochFor, recordRootTurn } from "../src/ledger.ts";
import { repoKey, requestKey, sessionKey } from "../src/keys.ts";
import { localId } from "../src/shared/layout.ts";
import { picoToMicros, PRICE_TABLE_VERSION, priceRequest } from "../src/spend/prices.ts";
import { tailFile } from "../src/tailer.ts";
import { promoteSettled } from "../src/sync.ts";
import {
  appendLines,
  claudeAssistant,
  claudeUser,
  codexMeta,
  codexTaskStarted,
  codexTokenCount,
  codexTur,
  codexTurnContext,
  ctxFor,
  makeEnv,
  rows,
  tok,
  usage,
  writeLines,
} from "./helpers.ts";

const envs: { cleanup: () => void }[] = [];
after(() => envs.forEach((e) => e.cleanup()));
function sandbox() {
  const t = makeEnv();
  envs.push(t);
  return { t, ctx: ctxFor(t) };
}

const SID = "11111111-2222-3333-4444-555555555555";

describe("claude transcript", () => {
  test("content-block lines of one request count once; finalized row wins; unfinalized kept local", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "-tmp-synthetic", `${SID}.jsonl`);
    writeLines(file, [
      claudeUser(SID, "p1", "2026-10-22T10:00:00.000Z"),
      claudeAssistant(SID, "req_A", "2026-10-22T10:00:01.000Z", usage(10, 1, 100, 20, 0), { stop: null }),
      claudeAssistant(SID, "req_A", "2026-10-22T10:00:02.000Z", usage(10, 50, 100, 20, 0), { stop: "tool_use" }),
      claudeAssistant(SID, "req_A", "2026-10-22T10:00:03.000Z", usage(10, 2, 100, 20, 0), { stop: null }),
      claudeAssistant(SID, "req_B", "2026-10-22T10:00:04.000Z", usage(5, 3, 0, 0, 0), { stop: null }),
    ]);
    tailFile(ctx, file, "claude-code");
    const r = rows(ctx);
    assert.equal(r.length, 2);
    const a = r.find((x) => x.request_key === requestKey(ctx.secret, "anthropic", "req_A"));
    assert.equal(a.output, 50, "finalized row wins over later unfinalized copies");
    assert.equal(a.finalized, 1);
    assert.equal(a.cache_write_5m, 20);
    assert.equal(a.root_turn, "p1");
    const b = r.find((x) => x.request_key === requestKey(ctx.secret, "anthropic", "req_B"));
    assert.equal(b.finalized, 0, "unfinalized request kept locally");
    assert.equal(rows(ctx, "SELECT * FROM root_turns").length, 1);
  });

  test("an unfinalized row is billed from its last copy once it has been idle for the settle window", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "p", SID, "subagents", "agent-z.jsonl");
    writeLines(file, [
      claudeAssistant(SID, "req_Z", "2026-10-22T10:00:01.000Z", usage(10, 1), { stop: null, sidechain: true }),
      claudeAssistant(SID, "req_Z", "2026-10-22T10:00:02.000Z", usage(10, 7), { stop: null, sidechain: true }),
    ]);
    tailFile(ctx, file, "claude-code");
    assert.equal(promoteSettled(ctx), 0, "fresh rows stay unfinalized");
    assert.equal(promoteSettled({ ...ctx, env: { ...ctx.env, ALIGN_UNFINALIZED_SETTLE_MS: "-1000" } }), 1);
    const [r] = rows(ctx);
    assert.equal(r.finalized, 1);
    assert.equal(r.output, 7, "last copy seen");
  });

  test("split lines across passes, last line without newline, malformed line", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "-tmp-synthetic", `${SID}.jsonl`);
    const l1 = JSON.stringify(claudeUser(SID, "p1", "2026-10-22T10:00:00.000Z"));
    const l2 = JSON.stringify(claudeAssistant(SID, "req_A", "2026-10-22T10:00:01.000Z", usage(10, 5)));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${l1}\n{not json "usage"\n${l2.slice(0, 40)}`);
    tailFile(ctx, file, "claude-code");
    assert.equal(rows(ctx).length, 0, "partial line waits");
    fs.appendFileSync(file, l2.slice(40));
    tailFile(ctx, file, "claude-code");
    assert.equal(rows(ctx).length, 1, "complete JSON without newline is read");
    const off1 = (ctx.db.prepare("SELECT offset FROM files").get() as any).offset;
    fs.appendFileSync(file, "\n");
    tailFile(ctx, file, "claude-code");
    assert.equal(rows(ctx).length, 1, "re-reading the same line does not double count");
    assert.ok((ctx.db.prepare("SELECT offset FROM files").get() as any).offset > off1);
    assert.equal((ctx.db.prepare("SELECT n FROM gaps WHERE reason='malformed_line'").get() as any).n, 1);
  });

  test("conflicting finalized rows keep the first and are counted", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "p", `${SID}.jsonl`);
    writeLines(file, [
      claudeAssistant(SID, "req_C", "2026-10-22T10:00:01.000Z", usage(10, 5)),
      claudeAssistant(SID, "req_C", "2026-10-22T10:00:02.000Z", usage(10, 9)),
    ]);
    tailFile(ctx, file, "claude-code");
    const [r] = rows(ctx);
    assert.equal(r.output, 5);
    assert.equal(r.conflict, 1);
  });

  test("subagent transcripts fold into the parent session and add no root turns", () => {
    const { t, ctx } = sandbox();
    const main = path.join(t.claudeDir, "projects", "p", `${SID}.jsonl`);
    const sub = path.join(t.claudeDir, "projects", "p", SID, "subagents", "agent-abc.jsonl");
    writeLines(main, [claudeUser(SID, "p1", "2026-10-22T10:00:00.000Z"), claudeAssistant(SID, "req_M", "2026-10-22T10:00:01.000Z", usage(1, 1))]);
    writeLines(sub, [
      claudeUser("other-id", "p-sub", "2026-10-22T10:00:02.000Z", { isSidechain: true }),
      claudeAssistant("other-id", "req_S", "2026-10-22T10:00:03.000Z", usage(2, 2), { sidechain: true }),
    ]);
    tailFile(ctx, main, "claude-code");
    tailFile(ctx, sub, "claude-code");
    const r = rows(ctx);
    assert.equal(r.length, 2);
    assert.ok(r.every((x) => x.local_id === localId("claude-code", SID)));
    assert.equal(r.find((x) => x.query_source === "subagent").input, 2);
    assert.equal(rows(ctx, "SELECT * FROM root_turns").length, 1);
  });

  test("5m/1h split priced; untyped cache-write total stays unpriced", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "p", `${SID}.jsonl`);
    const untyped = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 500 };
    writeLines(file, [
      claudeAssistant(SID, "req_T", "2026-10-22T10:00:01.000Z", usage(1000, 1000, 1000, 1000, 1000)),
      claudeAssistant(SID, "req_U", "2026-10-22T10:00:02.000Z", untyped),
      claudeAssistant(SID, "req_X", "2026-10-22T10:00:03.000Z", usage(1, 1), { model: "claude-unknown-9" }),
      claudeAssistant(SID, "req_Y", "2026-10-22T10:00:04.000Z", { input_tokens: -1, output_tokens: 2 }),
    ]);
    tailFile(ctx, file, "claude-code");
    const by = (id: string) => rows(ctx).find((x) => x.request_key === requestKey(ctx.secret, "anthropic", id));
    // opus-5-5: in 4, out 20, cache read 0.2, 5m 5, 1h 8 ($/MTok) => 1000 tokens each = (4+20+0.2+5+8)/1000 $ = 0.0372 $
    assert.equal(by("req_T").est_list_usd_micros, 37_200);
    assert.equal(by("req_T").unpriced, null);
    assert.equal(by("req_U").cache_write_unsplit, 500);
    assert.equal(by("req_U").unpriced, "untyped_cache_write");
    assert.equal(by("req_X").unpriced, "unknown_model");
    assert.equal(by("req_Y").unpriced, "invalid_counters");
    assert.equal(by("req_T").price_table_version, PRICE_TABLE_VERSION);
  });

  test("rewrite and truncate are detected and re-read without double counting", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.claudeDir, "projects", "p", `${SID}.jsonl`);
    writeLines(file, [claudeAssistant(SID, "req_1", "2026-10-22T10:00:01.000Z", usage(1, 1)), claudeAssistant(SID, "req_2", "2026-10-22T10:00:02.000Z", usage(2, 2))]);
    tailFile(ctx, file, "claude-code");
    writeLines(file, [claudeAssistant(SID, "req_9", "2026-10-22T10:00:09.000Z", usage(9, 9))]);
    const r = tailFile(ctx, file, "claude-code");
    assert.equal(r.rewrite, true);
    assert.equal(rows(ctx).length, 3);
    writeLines(file, [claudeAssistant(SID, "req_9", "2026-10-22T10:00:09.000Z", usage(9, 9)), claudeAssistant(SID, "req_10", "2026-10-22T10:00:10.000Z", usage(1, 1))]);
    tailFile(ctx, file, "claude-code");
    assert.equal(rows(ctx).length, 4);
    assert.equal((ctx.db.prepare("SELECT rewrites FROM files").get() as any).rewrites, 1);
  });
});

describe("codex rollout", () => {
  const T = "01a1-thread-main";
  test("token_usage_record and token_count for the same response count once", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.codexHome, "sessions", "2026", "10", "20", `rollout-2026-10-20T10-00-00-${T}.jsonl`);
    writeLines(file, [
      codexMeta(T, T),
      codexTaskStarted("turn1"),
      codexTurnContext("turn1", "gpt-6.1-sol"),
      codexTur("resp_1", T, T, "turn1", tok(1000, 400, 100)),
      codexTokenCount(tok(1000, 400, 100), tok(1000, 400, 100)),
      codexTur("resp_2", T, T, "turn1", tok(2000, 1500, 50)),
      codexTokenCount(tok(3000, 1900, 150), tok(2000, 1500, 50)),
      codexTokenCount(tok(3000, 1900, 150), tok(2000, 1500, 50)),
    ]);
    tailFile(ctx, file, "codex");
    const r = rows(ctx);
    assert.equal(r.length, 2);
    const one = r.find((x) => x.request_key === requestKey(ctx.secret, "openai", "resp:resp_1"));
    assert.equal(one.input, 600, "fresh input excludes cached");
    assert.equal(one.cache_read, 400);
    assert.equal(one.root_turn, "turn1");
    // gpt-6.1-sol: 2/MTok in, 10 out, 0.1 cached => 600*2 + 100*10 + 400*0.1 = 1200+1000+40 = 2240 micro-USD/1e6 tokens
    assert.equal(one.est_list_usd_micros, 2240 / 1);
    assert.equal(rows(ctx, "SELECT * FROM root_turns").length, 1);
  });

  test("legacy token_count path: repeats dropped, cumulative regression rejected", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.codexHome, "sessions", "2026", "10", "20", `rollout-x-${T}.jsonl`);
    writeLines(file, [
      codexMeta(T, T),
      codexTurnContext("turn1", "gpt-5"),
      codexTokenCount(tok(100, 0, 10), tok(100, 0, 10)),
      codexTokenCount(tok(100, 0, 10), tok(100, 0, 10)),
      codexTokenCount(tok(250, 50, 30), tok(150, 50, 20)),
      codexTokenCount(tok(200, 50, 30), tok(10, 0, 1)),
      codexTokenCount(tok(260, 50, 31), null),
    ]);
    tailFile(ctx, file, "codex");
    const r = rows(ctx, "SELECT * FROM requests ORDER BY input, cache_read");
    assert.equal(r.length, 3, "repeat and regression dropped; the row after a regression counts its delta from the new baseline");
    assert.deepEqual(
      r.map((x) => [x.input, x.cache_read, x.output]),
      [
        [60, 0, 1],
        [100, 0, 10],
        [100, 50, 20],
      ],
    );
    assert.equal((ctx.db.prepare("SELECT n FROM gaps WHERE reason='cumulative_regression'").get() as any).n, 1);
  });

  test("token_count rows are retracted once token_usage_record appears in the same rollout", () => {
    const { t, ctx } = sandbox();
    const file = path.join(t.codexHome, "sessions", "r", `rollout-y-${T}.jsonl`);
    writeLines(file, [codexMeta(T, T), codexTurnContext("turn1", "gpt-5"), codexTokenCount(tok(100, 0, 10), tok(100, 0, 10))]);
    tailFile(ctx, file, "codex");
    assert.equal(rows(ctx).length, 1);
    appendLines(file, [codexTur("resp_1", T, T, "turn1", tok(100, 0, 10)), codexTokenCount(tok(100, 0, 10), tok(100, 0, 10))]);
    tailFile(ctx, file, "codex");
    const r = rows(ctx);
    assert.equal(r.length, 1);
    assert.equal(r[0].request_key, requestKey(ctx.secret, "openai", "resp:resp_1"));
  });

  test("subagent and guardian_review threads fold into the parent; auto-review unpriced; model switch", () => {
    const { t, ctx } = sandbox();
    const dir = path.join(t.codexHome, "sessions", "2026", "10", "20");
    const main = path.join(dir, `rollout-a-${T}.jsonl`);
    const sub = path.join(dir, "rollout-b-sub.jsonl");
    const guard = path.join(dir, "rollout-c-guard.jsonl");
    writeLines(main, [
      codexMeta(T, T),
      codexTurnContext("turn1", "gpt-6.1-sol"),
      codexTur("resp_m1", T, T, "turn1", tok(100, 0, 10)),
      codexTurnContext("turn2", "gpt-6-astra", "2026-10-20T10:05:00.000Z"),
      codexTur("resp_m2", T, T, "turn2", tok(100, 0, 10), "2026-10-20T10:05:01.000Z"),
    ]);
    writeLines(sub, [
      codexMeta("sub-thread", T, { parent: T, threadSource: "subagent", source: { subagent: { thread_spawn: { parent_thread_id: T, depth: 1 } } } }),
      codexTurnContext("turn1", "gpt-6-astra"),
      codexTur("resp_s1", "sub-thread", T, "turn1", tok(50, 0, 5)),
    ]);
    writeLines(guard, [
      codexMeta("guard-thread", "guard-thread", { parent: T, threadSource: "guardian_review", source: { subagent: { other: "guardian" } } }),
      codexTurnContext("g1", "codex-auto-review"),
      codexTur("resp_g1", "guard-thread", "guard-thread", "g1", tok(40000, 0, 100)),
    ]);
    for (const f of [main, sub, guard]) tailFile(ctx, f, "codex");
    const r = rows(ctx);
    assert.equal(r.length, 4);
    assert.ok(r.every((x) => x.local_id === localId("codex", T)), "all fold into the root session");
    const m1 = r.find((x) => x.request_key === requestKey(ctx.secret, "openai", "resp:resp_m1"));
    const m2 = r.find((x) => x.request_key === requestKey(ctx.secret, "openai", "resp:resp_m2"));
    assert.equal(m1.model, "gpt-6.1-sol");
    assert.equal(m2.model, "gpt-6-astra");
    const s1 = r.find((x) => x.request_key === requestKey(ctx.secret, "openai", "resp:resp_s1"));
    assert.equal(s1.query_source, "subagent");
    const g = r.find((x) => x.request_key === requestKey(ctx.secret, "openai", "resp:resp_g1"));
    assert.equal(g.query_source, "auxiliary");
    assert.equal(g.unpriced, "auto_review_unpriced");
    assert.equal(g.est_list_usd_micros, null);
  });

  test("OpenAI input above 272K stays unpriced", () => {
    const r = priceRequest("gpt-6.1-sol", { input: 200_000, output: 10, cache_read: 100_000, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: 0 }, 300_000);
    assert.equal(r.unpriced, "long_context_unmodeled");
  });
});

describe("keys, prices, epochs", () => {
  test("keys are 43-char base64url HMACs and differ by workspace", () => {
    const secret = Buffer.alloc(32, 7);
    const a = sessionKey(secret, "ws_a", "claude-code", SID);
    const b = sessionKey(secret, "ws_b", "claude-code", SID);
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
    assert.match(repoKey(secret, "ws_a", "/x/y"), /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(repoKey(secret, "ws_a", "/x/y"), repoKey(secret, "ws_b", "/x/y"));
    // Golden: HMAC-SHA256(key=0x07*32, "ws_a\0claude-code\0<SID>")
    assert.equal(a, "DLuGzsKG0-RFWPJX-YsKBpP-X4DLKo5Zh8Rilj6dOC0");
    assert.equal(repoKey(secret, "ws_a", "/x/y"), "Tfycc8b-HlBLqP_8e6nSSNRjxfJgLYCAaslBV6I3GxE");
  });

  test("integer picodollar math rounds half up once", () => {
    assert.equal(picoToMicros(499_999n), 0);
    assert.equal(picoToMicros(500_000n), 1);
    // haiku 4.5 at $1/MTok: 1 token = 1e6 pico = 1 micro
    assert.equal(priceRequest("claude-haiku-4-5", { input: 1, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: 0 }).est_list_usd_micros, 1);
    // gpt-6-luna cache read $0.01/MTok: 49 tokens = 490,000 pico -> 0 micro; 50 -> 1
    const luna = (n: number) => priceRequest("gpt-6-luna", { input: 0, output: 0, cache_read: n, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: 0 }).est_list_usd_micros;
    assert.equal(luna(49), 0);
    assert.equal(luna(50), 1);
    assert.equal(priceRequest("codex-auto-review", { input: 1, output: 1, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: 0 }).unpriced, "auto_review_unpriced");
  });

  test("epoch assignment by root turn, with timestamp fallback", () => {
    const { ctx } = sandbox();
    const lid = ensureSession(ctx.db, "claude-code", SID, { ts: "2026-10-22T09:00:00.000Z" });
    const ins = (id: string, starts: string, root: string | null) =>
      ctx.db.prepare("INSERT INTO epochs(epoch_id, local_id, workspace_id, goal_id, starts_at, root_turn, cause, created_at) VALUES(?,?,?,?,?,?,?,?)").run(id, lid, "ws", id, starts, root, "manual", starts);
    ins("ep_1", "2026-10-22T09:00:00.000Z", null);
    recordRootTurn(ctx.db, "claude-code", SID, "p1", "2026-10-22T10:00:00.000Z");
    recordRootTurn(ctx.db, "claude-code", SID, "p2", "2026-10-22T11:00:00.000Z", null, true);
    ins("ep_2", "2026-10-22T11:00:00.000Z", "p2");
    // A late request of root turn p1 that lands after ep_2 started still belongs to ep_1.
    assert.equal(epochFor(ctx.db, lid, "p1", "2026-10-22T11:30:00.000Z")?.epoch_id, "ep_1");
    assert.equal(epochFor(ctx.db, lid, "p2", "2026-10-22T11:00:05.000Z")?.epoch_id, "ep_2");
    // Subagent request carrying p2 inherits ep_2 even with an early-looking timestamp.
    assert.equal(epochFor(ctx.db, lid, "p2", "2026-10-22T10:59:00.000Z")?.epoch_id, "ep_2");
    // Unknown root turn: timestamp fallback.
    assert.equal(epochFor(ctx.db, lid, null, "2026-10-22T10:30:00.000Z")?.epoch_id, "ep_1");
    assert.equal(epochFor(ctx.db, lid, "p-unknown", "2026-10-22T12:00:00.000Z")?.epoch_id, "ep_2");
    assert.equal(epochFor(ctx.db, lid, null, "2026-10-22T08:00:00.000Z"), null, "before the first epoch: private");
  });
});
