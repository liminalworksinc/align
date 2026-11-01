// Follow-ups to the cycle-5 agent-side E2E report: the counts that took rows made while a session was not shared for
// rows that will upload (C5-1's tail), and history already deleted on the web (section 5).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { computeUnsharedDigest } from "../src/allocation.ts";
import { loadCredentials, loadPendingRevokes } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };

async function world(opts: { side?: boolean } = {}) {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  if (opts.side) {
    fake.workspaces = [...fake.workspaces, SIDE];
    fake.goals.set("ws_side", []);
  }
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = `${String(++n).padStart(8, "f")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const cwd = path.join(t.root, `repo-${n}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", localId("claude-code", sid).slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, "ws_acme", "claude-code", sid);
  ctx.db.close();
  return { sid, cwd, key, lid: localId("claude-code", sid) };
}

/** One finished turn (10 input and 5 output tokens) in the session's transcript, made `lagMs` after now. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 500): void {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("C5-1 follow-up: what counts as waiting to upload, and as shared time", () => {
  test("a turn made while the share had ended is not a row waiting to upload after the re-share, and the unshared-time digest counts it as not shared", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_f1_shared");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    await sleep(20);
    turn(t, A, "req_f1_gap", 0);
    await sleep(50);
    fake.workspaces = [ACME];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    prompt(t, A.sid, "::align share confirm", A.cwd);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.usage.size, 1, "only the turn made while shared went up");

    fake.setOffline(true);
    const off = await runCli(t, ["sync"]);
    assert.equal(off.code, 1);
    assert.match(off.stderr, /\. 0 usage rows and \d+ queued calls stay on this machine/, off.stderr);
    assert.match((await runCli(t, ["status"])).stdout, /Server: {5}unreachable since .*; 0 usage rows wait to upload/);

    const ctx = ctxFor(t);
    const d = computeUnsharedDigest(ctx, Date.now(), true)!;
    ctx.db.close();
    assert.equal(d.total_tokens, 30, "both turns are this machine's agent time");
    assert.equal(d.unshared_tokens, 15, "the turn made while the session was not shared is not shared time");
  });
});

describe("cycle 5, section 5: works, but would confuse a developer", () => {
  test("history already deleted on the web: `align delete-history` says so, exits 0, and nothing stays queued or reads as refused", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.deleteOnWeb(A.key);
    const r = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /This session's shared history was already deleted on the server \(on the web, say\); nothing is left there\. Nothing more is queued\./);
    assert.match((await runCli(t, ["status"])).stdout, /Outbox: {5}0 pending/);
    const row = JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout).find((s: { native_id: string }) => s.native_id === A.sid);
    assert.equal(row.shared, "private");
    assert.match(fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8"), /was already deleted on the server/);
  });
});
