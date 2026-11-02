// Regressions for the cycle-9 agent-side E2E report: a web Stop sharing made before the machine paired again is heard by
// the new pairing (C9-1); every notice about a share that ended gives the deny's advice (C9-2); a hold the model saw in
// the cached feed that is gone before it reached the session is told as lifted (C9-3); and the "works, but would confuse
// a developer" items of its section 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { latchNoticeTail, latchWayOut } from "../src/shared/ended.ts";
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

describe("C9-1: a web Stop sharing before a re-pairing is heard by the new pairing", () => {
  for (const how of ["logout, then login", "a login that replaces the live pairing"]) {
    test(`stopped on the web, then ${how} before any sync: the session is never offered \`::align share\`, and is told it stays stopped`, async () => {
      const { fake, t } = await world();
      const A = await shared(t);
      const B = await shared(t);
      await sync(t);
      fake.stopOnWeb(A.key);
      if (how.startsWith("logout")) await logout(t);
      await login(t);
      const told = prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "";
      assert.doesNotMatch(told, /signed in to Align again|::align share/, told);
      assert.equal(
        told,
        "Align: this session's sharing was stopped (Stop sharing on the web, or `align stop-sharing` on another of your devices) before this machine signed out of Align, so it stays stopped and is not shared again from here; its usage stays on this machine.",
      );
      const rows = json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[];
      assert.equal(rows.find((r) => r.local_id === A.lid)?.shared, "stopped (Acme)");
      assert.match(rows.find((r) => r.local_id === B.lid)?.shared ?? "", /ended at a sign-out; `::align share` shares it again/, "another session still offers it");
      assert.match(prompt(t, A.sid, "::align share confirm", A.cwd).reason, /a session whose sharing was stopped is not shared again, so it stays stopped/);
      // The next pass changes nothing more, and the other session is still told it can be shared again.
      await sync(t);
      assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined);
      assert.equal(prompt(t, B.sid, "go on", B.cwd)?.systemMessage, AGAIN);
    });
  }

  test("stopped from the web (latch), then stopped sharing on the web, then a re-pairing: the notice names `align stop-sharing`, as the deny does", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    fake.stopOnWeb(A.key);
    await logout(t);
    await login(t);
    const told = prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "";
    assert.ok(told.endsWith(stopSharingTail(A.lid)), told);
    assert.match(deny(t, A) ?? "", new RegExp(`until the user runs \`align stop-sharing ${A.lid.slice(0, 8)}\``));
  });
});

describe("C9-2: every notice about a share that ended gives the deny's advice", () => {
  /** Which way out a text gives, as `latchWayOut` words it for its reader: sharing again, `align stop-sharing`, or none. */
  const advice = (text: string, lid: string, reader: "model" | "user") =>
    text.includes(latchWayOut(lid, true, reader)) ? "share again" : text.includes(latchWayOut(lid, false, reader)) ? "stop-sharing" : "none";
  /** The session's newest notice and its deny give the same way out, and the expected one. */
  const same = (t: TestEnv, s: { sid: string; cwd: string; lid: string }, want: "share again" | "stop-sharing", label: string) => {
    const notice = prompt(t, s.sid, "go on", s.cwd)?.systemMessage ?? "";
    const why = deny(t, s) ?? "";
    assert.equal(advice(notice, s.lid, "user"), want, `${label}: notice ${notice}`);
    assert.equal(advice(why, s.lid, "model"), want, `${label}: deny ${why}`);
    assert.ok(notice.endsWith(latchNoticeTail(s.lid, want === "share again")), `${label}: the notice ends with the latch sentence: ${notice}`);
  };
  const stopped = async (fake: FakeServer, t: TestEnv) => {
    const A = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    return A;
  };

  test("stopped from the web, then Stop sharing on the web (heard at the next pass): the notice says tools stay blocked until `align stop-sharing`, as the deny does", async () => {
    const { fake, t } = await world();
    const A = await stopped(fake, t);
    fake.stopOnWeb(A.key);
    await sync(t);
    same(t, A, "stop-sharing", "stopped by its person");
    assert.match(prompt(t, A.sid, "::align status", A.cwd).reason, new RegExp(`run \`align stop-sharing ${A.lid.slice(0, 8)}\``));
  });

  test("ended while its person was out of the workspace, or at a sign-out the server reports: notice and deny both offer `::align share`", async () => {
    const { fake, t } = await world();
    const A = await stopped(fake, t);
    fake.removeAndReAdd(A.key);
    await sync(t);
    same(t, A, "share again", "member removed and back");
    const B = await stopped(fake, t);
    const row = fake.sessions.get(B.key)!;
    Object.assign(row, { state: "stopped", ended: "device_signed_out", stopped_at: new Date().toISOString() });
    await sync(t);
    same(t, B, "share again", "ended at an earlier sign-out");
  });

  test("a sign-out and a sign-in, a lost workspace and its return: each notice gives the deny's advice", async () => {
    const { fake, t } = await world();
    const A = await stopped(fake, t);
    await logout(t);
    same(t, A, "stop-sharing", "signed out");
    await login(t);
    same(t, A, "share again", "signed in again");
    const B = await stopped(fake, t);
    const acme = fake.workspaces[0];
    fake.workspaces = [];
    await sync(t);
    same(t, B, "stop-sharing", "workspace lost");
    fake.workspaces = [acme];
    await sync(t);
    same(t, B, "share again", "workspace back");
  });
});

describe("C9-3: a hold the model saw only in the cached feed, gone before it reached the session, is told as lifted", () => {
  const HELD_DENY = 'Align: all agents on goal "Ship the v2 onboarding flow" were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved. Tell the user and wait for instructions.';
  for (const how of ["its share still pending", "the machine offline"]) {
    test(`folder rule toward a held goal, ${how}: denied from the feed; released before the hold reached it: the next prompt tells the model and the user once, and tools run`, async () => {
      const { fake, t } = await world();
      const g = fake.goals.get("ws_acme")!.find((x) => x.id === "g_ship")!;
      g.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
      const dir = path.join(t.root, `held-${how.split(" ")[1]}`);
      fs.mkdirSync(dir, { recursive: true });
      assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
      fake.failCalls = how.includes("pending") ? (_m: string, p: string) => p.includes("/sessions/") : () => true;
      const sid = newSid();
      const s = { sid, cwd: dir, lid: localId("claude-code", sid) };
      start(t, sid, "startup", dir);
      if (how.includes("pending")) await runCli(t, ["sync"]);
      assert.equal(deny(t, s), HELD_DENY);
      // Released on the web; the server is reachable again; the share takes, and the feed no longer says held.
      g.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: false };
      fake.failCalls = undefined;
      await sync(t);
      await sync(t);
      assert.equal(hot(t, s.lid).share?.state, "shared");
      const told = prompt(t, sid, "go on", dir);
      assert.match(told?.hookSpecificOutput?.additionalContext ?? "", /\[Align\] The hold on goal "Ship the v2 onboarding flow" was released, so it no longer blocks tools\./);
      assert.match(told?.systemMessage ?? "", /Align: the hold on "Ship the v2 onboarding flow" was released, so this session's tools work again\./);
      assert.equal(deny(t, s), undefined, "tools run");
      const again = prompt(t, sid, "go on", dir);
      assert.doesNotMatch(`${again?.hookSpecificOutput?.additionalContext ?? ""} ${again?.systemMessage ?? ""}`, /hold/, "once");
    });
  }

  test("a feed hold the session leaves (`::align unshare`) is told to the model as no longer applying; a hold that reached it is told by its release only", async () => {
    const { fake, t } = await world();
    const g = fake.goals.get("ws_acme")!.find((x) => x.id === "g_ship")!;
    g.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    const A = await shared(t);
    await sync(t);
    assert.equal(deny(t, A), HELD_DENY);
    prompt(t, A.sid, "::align unshare", A.cwd);
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.hookSpecificOutput?.additionalContext ?? "", /\[Align\] The hold on goal "Ship the v2 onboarding flow" no longer applies to this session, so it no longer blocks tools\./);
    // The server's hold reaches B, the model sees it, then its release: one line, from the release.
    const B = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [B.key]);
    await sync(t);
    assert.match(deny(t, B) ?? "", /paused all agents on goal "Ship the v2 onboarding flow"/);
    fake.releaseGoal("ws_acme", "g_ship", [B.key]);
    g.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: false };
    await sync(t);
    const ctx = prompt(t, B.sid, "go on", B.cwd)?.hookSpecificOutput?.additionalContext ?? "";
    assert.equal(ctx.match(/hold on goal/g)?.length, 1, ctx);
    assert.match(ctx, /released the hold on goal "Ship the v2 onboarding flow"/);
  });
});
