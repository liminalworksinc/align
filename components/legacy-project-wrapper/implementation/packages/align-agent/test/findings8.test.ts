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

describe("C7-2: signed out and in again, the session's notice says what holds now, as its deny and the status views do", () => {
  const AGAIN = 'Align: this machine is signed in to Align again. To share this session again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).';
  const LATCHED = " It was stopped or held from the web, so tools stay blocked until it is shared again (you can type `::align share` in this session), after which the stop or hold can be lifted from the web.";

  test("stopped from the web, then `align logout` and `align login`: the next prompt tells the signed-in-again notice, never `align login` or `align stop-sharing`; a session not stopped gets it at its next start", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    await relogin(t);
    const told = prompt(t, A.sid, "go on", A.cwd);
    assert.equal(told?.systemMessage, AGAIN + LATCHED);
    assert.match(deny(t, A) ?? "", /so tools stay blocked until it is shared again \(the user can type `::align share` in this session\)/);
    assert.equal(start(t, B.sid, "resume", B.cwd)?.systemMessage, AGAIN);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined, "once");
    assert.match(prompt(t, A.sid, "::align share confirm", A.cwd).reason, /sharing requested/);
    await sync(t);
    assert.ok(!hot(t, A.lid).notices.some((x) => /signed (in to|out of) Align/.test(x.text)), "shared again: neither notice is left");
  });

  test("signed in again and then out again before the next prompt: the sign-out notice holds; signed in with a pairing that does not reach the workspace: it says so, as the deny does", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    await relogin(t);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const out = prompt(t, A.sid, "go on", A.cwd);
    assert.match(out?.systemMessage ?? "", /^Align: this session stopped sharing because this machine signed out of Align; .*run `align login` in a terminal, then type `::align share` here/);
    assert.doesNotMatch(out.systemMessage, /signed in to Align again/);

    const acme = fake.workspaces[0];
    fake.workspaces = [];
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    const lid8 = A.lid.slice(0, 8);
    assert.equal(
      prompt(t, A.sid, "go on", A.cwd)?.systemMessage,
      `Align: this machine is signed in to Align again, but this sign-in does not reach Acme, so this session can't be shared there again from here; its usage stays on this machine. It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${lid8}\` in a terminal.`,
    );
    assert.match(deny(t, A) ?? "", /tools stay blocked until the user runs `align stop-sharing /);
    fake.workspaces = [acme];
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", new RegExp(`^${AGAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${LATCHED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "it can reach the workspace again: told once more");
  });
});

describe("C7-3: `::align share --dir` on a device with several workspaces and no default", () => {
  test("preview and confirm both get the multi-workspace answer with the terminal command for the folder, never \"no cached workspace\"", async () => {
    const { t } = await world({ side: true });
    const sid = newSid();
    const cwd = path.join(t.root, "two-ws-repo");
    fs.mkdirSync(cwd, { recursive: true });
    start(t, sid, "startup", cwd);
    const want = `Align: this machine reaches more than one workspace and none is the default, so \`::align share --dir\` can't tell which. Run \`align share --dir ${cwd} --workspace <name> --goal <goal|none>\` in a terminal.`;
    assert.equal(prompt(t, sid, "::align share --dir", cwd).reason, want);
    assert.equal(prompt(t, sid, "::align share --dir confirm", cwd).reason, want);
    assert.equal((await runCli(t, ["rules"])).stdout.trim(), "No folder rules. Every session is private until you share it.");
  });
});

describe("C7-4: the access token's expiry once a clock skew is fixed", () => {
  test("a token refreshed while this computer's clock ran 10 minutes ahead: once a call finds the clocks agree and clears the offset, `align doctor` gives the server's expiry, not 10 minutes later", async () => {
    const { t } = await world();
    const c = loadCredentials(t.home)!;
    const server = Date.parse(c.access_expires_at!); // the clocks agree: this is the server's expiry
    // As a refresh under the skew left it: the expiry read on the skewed clock, with the offset the server's answer gave.
    saveCredentials(t.home, { ...c, clock_offset_ms: -600_000, access_expires_at: new Date(server + 600_000).toISOString() });
    const skewed = await runCli(t, ["doctor"]);
    assert.match(skewed.stdout, new RegExp(`access token expires ${new Date(server).toISOString().replace(/\./g, "\\.")} \\(on the server's clock\\)`));
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    assert.equal(loadCredentials(t.home)!.clock_offset_ms, undefined, "the offset is cleared");
    const fixed = await runCli(t, ["doctor"]);
    assert.match(fixed.stdout, new RegExp(`access token expires ${new Date(server).toISOString().replace(/\./g, "\\.")}\\n`));
  });
});

describe("C7-5: a usage refusal that names `device_signed_out`", () => {
  test("worded as a sign-out the server ended, with `::align share` to share it again, and `align sessions` says it ended at a sign-out; never the older-server words", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_c75_shared");
    await sync(t);
    const s = fake.sessions.get(A.key)!;
    s.state = "stopped";
    s.ended = "device_signed_out";
    turn(t, A, "req_c75_after", 50);
    await sleep(80);
    await sync(t);
    const told = prompt(t, A.sid, "go on", A.cwd);
    assert.equal(
      told?.systemMessage,
      'Align: this session stopped sharing because the Align server ended its share when this machine signed out of Align (an earlier sign-in); its usage stays on this machine from now on. This machine is signed in now, so to share it again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).',
    );
    assert.doesNotMatch(told.systemMessage, /left its workspace|sharing_stopped/);
    const row = JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout).find((x: { native_id: string }) => x.native_id === A.sid);
    assert.equal(row.shared, "stopped (Acme; ended at a sign-out; `::align share` shares it again)");
  });
});

describe("cycle 7, section 5: works, but would confuse a developer", () => {
  test("`::align share` in a session its person stopped (history kept): preview and confirm say it stays stopped and point to deleting its history, spool nothing; after `align delete-history` it previews counts from now", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    assert.equal((await runCli(t, ["stop-sharing", A.lid.slice(0, 8)])).code, 0);
    const want = `Align: this session's sharing was stopped (\`::align unshare\`, \`align stop-sharing\` or Stop sharing on the web), and a session whose sharing was stopped is not shared again, so it stays stopped. To share it again, counting from now, first delete its shared history (it leaves every total): run \`align delete-history ${A.lid.slice(0, 8)}\` in a terminal, or use Delete shared history on the web's Sessions page; then type \`::align share\` here.`;
    assert.equal(prompt(t, A.sid, "::align share", A.cwd).reason, want);
    assert.equal(prompt(t, A.sid, "::align share confirm", A.cwd).reason, want);
    const puts = fake.log.filter((l) => l.method === "PUT").length;
    await sync(t);
    assert.equal(fake.log.filter((l) => l.method === "PUT").length, puts, "nothing was asked of the server");
    assert.equal((await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"])).code, 0);
    assert.match(prompt(t, A.sid, "::align share", A.cwd).reason, /counts from now\./);
  });

  test("terminal `align share` in a session its person stopped (history kept): no preview of a share and nothing sent, the same answer as `::align share`, exit 1", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    assert.equal((await runCli(t, ["stop-sharing", A.lid.slice(0, 8)])).code, 0);
    await sync(t);
    const puts = fake.log.filter((l) => l.method === "PUT").length;
    const r = await runCli(t, ["share", A.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2"]);
    assert.equal(r.code, 1);
    assert.equal(
      r.stderr.trim(),
      `align: session ${A.lid.slice(0, 8)} was not shared: this session's sharing was stopped (\`::align unshare\`, \`align stop-sharing\` or Stop sharing on the web), and a session whose sharing was stopped is not shared again, so it stays stopped. To share it again, counting from now, first delete its shared history (it leaves every total): run \`align delete-history ${A.lid.slice(0, 8)}\` in a terminal, or use Delete shared history on the web's Sessions page; then run \`align share\` again.`,
    );
    assert.doesNotMatch(r.stdout, /Share preview|counts from now|Counting/);
    assert.equal(fake.log.filter((l) => l.method === "PUT").length, puts, "nothing was sent");
  });

  test("`align stop-sharing` that freed a session whose lost workspace ended its share does not make it stopped for good: back in the workspace, `::align share` previews counts from now and `align share` shares it again", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    const acme = fake.workspaces[0];
    fake.workspaces = [];
    await sync(t);
    assert.equal((await runCli(t, ["stop-sharing", A.lid.slice(0, 8)])).code, 0);
    fake.workspaces = [acme];
    await sync(t);
    assert.match(prompt(t, A.sid, "::align share", A.cwd).reason, /counts from now\./);
    // From the terminal too (its `confirm` is the same request; one of them is enough).
    const r = await runCli(t, ["share", A.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Counting: {3}from now/);
    assert.equal(fake.sessions.get(A.key)?.state, "shared", "the server shares it again");
  });

  test("a sync whose pairing changed: no `Server:` line after `align login` either; a held call that never answers is not reported as an unreachable server, nor marked so in last-sync.json", async () => {
    const { fake, t } = await world();
    await shared(t);
    const race = async (drop: boolean) => {
      let release!: () => void;
      fake.holdCalls = { match: (m, p) => m === "GET" && p === "/api/v2/directives", release: new Promise<void>((r) => (release = r)), left: 1, drop };
      const pass = runCli(t, ["sync"]);
      await waitFor(() => fake.log.filter((l) => l.method === "GET" && l.path === "/api/v2/directives").length > seen, 10_000, "the held directives call");
      assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
      fake.holdCalls = null;
      release();
      return pass;
    };
    let seen = fake.log.filter((l) => l.method === "GET" && l.path === "/api/v2/directives").length;
    const plain = await race(false);
    assert.equal(plain.code, 0, plain.stderr);
    assert.match(plain.stdout, /pairing changed during this sync/);
    assert.doesNotMatch(plain.stdout, /^Server:/m);
    seen = fake.log.filter((l) => l.method === "GET" && l.path === "/api/v2/directives").length;
    const dropped = await race(true);
    assert.equal(dropped.code, 0, dropped.stderr);
    assert.match(dropped.stdout, /pairing changed during this sync/);
    assert.doesNotMatch(dropped.stderr, /could not reach/);
    assert.equal(readJson<{ error?: string }>(layout.lastSync(t.home))?.error, undefined, "not marked unreachable");
    assert.doesNotMatch((await runCli(t, ["status"])).stdout, /unreachable/);
  });

  test("`align logout` with a session stopped from the web says it can be shared again after `align login`, not only `align stop-sharing`", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const out = await runCli(t, ["logout"]);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /2 shared session\(s\) stopped sharing\. Sessions stopped or held from the web stay blocked: after `align login`, `::align share` in such a session shares it again, and then the web can lift the stop or hold\./);
    assert.doesNotMatch(out.stdout, /align stop-sharing/);
  });

  test("`::align bind`, `::align share` and `::align share --dir` toward a goal held in the cached feed say so", async () => {
    const { fake, t } = await world();
    const perf = fake.goals.get("ws_acme")!.find((x) => x.id === "g_perf")!;
    perf.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    await sync(t);
    const HELD = "That goal is on hold (all agents on it were paused from its Align workspace), so this session's tools stay blocked until the hold is released.";
    const A = await shared(t);
    await sync(t);
    assert.equal(prompt(t, A.sid, "::align bind Cut hook", A.cwd).reason, `Align: from your next prompt this session counts toward "Cut hook latency". ${HELD}`);
    assert.equal(prompt(t, A.sid, "::align bind Ship", A.cwd).reason, 'Align: from your next prompt this session counts toward "Ship the v2 onboarding flow".', "a goal not held: as before");
    const sid = newSid();
    const cwd = path.join(t.root, "held-share");
    fs.mkdirSync(cwd, { recursive: true });
    start(t, sid, "startup", cwd);
    assert.match(prompt(t, sid, "::align share Cut hook", cwd).reason, new RegExp(`Goal: Cut hook latency; counts from session start\\. ${HELD.replace(/[.()]/g, "\\$&")}`));
    assert.equal(prompt(t, sid, "::align share Cut hook confirm", cwd).reason, `Align: sharing requested toward "Cut hook latency". It takes effect within a few seconds; your next prompt carries the goal. ${HELD}`);
    const sid2 = newSid();
    const cwd2 = path.join(t.root, "held-dir");
    fs.mkdirSync(cwd2, { recursive: true });
    start(t, sid2, "startup", cwd2);
    assert.match(prompt(t, sid2, "::align share --dir Cut hook confirm", cwd2).reason, new RegExp(HELD.replace(/[.()]/g, "\\$&")));
  });

  test("`align status` while the server is unreachable counts the rows of a share still waiting for the server", async () => {
    const { fake, t } = await world();
    const sid = newSid();
    const cwd = path.join(t.root, "pending-repo");
    fs.mkdirSync(cwd, { recursive: true });
    start(t, sid, "startup", cwd);
    prompt(t, sid, "start", cwd);
    fake.setOffline(true);
    const r = await runCli(t, ["share", localId("claude-code", sid).slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /queued to share/);
    turn(t, { sid, cwd }, "req_pending_1", 50);
    turn(t, { sid, cwd }, "req_pending_2", 100);
    await sleep(150);
    const s = await runCli(t, ["sync"]);
    assert.equal(s.code, 1);
    assert.match(s.stderr, /2 usage rows and \d+ queued calls stay on this machine/);
    assert.match((await runCli(t, ["status"])).stdout, /Server: {5}unreachable since .*; 2 usage rows wait to upload/);
    fake.setOffline(false);
    await sleep(400); // the queued share's backoff
    await sync(t);
    assert.equal([...fake.usage.values()].filter((u) => u.session_key === keyOf(t, sid)).length, 2, "they went up");
  });

  test("`::align share --dir confirm` that replaces the folder's rule says so, as `align share --dir` does", async () => {
    const { t } = await world();
    const dir = path.join(t.root, "rule-replace");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const sid = newSid();
    start(t, sid, "startup", dir);
    const preview = prompt(t, sid, "::align share --dir", dir).reason;
    assert.match(preview, /with no goal, from its start\.\n {2}This replaces the current rule \(Acme, "Ship the v2 onboarding flow"\)\./);
    assert.match(prompt(t, sid, "::align share --dir confirm", dir).reason, new RegExp(`^Align: new sessions in ${dir.replace(/[.]/g, "\\.")} are now shared with Acme\\. This replaces the current rule \\(Acme, "Ship the v2 onboarding flow"\\)\\.`));
    assert.match((await runCli(t, ["rules"])).stdout, /Acme \/ no goal/);
  });

  test("hold denies end with \"Tell the user and wait for instructions.\" as stop denies do", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key], "Security review");
    await sync(t);
    assert.equal(deny(t, A), 'Align: Dana Lee paused all agents on goal "Ship the v2 onboarding flow": "Security review". Work resumes when they release it. Your work so far is saved. Tell the user and wait for instructions.');
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.match(deny(t, A) ?? "", /^Align: Dana Lee paused .* tools stay blocked until the user runs `align stop-sharing [^`]+` in a terminal\. Tell the user and wait for instructions\.$/);
  });
});
