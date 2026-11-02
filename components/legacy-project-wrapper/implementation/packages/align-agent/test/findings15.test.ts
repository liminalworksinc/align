// Regressions for the cycle-14 agent-side E2E report: two agent builds writing to one ~/.align (C14-1: an older build's
// notice with no facts after a replacing `align login` told as "signed in to Align again", a second time; C14-3: a
// session told the neutral sentence from an older build's hot file never told when its situation changed), closed as a
// class: the database records the newest build that wrote to it, an older build that sees it leaves the sessions'
// notices, hot files and latch files to that build, and the newest re-renders whatever another build wrote. Also C14-2
// (a release notice shown after a newer hold), C14-4 (a share that never reached the server called a share that ended)
// and C14-5 (`align install --dry-run` wrote ~/.align). The randomized check, with "an older
// build writes" and "hold, release, hold again" added, is test/sharestate-property.test.ts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import * as build from "../src/build.ts";
import { kvGet, kvSet } from "../src/db.ts";
import { sessionKey } from "../src/keys.ts";
import { latchWayOut } from "../src/shared/ended.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { localId, layout } from "../src/shared/layout.ts";
import type { HotState, InjectedState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

// Read loosely, so this file runs (and fails test by test) against an agent from before builds were marked.
const { NEWEST_BUILD = "newest_build", WRITER_GEN = 13 } = build as Partial<{ NEWEST_BUILD: string; WRITER_GEN: number }>;

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const GOAL = "Ship the v2 onboarding flow";
const AGAIN = `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here (it counts toward "${GOAL}" again).`;
const RELOGIN_NOTICE = /^Align: a new sign-in on this machine \(`align login`\) ended this session's share from the earlier sign-in;/;
const RELOGIN = "a new sign-in on this machine (`align login`) ended its share from the earlier sign-in";
const SHARE_CHANGED = "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";
/** What the cycle-11 agent stored when a sync found a share it could share again: words, no facts. */
const OLD_SIGNED_IN = `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here (it counts toward "${GOAL}" again).`;

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
const newSid = () => `${String(++n).padStart(8, "f")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
type S = { sid: string; cwd: string; lid: string; key: string };

function session(t: TestEnv, cwd = path.join(t.root, `repo-${n + 1}`)): S {
  const sid = newSid();
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, "ws_acme", "claude-code", sid);
  ctx.db.close();
  return { sid, cwd, key, lid: localId("claude-code", sid) };
}

async function shared(t: TestEnv): Promise<S> {
  const s = session(t);
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return s;
}

const prompt = (t: TestEnv, s: S, text = "go on") => json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${Math.random()}`, prompt: text, cwd: s.cwd }).stdout);
const said = (t: TestEnv, s: S) => (prompt(t, s)?.systemMessage ?? "") as string;
const deny = (t: TestEnv, s: S) =>
  (json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C14" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason ?? "") as string;
const ok = async (t: TestEnv, args: string[]) => {
  const r = await runCli(t, args);
  assert.equal(r.code, 0, `${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r;
};
const sync = (t: TestEnv) => ok(t, ["sync"]);
const login = (t: TestEnv) => ok(t, ["login", "--name", "Test Mac"]);
const logout = (t: TestEnv) => ok(t, ["logout"]);
const sessionRow = async (t: TestEnv, s: S) => (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === s.lid)?.shared ?? "";

/**
 * As the cycle-11 agent (from before builds were recorded) writing to the same ~/.align: a notice about the share's
 * state stored as words with no facts, and the session's hot file rendered its way (no share state, no build stamp,
 * notices as words).
 */
function olderBuildWrote(t: TestEnv, s: S, kind: string, text: string): void {
  const ctx = ctxFor(t);
  ctx.db.prepare("INSERT INTO notices(id, local_id, text, created_at, facts) VALUES(?,?,?,?,NULL)").run(`${s.lid}/${kind}${Date.now()}`, s.lid, text, new Date().toISOString());
  const rows = ctx.db.prepare("SELECT id, text FROM notices WHERE local_id=? ORDER BY created_at, rowid").all(s.lid) as { id: string; text: string }[];
  ctx.db.close();
  const hot = readJson<Record<string, unknown>>(layout.hot(t.home, s.lid))!;
  delete hot.share_now;
  delete hot.by;
  delete hot.releases_now;
  hot.notices = rows;
  writeJsonAtomic(layout.hot(t.home, s.lid), hot);
}

/** A newer build (writer generation `gen`) has written to this database, as its first command would record it. */
function newerBuildMarked(t: TestEnv, gen = WRITER_GEN + 1): void {
  const ctx = ctxFor(t);
  kvSet(ctx.db, NEWEST_BUILD, JSON.stringify({ version: "0.3.0", build: "abcdef012345", gen, since: new Date().toISOString() }));
  ctx.db.close();
}

/** That newer build is gone (say it was this one all along): this build is the newest again at its next command. */
function newerBuildGone(t: TestEnv): void {
  const ctx = ctxFor(t);
  ctx.db.prepare("DELETE FROM kv WHERE key=?").run(NEWEST_BUILD);
  ctx.db.close();
}

const fileOf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);

describe("C14-1: an older build's notice after a replacing `align login`", () => {
  test("never told as \"signed in to Align again\", nor a second time in the situation the session was told", async () => {
    const { fake, t } = await world();
    const W3 = await shared(t);
    const W4 = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [W4.key], goal: null, binding: null });
    await sync(t);
    said(t, W3);
    said(t, W4);
    // A replacing `align login`: both are told the new sign-in ended their share, W4 with its latch sentence.
    await login(t);
    assert.match(said(t, W3), RELOGIN_NOTICE);
    const told4 = said(t, W4);
    assert.match(told4, RELOGIN_NOTICE);
    assert.ok(told4.endsWith(`so ${latchWayOut(W4.lid, true, "user")}`), told4);

    // The cycle-11 `align sync` stores a "signed in again" notice with no facts for each ended share.
    for (const s of [W3, W4]) olderBuildWrote(t, s, "signed_in_", OLD_SIGNED_IN);
    // The newer build's pass: nothing new to tell either session, and never "signed in again".
    await sync(t);
    for (const s of [W3, W4]) {
      const msg = said(t, s);
      assert.equal(msg, "", `told nothing new: the session's situation is the one it was told\n${msg}`);
      assert.doesNotMatch(msg, /signed in to Align again/);
    }
    assert.ok(deny(t, W4).includes(`Its sharing ended (${RELOGIN})`), deny(t, W4));
    assert.match(await sessionRow(t, W3), /ended at a new sign-in \(`align login`\); `::align share` shares it again/);
  });

  test("a session not prompted since the replacing login is told the new sign-in's words, never \"signed in again\"", async () => {
    const { t } = await world();
    const W = await shared(t);
    await sync(t);
    said(t, W);
    await login(t);
    olderBuildWrote(t, W, "signed_in_", OLD_SIGNED_IN);
    await sync(t);
    const msg = said(t, W);
    assert.doesNotMatch(msg, /signed in to Align again/, msg);
    assert.match(msg, RELOGIN_NOTICE, msg);
    assert.equal(said(t, W), "", "once");
  });
});

describe("C14-3: a session told the neutral sentence from an older build's hot file", () => {
  test("is told when its situation changes, and the views agree", async () => {
    const { t } = await world();
    const A1 = await shared(t);
    const A2 = await shared(t);
    await sync(t);
    said(t, A1);
    said(t, A2);
    // The cycle-11 `align logout`: its sign-out notice as words with no facts, and its hot file.
    await logout(t);
    const ctx = ctxFor(t);
    ctx.db.prepare("UPDATE notices SET facts=NULL WHERE local_id=? AND id LIKE ?").run(A1.lid, `${A1.lid}/signed_out_%`);
    const rows = ctx.db.prepare("SELECT id, text FROM notices WHERE local_id=? ORDER BY created_at, rowid").all(A1.lid) as { id: string; text: string }[];
    ctx.db.close();
    const hot = readJson<Record<string, unknown>>(layout.hot(t.home, A1.lid))!;
    delete hot.share_now;
    delete hot.by;
    hot.notices = rows;
    writeJsonAtomic(layout.hot(t.home, A1.lid), hot);
    assert.equal(said(t, A1), SHARE_CHANGED, "the neutral sentence, never the stored words");

    await login(t);
    await sync(t);
    assert.equal(said(t, A1), AGAIN, "told the machine is signed in again, as its sibling is");
    assert.equal(said(t, A2), AGAIN);
    assert.equal(said(t, A1), "", "once");
    assert.match(await sessionRow(t, A1), /`::align share` shares it again/);
    assert.equal((readJson<InjectedState>(layout.injected(t.home, A1.lid))?.share_told?.key ?? "").split(":")[0], "reshare");
  });
});

describe("cycle 14: a build that sees a newer build's mark", () => {
  test("records the newest build; an older one writes no share-state notice, hot or latch file, says so, and the newer re-tells from the state", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [B.key], goal: null, binding: null });
    await sync(t);
    said(t, A);
    said(t, B);
    let ctx = ctxFor(t);
    const mark = JSON.parse(kvGet(ctx.db, NEWEST_BUILD) ?? "null");
    ctx.db.close();
    assert.equal(mark?.gen, WRITER_GEN, "the newest build that wrote here is recorded");
    assert.equal(readJson<HotState>(layout.hot(t.home, A.lid))?.by?.gen, WRITER_GEN, "and stamped on the hot files it writes");

    newerBuildMarked(t);
    const hotA = fileOf(layout.hot(t.home, A.lid));
    const latchB = fileOf(layout.latch(t.home, B.lid));
    const out = await runCli(t, ["logout"]);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stderr, /align: a newer Align build \(0\.3\.0 build abcdef012345\) has written to this machine's Align data, so this `align` \(\S+ build \S+\) leaves what sessions are told and their stop and hold files to that build/);
    assert.equal(fileOf(layout.hot(t.home, A.lid)), hotA, "no hot file written");
    assert.equal(fileOf(layout.latch(t.home, B.lid)), latchB, "no latch file written");
    ctx = ctxFor(t);
    const stored = ctx.db.prepare("SELECT COUNT(*) AS n FROM notices WHERE id LIKE '%/signed_out_%'").get() as { n: number };
    ctx.db.close();
    assert.equal(stored.n, 0, "no notice about a share's state stored");
    assert.match((await runCli(t, ["doctor"])).stdout, /WARN {2}newest build {5}a newer Align build/);
    assert.equal(said(t, A), "", "the hooks enforce and tell from the files that are there");

    // The newer build runs again (here: the mark is gone, so this build is the newest): it stores what was left,
    // re-renders every session, and each is told from the state now, as its deny says.
    newerBuildGone(t);
    await runCli(t, ["status"]);
    assert.match(said(t, A), /^Align: this session stopped sharing because this machine signed out of Align;/);
    const b = said(t, B);
    assert.match(b, /^Align: this session stopped sharing because this machine signed out of Align;/);
    assert.ok(deny(t, B).includes("Its sharing has since ended (this machine signed out of Align)"), deny(t, B));
    assert.equal(said(t, A), "", "once");
  });

  test("an older build's pass still runs (it meters), and a hook's pass says nothing on the terminal", async () => {
    const { fake, t } = await world();
    await shared(t);
    await sync(t);
    newerBuildMarked(t);
    const before = fake.log.length;
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /a newer Align build/);
    assert.ok(fake.log.length > before, "the pass reached the server");
    const h = await runCli(t, ["sync", "--hook"]);
    assert.equal(h.stderr, "");
  });
});

describe("C14-2: hold, release and hold again with no prompt in between", () => {
  test("the release is not told while the goal is held again, to the user or the model; a later release is told once", async () => {
    const { fake, t } = await world();
    const K = await shared(t);
    await sync(t);
    said(t, K);
    fake.holdGoal("ws_acme", "g_ship", [K.key], "k-first");
    await sync(t);
    // The model saw the hold block a tool.
    assert.match(deny(t, K), /paused all agents on goal/);
    fake.releaseGoal("ws_acme", "g_ship", [K.key]);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [K.key], "k-second");
    await sync(t);
    const out = prompt(t, K);
    assert.doesNotMatch(out?.systemMessage ?? "", /released the hold/, "no release notice while held again");
    assert.doesNotMatch(out?.hookSpecificOutput?.additionalContext ?? "", /released the hold/, "no release line for the model");
    assert.match(deny(t, K), /"k-second"/);

    fake.releaseGoal("ws_acme", "g_ship", [K.key]);
    await sync(t);
    const rel = prompt(t, K);
    assert.equal(((rel?.systemMessage ?? "") as string).match(/released the hold/g)?.length, 1, rel?.systemMessage);
    assert.match(rel?.hookSpecificOutput?.additionalContext ?? "", /released the hold on goal/);
    assert.equal(deny(t, K), "");
  });
});

describe("C14-4: a share that never reached the server", () => {
  const putFails = (fake: FakeServer) => (fake.failCalls = (m: string, p: string) => m === "PUT" && /\/sessions\/[^/]+$/.test(p));

  test("after a sign-out and a login, is never called a share that ended or is shared again", async () => {
    const { fake, t } = await world();
    const B1 = await shared(t);
    await sync(t);
    const B2 = session(t);
    putFails(fake);
    await ok(t, ["share", B2.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    await logout(t);
    assert.match(said(t, B2), /had not reached the Align server yet when this machine signed out of Align, so it was not shared/);
    fake.failCalls = null;
    await login(t);
    await sync(t);
    const msg = said(t, B2);
    assert.equal(
      msg,
      `Align: this machine is signed in to Align again. Earlier, this session's share had not reached the Align server yet when this machine signed out of Align, so it was not shared; to share it, type \`::align share\` here (it counts toward "${GOAL}").`,
    );
    assert.doesNotMatch(msg, /share this session again|shares it again/);
    assert.equal(await sessionRow(t, B2), "stopped (Acme; not shared: this machine signed out before its share reached the Align server; `::align share` shares it)");
    assert.match(said(t, B1), /^Align: this session stopped sharing because|^Align: this machine is signed in to Align again\. To share this session again/);
    assert.match(await sessionRow(t, B1), /ended at a sign-out; `::align share` shares it again/);
  });

  test("at a replacing login, and when its person is no longer a member, says it was not shared", async () => {
    const { fake, t } = await world();
    const P = session(t);
    putFails(fake);
    await ok(t, ["share", P.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    await login(t);
    const msg = said(t, P);
    assert.equal(
      msg,
      `Align: this session's share had not reached the Align server yet when a new sign-in on this machine (\`align login\`) replaced the earlier one, so it was not shared; its usage stays on this machine until it is shared. To share it, type \`::align share\` here (it counts toward "${GOAL}").`,
    );
    assert.doesNotMatch(msg, /ended this session's share/);
    assert.equal(await sessionRow(t, P), "stopped (Acme; not shared: a new sign-in (`align login`) came before its share reached the Align server; `::align share` shares it)");
    // Removed from Acme: still never shared, never "can't be shared there again".
    fake.failCalls = null;
    fake.workspaces = [];
    fake.otherWorkspaces = [];
    await sync(t);
    const gone = said(t, P);
    assert.match(gone, /^Align: you are no longer a member of Acme in Align \(you were removed from it or left it\), so this session can't be shared there from here \(this session's share had not reached the Align server yet when a new sign-in on this machine \(`align login`\) replaced the earlier one, so it was not shared\)/, gone);
  });
});

describe("C14-5: `align install --dry-run`", () => {
  test("writes nothing, not even ~/.align", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    const r = await runCli(t, ["install", "--claude", "--codex", "--dry-run"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^Would copy /m);
    assert.equal(fs.existsSync(t.home), false, `${t.home} exists after the dry run: ${fs.existsSync(t.home) ? fs.readdirSync(t.home).join(", ") : ""}`);
    assert.deepEqual(fs.readdirSync(t.claudeDir), []);
    assert.deepEqual(fs.readdirSync(t.codexHome), []);
  });
});
