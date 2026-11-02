// Regressions for the cycle-8 agent-side E2E report: a session told "signed in to Align again" (or that its workspace is
// back) is told the notice for the new state at the next sign-out or loss (C8-1); and the "works, but would confuse a
// developer" items of its section 5: a share stopped on the web is heard at the next directives poll, a session whose
// own workspace is out of reach is never shared into another one, `align login`'s line order, the release and resume
// context lines only for a session that saw the block, and `align goals` marking a held goal as held.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId, spoolWrite } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

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
const newSid = () => `${String(++n).padStart(8, "f")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
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

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const start = (t: TestEnv, sid: string, source: string, cwd: string) => json(runHook(t, "claude", "SessionStart", { session_id: sid, source, cwd }).stdout);
const deny = (t: TestEnv, s: { sid: string; cwd: string }) =>
  json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C8" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string | undefined;
const sync = async (t: TestEnv) => {
  const r = await runCli(t, ["sync"]);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
};
const hot = (t: TestEnv, lid: string) => readJson<HotState>(layout.hot(t.home, lid))!;
const login = async (t: TestEnv) => {
  const l = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(l.code, 0, l.stderr);
  return l;
};
const logout = async (t: TestEnv) => assert.equal((await runCli(t, ["logout"])).code, 0);

const GOAL = "Ship the v2 onboarding flow";
const AGAIN = `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here (it counts toward "${GOAL}" again).`;
const LATCHED_AGAIN = " It was stopped or held from the web, so tools stay blocked until it is shared again (you can type `::align share` in this session), after which the stop or hold can be lifted from the web.";
const SIGNED_OUT = `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here (it counts toward "${GOAL}" again).`;
const stopSharingTail = (lid: string) => ` It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
/** Signed out: sharing it again after `align login`, which the notice has just said, or `align stop-sharing` (cycle 12). */
const signedOutTail = (lid: string) => ` It was stopped or held from the web, so tools stay blocked until it is shared again that way, after which the stop or hold can be lifted from the web, or until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;

describe("C8-1: every change of whether a session can be shared again tells it the notice for the new state, whatever it has seen", () => {
  test("told \"signed in to Align again\", then signed out again: the next prompt tells the sign-out notice again, as the deny says; signed in once more, the signed-in-again notice again", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    await logout(t);
    await login(t);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, AGAIN + LATCHED_AGAIN, "seen: signed in again");
    assert.equal(start(t, B.sid, "resume", B.cwd)?.systemMessage, AGAIN, "seen by a session that was not stopped");

    await logout(t);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, SIGNED_OUT + signedOutTail(A.lid));
    assert.match(deny(t, A) ?? "", new RegExp(`tools stay blocked until the user runs \`align stop-sharing ${A.lid.slice(0, 8)}\` in a terminal, or until it is shared again once this machine is signed in`));
    assert.equal(prompt(t, B.sid, "go on", B.cwd)?.systemMessage, SIGNED_OUT, "not stopped: the sign-out notice too");
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined, "once");
    // Every sync pass while signed out ends the shares again (nothing is live): no new notice.
    await runCli(t, ["sync"]);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined, "a pass while signed out tells nothing more");

    await login(t);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, AGAIN + LATCHED_AGAIN, "signed in again: told again");
  });

  test("told its lost workspace is back, then the workspace is lost again or the machine signs out: each time it is told it can't be shared there now, as its deny says", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const acme = fake.workspaces[0];
    fake.workspaces = [];
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /you no longer have access to Acme/);
    fake.workspaces = [acme];
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /^Align: this machine can reach Acme in Align again\. To share this session there again, type `::align share` here/);

    fake.workspaces = [];
    await sync(t);
    assert.equal(
      prompt(t, A.sid, "go on", A.cwd)?.systemMessage,
      `Align: this machine can no longer reach Acme in Align (you were removed from it or left it again), so this session can't be shared there again from here; its usage stays on this machine.${stopSharingTail(A.lid)}`,
    );
    assert.match(deny(t, A) ?? "", /no longer has access to its Align workspace\), so this can no longer be lifted from the web/);

    fake.workspaces = [acme];
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /^Align: this machine can reach Acme in Align again\./, "back again: told again");
    await logout(t);
    assert.equal(
      prompt(t, A.sid, "go on", A.cwd)?.systemMessage,
      `Align: this machine signed out of Align, so this session can't be shared again from here for now; its usage stays on this machine. To share it again, run \`align login\` in a terminal, then type \`::align share\` here (it counts toward "${GOAL}" again).${signedOutTail(A.lid)}`,
    );
    await login(t);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, AGAIN + LATCHED_AGAIN, "signed in again, reaching Acme: told so");
  });
});

describe("cycle 8, section 5: works, but would confuse a developer", () => {
  test("Stop sharing on the web is heard at the next sync's directives answer, before any usage upload: the session is told, `::align share` says it stays stopped (never `already shared`), and a folder rule leaves it private", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.stopOnWeb(A.key);
    await sync(t);
    assert.equal(hot(t, A.lid).share?.state, "stopped");
    assert.equal(
      prompt(t, A.sid, "go on", A.cwd)?.systemMessage,
      "Align: this session's sharing was stopped (Stop sharing on the web), so it stopped sharing here; its usage stays on this machine from now on.",
    );
    const again = prompt(t, A.sid, "::align share", A.cwd).reason as string;
    assert.doesNotMatch(again, /already shared/);
    assert.match(again, /a session whose sharing was stopped is not shared again, so it stays stopped/);
    assert.match(prompt(t, A.sid, "::align share --dir confirm", A.cwd).reason, /This session stays private: its sharing was stopped/);
    const sessions = await runCli(t, ["sessions"]);
    assert.doesNotMatch(sessions.stdout.split("\n").find((l) => l.startsWith(A.lid.slice(0, 8))) ?? "", /\bshared\b(?! before)/);

    // A share made again after the server's end (here: its person removed and back, then shared again) is a newer share
    // and stays, even while the answer still lists the old end.
    const B = await shared(t);
    await sync(t);
    fake.removeAndReAdd(B.key);
    await sync(t);
    assert.match(prompt(t, B.sid, "go on", B.cwd)?.systemMessage ?? "", /you were removed from Acme in Align \(or left it\) while this machine was not in touch/);
    assert.match(prompt(t, B.sid, "::align share confirm", B.cwd).reason, /sharing requested/);
    await sync(t);
    await sync(t);
    assert.equal(hot(t, B.lid).share?.state, "shared", "the new share stays shared");
  });

  test("a session whose own workspace is out of reach is never shared into another one: `::align share` (preview and confirm), a spooled share and the terminal refuse with the can't-be-shared-there-again words; back in reach, it is shared there", async () => {
    const { fake, t } = await world({ side: true });
    const A = await shared(t);
    const acme = fake.workspaces[0];
    fake.workspaces = [SIDE];
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /you no longer have access to Acme/);
    const WORDS =
      "Align: this session was shared with Acme, and this machine can't reach Acme in Align now, so this session can't be shared there again from here, and it is never shared into another workspace instead; its usage stays on this machine.";
    assert.equal(prompt(t, A.sid, "::align share", A.cwd).reason, WORDS);
    assert.equal(prompt(t, A.sid, "::align share confirm", A.cwd).reason, WORDS);
    assert.equal(prompt(t, A.sid, "::align share Side confirm", A.cwd).reason, WORDS);
    // A share spooled with no workspace (an older hook's): the sync shares it nowhere else either.
    spoolWrite(t.home, { type: "command", harness: "claude-code", native_id: A.sid, cwd: A.cwd, command: "share", arg: null, ts: new Date().toISOString() });
    await sync(t);
    assert.equal(hot(t, A.lid).share?.workspace_id, "ws_acme");
    assert.equal(hot(t, A.lid).share?.state, "stopped");
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, `Align: share failed: ${WORDS.replace(/^Align: /, "")}`);
    assert.ok(![...fake.sessions.values()].some((s) => s.ws === "ws_side"), "nothing went to Side Co");
    const lid8 = A.lid.slice(0, 8);
    const plain = await runCli(t, ["share", lid8, "--goal", "none", "--yes"]);
    assert.equal(plain.code, 1);
    assert.equal(plain.stderr.trim(), `align: session ${lid8} was not shared: ${WORDS.replace(/^Align: /, "")}`);
    const side = await runCli(t, ["share", lid8, "--workspace", "Side Co", "--goal", "none", "--yes"]);
    assert.equal(side.code, 1);
    assert.doesNotMatch(side.stdout, /Share preview/);

    fake.workspaces = [acme, SIDE];
    await sync(t);
    const moved = await runCli(t, ["share", lid8, "--workspace", "Side Co", "--goal", "none", "--yes"]);
    assert.equal(moved.code, 1);
    assert.equal(moved.stderr.trim(), `align: session ${lid8} was not shared: this session was shared with Acme, so it is shared again only there (its work is that workspace's), never into Side Co.`);
    assert.match(prompt(t, A.sid, "::align share confirm", A.cwd).reason, /sharing requested toward "Ship the v2 onboarding flow"/);
    await sync(t);
    assert.equal(hot(t, A.lid).share?.state, "shared");
    assert.equal(hot(t, A.lid).share?.workspace_id, "ws_acme");
  });

  test("`align login` that ends live shares says so after \"Signed in as ...\" and its workspace lines", async () => {
    const { t } = await world();
    await shared(t);
    const l = await login(t);
    const lines = l.stdout.split("\n");
    const signedIn = lines.findIndex((x) => x.startsWith("Signed in as "));
    const ended = lines.findIndex((x) => /^1 session\(s\) shared from this machine's earlier sign-in stopped sharing/.test(x));
    const ws = lines.findIndex((x) => x.startsWith("  workspace Acme"));
    assert.ok(signedIn >= 0 && ended > signedIn && ended > ws, l.stdout);
  });

  test("a hold or stop released before the model saw it block a tool is told to the user only; one it saw is told to the model too", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    await sync(t);
    for (const s of [A, B]) prompt(t, s.sid, "go on", s.cwd);
    const goal = fake.goals.get("ws_acme")!.find((g) => g.title === GOAL)!;
    const ref = { id: goal.id, title: goal.title, version: goal.version };
    fake.pushDirective({ ws: "ws_acme", kind: "hold", session_keys: [A.key, B.key], goal: null, binding: null, hold: { goal: ref, held_by: { id: "u_dana", name: "Dana Lee" }, reason: null, at: new Date().toISOString() } });
    await sync(t);
    assert.equal(json(runHook(t, "claude", "PreToolUse", { session_id: B.sid, tool_name: "Bash", cwd: B.cwd }).stdout)?.hookSpecificOutput?.permissionDecision, "deny");
    fake.pushDirective({ ws: "ws_acme", kind: "release", session_keys: [A.key, B.key], goal: null, binding: null, hold: { goal: ref, released_by: { id: "u_dana", name: "Dana Lee" }, at: new Date().toISOString() } });
    await sync(t);
    const a = prompt(t, A.sid, "go on", A.cwd);
    assert.match(a?.systemMessage ?? "", /Dana Lee released the hold on "Ship the v2 onboarding flow"/, "the user hears it");
    assert.doesNotMatch(a?.hookSpecificOutput?.additionalContext ?? "", /released the hold/, "the model never saw the hold");
    const b = prompt(t, B.sid, "go on", B.cwd);
    assert.equal(b?.hookSpecificOutput?.additionalContext, `[Align] Dana Lee released the hold on goal "${GOAL}", so it no longer blocks tools.`, "the model saw it block a tool");

    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const r = prompt(t, A.sid, "go on", A.cwd);
    assert.match(r?.systemMessage ?? "", /this session was resumed from its Align workspace, so its tools work again/);
    assert.doesNotMatch(r?.hookSpecificOutput?.additionalContext ?? "", /was resumed/, "the model never saw the stop");
  });

  test("`align goals` and `::align goals` mark a held goal `h` (on hold), never `*` (bind now), and say what it means", async () => {
    const { fake, t } = await world();
    const perf = fake.goals.get("ws_acme")!.find((x) => x.id === "g_perf")!;
    perf.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    const g = await runCli(t, ["goals", "--refresh"]);
    assert.equal(g.code, 0, g.stderr);
    const HELD = "h = on hold: all agents on it were paused from its Align workspace, so a session bound to it has its tools blocked until the hold is released.";
    assert.match(g.stdout, /^ {2}h g_perf\s/m);
    assert.match(g.stdout, /^ {2}\* g_ship\s/m);
    assert.ok(g.stdout.includes(HELD), g.stdout);
    const A = await shared(t);
    const listed = prompt(t, A.sid, "::align goals", A.cwd).reason as string;
    assert.match(listed, /^ {2}h Cut hook latency \(g_perf,/m);
    assert.ok(listed.endsWith(HELD), listed);
  });
});
