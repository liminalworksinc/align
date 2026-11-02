// Regressions for the cycle-7 agent-side E2E report: a folder rule's share told to the model before it took effect, then
// shared again toward the same goal (C7-1); the sign-out notice after signing in again (C7-2); `::align share --dir` on
// a device with several workspaces (C7-3); the access token's expiry once a clock skew is fixed (C7-4); a refusal that
// names `device_signed_out` (C7-5); and the "works, but would confuse a developer" items of its section 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials, saveCredentials } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, waitFor, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };

async function world(opts: { side?: boolean } = {}) {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  if (opts.side) {
    fake.workspaces = [...fake.workspaces, SIDE];
    fake.goals.set("ws_side", [fake.goal("g_side", "Side quest tooling", 1, true)]);
  }
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
const newSid = () => `${String(++n).padStart(8, "e")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const keyOf = (t: TestEnv, sid: string, ws = "ws_acme") => {
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, ws, "claude-code", sid);
  ctx.db.close();
  return key;
};

/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = newSid();
  const cwd = path.join(t.root, `repo-${n}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", localId("claude-code", sid).slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

/** One finished turn in the session's transcript, made `lagMs` after now. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 0): void {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const start = (t: TestEnv, sid: string, source: string, cwd: string) => json(runHook(t, "claude", "SessionStart", { session_id: sid, source, cwd }).stdout);
const deny = (t: TestEnv, s: { sid: string; cwd: string }) =>
  json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C7" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sync = async (t: TestEnv) => assert.equal((await runCli(t, ["sync"])).code, 0);
const hot = (t: TestEnv, lid: string) => readJson<HotState>(layout.hot(t.home, lid))!;
const relogin = async (t: TestEnv) => {
  assert.equal((await runCli(t, ["logout"])).code, 0);
  const l = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(l.code, 0, l.stderr);
};

/** A session started in a folder a rule shares toward "Ship the v2": its envelope at SessionStart, its prompts before the
 *  sync that applies the rule (as `claude -p`'s are). */
async function ruleSession(t: TestEnv, dir: string) {
  const sid = newSid();
  const s0 = start(t, sid, "startup", dir);
  assert.match(s0.hookSpecificOutput.additionalContext, /Ship the v2 onboarding flow/, "the envelope at its start");
  assert.equal(prompt(t, sid, "Reply with just OK.", dir), null, "its prompt runs before any sync");
  await sync(t);
  return { sid, cwd: dir, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

describe("C7-1: shared again toward the goal already in context, after a folder rule's share that took effect after the session's prompts", () => {
  test("signed out and in, `::align share confirm`: the next prompt carries the bound delta once; a resume after it gets the envelope", async () => {
    const { t } = await world();
    const dir = path.join(t.root, "rule-repo");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const A = await ruleSession(t, dir);
    assert.equal(hot(t, A.lid).share?.state, "shared");
    assert.equal(prompt(t, A.sid, "go on", dir)?.hookSpecificOutput?.additionalContext, undefined, "the share it was told about: nothing new");
    await relogin(t);
    assert.match(prompt(t, A.sid, "::align share confirm", dir).reason, /sharing requested toward "Ship the v2 onboarding flow"/);
    await sync(t);
    const told = prompt(t, A.sid, "go on", dir);
    assert.match(told?.hookSpecificOutput?.additionalContext ?? "", /^\[Align\] From this turn this session counts toward goal "Ship the v2 onboarding flow" \(v1, active\)\./);
    assert.equal(prompt(t, A.sid, "go on", dir)?.hookSpecificOutput?.additionalContext, undefined, "once");

    // Another rule session, shared again the same way, whose next hook call is a resume: the envelope again.
    const B = await ruleSession(t, dir);
    await relogin(t);
    assert.match(prompt(t, B.sid, "::align share confirm", dir).reason, /sharing requested/);
    await sync(t);
    assert.match(start(t, B.sid, "resume", dir)?.hookSpecificOutput?.additionalContext ?? "", /Ship the v2 onboarding flow/, "a resume gets the envelope again");
    assert.equal(prompt(t, B.sid, "go on", dir)?.hookSpecificOutput?.additionalContext, undefined, "and the prompt after it nothing");
  });
});
