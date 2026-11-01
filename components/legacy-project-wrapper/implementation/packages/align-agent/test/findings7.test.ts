// Regressions for the cycle-6 agent-side E2E report: a session whose shared history was deleted, shared again from its
// start (C6-1); a stopped session whose lost workspace came back, told "only `align stop-sharing`" by its deny (C6-2); a
// removal the device never saw, worded as a permanent stop (C6-3); and the "works, but would confuse a developer" items
// of its section 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { layout, localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);

async function world() {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = `${String(++n).padStart(8, "c")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
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

/** One finished turn in the session's transcript, made `lagMs` after now. Returns the request's time. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 0): string {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
  return new Date(at + 50).toISOString();
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sync = async (t: TestEnv) => assert.equal((await runCli(t, ["sync"])).code, 0);
/** The server's usage rows of one session. */
const serverRows = (fake: FakeServer, key: string) => [...fake.usage.values()].filter((u) => u.session_key === key);
/** The server's epochs of one session. */
const serverEpochs = (fake: FakeServer, key: string) => [...fake.epochs.values()].filter((e) => e.session_key === key);

describe("C6-1: a session whose shared history was deleted is shared again from now, never from its start", () => {
  test("shared, signed out for a turn, shared again, its history deleted (204), then `align share --yes`: the preview counts from now and nothing made before the re-share goes up", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_d1_shared");
    await sync(t);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    await sleep(20);
    turn(t, A, "req_d1_signed_out");
    await sleep(20);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    prompt(t, A.sid, "::align share confirm", A.cwd);
    await sync(t);
    const lastBefore = turn(t, A, "req_d1_shared_again");
    await sync(t);
    assert.equal(serverRows(fake, A.key).length, 2, "the turn made while signed out did not go up");

    const del = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.equal(serverRows(fake, A.key).length, 0);
    await sleep(20);
    const r = await runCli(t, ["share", A.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Counting: {3}from now \(/);
    assert.match(r.stdout, /This session was shared before, so this share counts from now\./);
    assert.match(r.stdout, / 0 finalized request rows now/);
    await sync(t);
    assert.equal(serverRows(fake, A.key).length, 0, "no row made before the re-share goes up");
    const after = turn(t, A, "req_d1_after", 50);
    await sleep(80);
    await sync(t);
    const rows = serverRows(fake, A.key);
    assert.equal(rows.length, 1, "only the turn after the re-share");
    const epochs = serverEpochs(fake, A.key);
    assert.equal(epochs.length, 1);
    assert.ok(epochs[0].starts_at > lastBefore && epochs[0].starts_at <= after, "the new epoch starts at the re-share");
    const ctx = ctxFor(t);
    const local = ctx.db.prepare("SELECT request_key, ts, uploaded, epoch_id FROM requests WHERE local_id=? ORDER BY ts").all(A.lid) as { ts: string; uploaded: number; epoch_id: string | null }[];
    ctx.db.close();
    assert.deepEqual(
      local.map((x) => x.uploaded),
      [0, 0, 0, 1],
      "only the turn after the re-share went up again",
    );
    assert.ok(local.filter((x) => x.ts < epochs[0].starts_at).every((x) => x.epoch_id === null), "rows dated before the re-share have no epoch");
  });

  test("stopped, then its history deleted on the web (410): a folder rule turned on in it leaves it private, `::align share` previews \"counts from now\", and `--past` names a deletion on the web", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_d2_shared");
    await sync(t);
    assert.equal((await runCli(t, ["stop-sharing", A.lid.slice(0, 8)])).code, 0);
    fake.deleteOnWeb(A.key);
    const del = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.match(del.stdout, /already deleted on the server/);

    const dir = prompt(t, A.sid, "::align share --dir confirm", A.cwd);
    assert.match(dir.reason, /This session stays private: its sharing was stopped \(or its history deleted\)\./);
    await sync(t);
    assert.ok(!fake.sessions.has(A.key), "the folder rule did not share the stopped session again");

    const preview = prompt(t, A.sid, "::align share", A.cwd);
    assert.match(preview.reason, /counts from now\./);

    const past = await runCli(t, ["share", "--dir", A.cwd, "--past", "3", "--workspace", "Acme", "--goal", "Ship the v2"]);
    assert.equal(past.code, 0, past.stderr);
    assert.match(past.stdout, /Skipped 1 whose shared history was deleted \(on the web or with `align delete-history`\); `align share <session>` shares one again, counting from now, if you want\./);
  });
});

describe("C6-2: a stopped session whose share ended says the same thing everywhere, from what is true now", () => {
  const PLAIN = "Align: this session was stopped from its Align workspace. Tools are blocked until it is resumed there. Tell the user and wait for instructions.";
  const deny = (t: TestEnv, s: { sid: string; cwd: string }) =>
    json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo G2CHECK" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string;

  test("stopped from the web, its workspace lost and given back: the deny, `align latch status`, `::align status` and `align status` offer `::align share` as its notice does; lost again, `align stop-sharing`; shared again, the plain stop", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const acme = fake.workspaces[0];
    fake.workspaces = [];
    await sync(t);
    assert.match(deny(t, A), /no longer has access to its Align workspace\), so this can no longer be lifted from the web: tools stay blocked until the user runs `align stop-sharing /);

    fake.workspaces = [acme];
    await sync(t);
    const start = json(runHook(t, "claude", "SessionStart", { session_id: A.sid, source: "resume", cwd: A.cwd }).stdout);
    assert.match(start.systemMessage, /can reach Acme in Align again\. To share this session there again, type `::align share` here \(it counts toward "Ship the v2 onboarding flow" again\)\. It was stopped or held from the web: once it is shared again, that can be lifted there; until then its tools stay blocked\./);
    const d = deny(t, A);
    assert.equal(
      d,
      "Align: this session was stopped from its Align workspace. Its sharing ended (this machine lost access to its Align workspace, and can reach it again now), so the user can share it there again by typing `::align share` in this session; once it is shared again, this can be lifted from the web. Until then tools stay blocked. Tell the user and wait for instructions.",
    );
    const latch = (await runCli(t, ["latch", "status"])).stdout;
    assert.match(latch, /sharing ended \(this machine lost access to its Align workspace, and can reach it again now\): `::align share` in the session shares it there again, after which it can be resumed or released from the web/);
    assert.doesNotMatch(latch, /only `align stop-sharing/);
    assert.match(prompt(t, A.sid, "::align status", A.cwd).reason, /Stop latch: on \(tools blocked; sharing ended: `::align share` here shares it again, after which it can be resumed from the web\)/);
    assert.match((await runCli(t, ["status"])).stdout, /Stop latch: 1 session\(s\) stopped; 1 can be shared again \(`::align share` in the session\), after which the web can lift it; see/);

    fake.workspaces = [];
    await sync(t);
    assert.match(deny(t, A), /no longer has access to its Align workspace\), so this can no longer be lifted from the web/);
    assert.match((await runCli(t, ["latch", "status"])).stdout, /so only `align stop-sharing /);

    fake.workspaces = [acme];
    await sync(t);
    prompt(t, A.sid, "::align share confirm", A.cwd);
    await sync(t);
    assert.equal(deny(t, A), PLAIN, "shared again: the web can resume it");
  });

  test("stopped from the web, then this machine signed out and in again: the deny offers `::align share`, not only `align stop-sharing`", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.match(deny(t, A), /this machine signed out of Align\), so this can no longer be lifted from the web: tools stay blocked until the user runs `align stop-sharing /);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    assert.match(deny(t, A), /Its sharing ended \(this machine signed out of Align, and is signed in again now\), so the user can share it there again by typing `::align share` in this session/);
  });
});

describe("C6-3: a removal the device never saw is not worded as a stop for good", () => {
  test("removed and let back in while this machine did not look: the refused upload ends the share as a lost workspace, the notice and `align sessions` offer `::align share`, and it works", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_r1_shared");
    await sync(t);
    fake.removeAndReAdd(A.key);
    await sleep(20);
    turn(t, A, "req_r1_during");
    await sync(t);
    const told = prompt(t, A.sid, "go on", A.cwd);
    assert.equal(
      told.systemMessage,
      'Align: this session stopped sharing because you were removed from Acme in Align (or left it) while this machine was not in touch; its usage from then on stays on this machine. You are a member again, so to share it there again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).',
    );
    assert.doesNotMatch(told.systemMessage, /sharing_stopped/);
    const row = JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout).find((s: { native_id: string }) => s.native_id === A.sid);
    assert.equal(row.shared, "stopped (Acme; ended while out of the workspace; `::align share` shares it again)");
    assert.match(prompt(t, A.sid, "::align share confirm", A.cwd).reason, /sharing requested/);
    await sync(t);
    assert.equal(fake.sessions.get(A.key)!.state, "shared");
    assert.equal(JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout).find((s: { native_id: string }) => s.native_id === A.sid).shared, "shared (Acme)");
  });

  test("stopped by its person on the web: the refused upload says so, and a folder rule never shares it again", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_r2_shared");
    await sync(t);
    fake.stopOnWeb(A.key);
    turn(t, A, "req_r2_after", 50);
    await sleep(80);
    await sync(t);
    assert.equal(
      prompt(t, A.sid, "go on", A.cwd).systemMessage,
      "Align: this session's sharing was stopped (Stop sharing on the web, or `align stop-sharing` on another of your devices), so it stopped sharing here; its usage stays on this machine from now on.",
    );
    assert.match(prompt(t, A.sid, "::align share --dir confirm", A.cwd).reason, /This session stays private/);
  });
});

describe("cycle 6, section 5: works, but would confuse a developer", () => {
  test("shared again toward the goal already in context: the next prompt tells the model it counts toward it again; a resume gets the envelope again; the prompt after says nothing", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    prompt(t, A.sid, "go on", A.cwd);
    assert.equal(prompt(t, A.sid, "go on", A.cwd), null, "nothing new");
    const acme = fake.workspaces[0];
    fake.workspaces = [];
    await sync(t);
    fake.workspaces = [acme];
    await sync(t);
    prompt(t, A.sid, "go on", A.cwd); // the "can reach ... again" notice
    assert.match(prompt(t, A.sid, "::align share confirm", A.cwd).reason, /sharing requested toward "Ship the v2 onboarding flow"/);
    await sync(t);
    const resumed = json(runHook(t, "claude", "SessionStart", { session_id: A.sid, source: "resume", cwd: A.cwd }).stdout);
    assert.match(resumed?.hookSpecificOutput?.additionalContext ?? "", /Ship the v2 onboarding flow/, "a resume gets the envelope again");
    // And a prompt in a session that was not resumed (shared again after a sign-out): the short bound delta.
    const B = await shared(t);
    await sync(t);
    prompt(t, B.sid, "go on", B.cwd);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    assert.match(prompt(t, B.sid, "::align share confirm", B.cwd).reason, /sharing requested/);
    await sync(t);
    const told = prompt(t, B.sid, "go on", B.cwd);
    assert.match(told?.hookSpecificOutput?.additionalContext ?? "", /^\[Align\] From this turn this session counts toward goal "Ship the v2 onboarding flow" \(v1, active\)\./);
    assert.equal(prompt(t, B.sid, "go on", B.cwd)?.hookSpecificOutput?.additionalContext, undefined, "once");
  });

  test("held goal, fail closed: a folder session bound to a goal the cached feed says is held is denied at its first tool call, before any sync; a release that reached it wins over a stale feed; an unshared session is not held", async () => {
    const { fake, t } = await world();
    const g = fake.goals.get("ws_acme")!.find((x) => x.id === "g_ship")!;
    g.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    const dir = path.join(t.root, "held-repo");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const sid = "abcdabcd-1111-2222-3333-444444444444";
    const start = json(runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd: dir }).stdout);
    assert.match(start.hookSpecificOutput.additionalContext, /Ship the v2 onboarding flow/);
    const use = (tool: string) => json(runHook(t, "claude", "PreToolUse", { session_id: sid, tool_name: tool, tool_input: { command: "ls", file_path: path.join(dir, "a") }, cwd: dir }).stdout);
    for (const tool of ["Bash", "Read"]) {
      const d = use(tool);
      assert.equal(d?.hookSpecificOutput?.permissionDecision, "deny", `${tool} before any sync`);
      assert.equal(d.hookSpecificOutput.permissionDecisionReason, 'Align: all agents on goal "Ship the v2 onboarding flow" were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved.');
    }
    // The sync shares it; the server's hold and release reach it; the feed still says held (stale): the release wins.
    await sync(t);
    const ctx = ctxFor(t);
    const key = sessionKey(ctx.secret, "ws_acme", "claude-code", sid);
    ctx.db.close();
    assert.equal(use("Bash")?.hookSpecificOutput?.permissionDecision, "deny", "shared and still not told: the feed holds it");
    fake.holdGoal("ws_acme", "g_ship", [key]);
    await sync(t);
    assert.equal(use("Bash")?.hookSpecificOutput?.permissionDecision, "deny");
    fake.releaseGoal("ws_acme", "g_ship", [key]);
    await sync(t);
    assert.equal(use("Bash"), null, "released: tools run although the cached feed still says held");
    // A session in another folder, not shared, toward nothing: not held.
    const other = path.join(t.root, "free-repo");
    fs.mkdirSync(other, { recursive: true });
    runHook(t, "claude", "SessionStart", { session_id: "efefefef-1111-2222-3333-444444444444", source: "startup", cwd: other });
    assert.equal(json(runHook(t, "claude", "PreToolUse", { session_id: "efefefef-1111-2222-3333-444444444444", tool_name: "Bash", tool_input: { command: "ls" }, cwd: other }).stdout), null);
  });
});
