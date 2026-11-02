// Regressions for the cycle-13 agent-side E2E report: C13-1 (a notice about a share's state that an older agent stored
// with no facts after the one-time migration ran, shown word for word; and the hooks' copy in bin/current of another
// build than the terminal `align`, silently), C13-2 (a session told of a goal hold by its envelope never told of the
// release), and the items of its section 5 (a share a replacing `align login` ended, a removal named as this sign-in's
// reach, `::align share --dir none confirm`, the logout count). The randomized check of the share-state views, with an
// older agent's notice written after the migration added, is test/sharestate-property.test.ts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { latchWayOut } from "../src/shared/ended.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { localId, layout } from "../src/shared/layout.ts";
import type { InjectedState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };
const GOAL = "Ship the v2 onboarding flow";
const AGAIN = `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here (it counts toward "${GOAL}" again).`;
const SHARE_CHANGED = "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";
/** The words an agent from before notices were worded when shown stored at a sign-out. */
const OLD_OUT = `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here (it counts toward "${GOAL}" again).`;
const RELOGIN = "a new sign-in on this machine (`align login`) ended its share from the earlier sign-in";

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

type S = { sid: string; cwd: string; lid: string; key: string };

function session(t: TestEnv, cwd = path.join(t.root, `repo-${n + 1}`)): S {
  const sid = newSid();
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
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
  (json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C13" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason ?? "") as string;
const sync = async (t: TestEnv) => {
  const r = await runCli(t, ["sync"]);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  return r;
};
const login = async (t: TestEnv) => {
  const l = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(l.code, 0, l.stderr);
  return l;
};
const logout = async (t: TestEnv) => {
  const r = await runCli(t, ["logout"]);
  assert.equal(r.code, 0, r.stderr);
  return r;
};
const unreadLogin = async (fake: FakeServer, t: TestEnv) => {
  fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
  await login(t);
};
const stop = (fake: FakeServer, s: S) => fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [s.key], goal: null, binding: null });
const injected = (t: TestEnv, s: S) => readJson<InjectedState>(layout.injected(t.home, s.lid));
const sessionRow = async (t: TestEnv, s: S) => (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === s.lid)?.shared ?? "";

describe("C13-1: a notice about a share's state that an older agent stores after the migration ran", () => {
  /** As an older `align` writing to the same ~/.align after this agent's migration ran (a downgrade, or the hooks'
   *  older copy in bin/current): the sign-out notice as its words, no facts; `user_version` stays as this agent left it. */
  const olderAgentWrote = (t: TestEnv, s: S, text: string) => {
    const ctx = ctxFor(t);
    const v = (ctx.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    assert.ok(v >= 1, "the one-time migration ran already");
    const r = ctx.db.prepare("UPDATE notices SET facts=NULL, text=? WHERE local_id=? AND id LIKE ?").run(text, s.lid, `${s.lid}/signed_out_%`);
    assert.ok(Number(r.changes) >= 1);
    renderHot(ctx, s.lid);
    ctx.db.close();
  };

  test("it is worded from the state now: held back while the ended shares are unread, never `run align login` while signed in, then the signed-in-again notice once", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    await sync(t);
    stop(fake, B);
    await sync(t);
    await logout(t);
    olderAgentWrote(t, A, OLD_OUT);
    olderAgentWrote(t, B, `${OLD_OUT} It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${B.lid.slice(0, 8)}\` in a terminal.`);
    await unreadLogin(fake, t);
    for (const s of [A, B]) {
      const msg = said(t, s);
      assert.doesNotMatch(msg, /run `align login`/, "never the stored words while signed in");
      assert.equal(msg, "", "held back while the ended shares are unread");
    }
    fake.failCalls = null;
    await sync(t);
    assert.equal(said(t, A), AGAIN);
    assert.ok(said(t, B).startsWith(AGAIN), "the stopped one too, with the deny's latch sentence");
    assert.ok(deny(t, B).includes(latchWayOut(B.lid, true, "model")));
    assert.equal(said(t, A), "", "once");
  });

  test("signed out it gives the sign-out's words as now; a live share's factless notice says only that its sharing changed; an older agent's hot file is never shown as stored", async () => {
    const { t } = await world();
    const A = await shared(t);
    await sync(t);
    await logout(t);
    olderAgentWrote(t, A, "Align: this machine is signed in to Align again. To share this session again, type `::align share` here.");
    const out = said(t, A);
    assert.match(out, /^Align: this session stopped sharing because this machine signed out of Align; .*run `align login` in a terminal/, out);

    // Shared and live: an older agent's notice (its share started, say) is told as changed, never as stored.
    await login(t);
    const L = await shared(t);
    await sync(t);
    said(t, L);
    const ctx = ctxFor(t);
    ctx.db.prepare("INSERT INTO notices(id, local_id, text, created_at, facts) VALUES(?,?,?,?,NULL)").run(`${L.lid}/access_lost_ws_acme_old`, L.lid, "Align: you no longer have access to Acme.", new Date().toISOString());
    renderHot(ctx, L.lid);
    ctx.db.close();
    assert.equal(said(t, L), SHARE_CHANGED);

    // A hot file an older agent rendered (no `share_now`): what is true whenever it is shown, not its stored words.
    const hot = readJson<Record<string, unknown>>(layout.hot(t.home, L.lid))!;
    delete hot.share_now;
    (hot.notices as { id: string; text: string }[]).push({ id: `${L.lid}/signed_out_older`, text: OLD_OUT });
    writeJsonAtomic(layout.hot(t.home, L.lid), hot);
    assert.equal(said(t, L), SHARE_CHANGED);
  });
});

describe("C13-1: the hooks' copy of Align is another build than the terminal `align`", () => {
  test("every command says so on stderr and `align doctor` warns, until `align install` updates the hooks", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    assert.equal((await runCli(t, ["install", "--claude"])).code, 0);
    const quiet = await runCli(t, ["status"]);
    assert.doesNotMatch(quiet.stderr, /another Align build/);
    const doc = await runCli(t, ["doctor"]);
    assert.match(doc.stdout, /OK {4}hooks build {6}\S+ build [0-9a-f]{12}, as this `align`/);

    // An older (or newer) build of the same version left in bin/current.
    const file = path.join(t.home, "bin", "current", "build.json");
    const b = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...b, build: "0123456789ab" }));
    const st = await runCli(t, ["status"]);
    assert.match(st.stderr, new RegExp(`align: the hooks run another Align build \\(${b.version} build 0123456789ab\\) than this \`align\` \\(${b.version} build ${b.build}\\), .*Run \`align install\` with this \`align\` to update them\\.`));
    assert.match((await runCli(t, ["sessions"])).stderr, /the hooks run another Align build/);
    assert.match((await runCli(t, ["doctor"])).stdout, /WARN  hooks build {6}the hooks run another Align build/);
    // A copy from before builds were recorded.
    fs.rmSync(file);
    assert.match((await runCli(t, ["status"])).stderr, /the hooks run another Align build \(an earlier build\)/);

    assert.equal((await runCli(t, ["install", "--claude"])).code, 0);
    assert.doesNotMatch((await runCli(t, ["status"])).stderr, /another Align build/);
  });
});

describe("C13-2: a session told of a goal hold by its envelope", () => {
  async function heldRuleSession() {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const dir = path.join(t.root, "rule-held");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const sid = newSid();
    const start = json(runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd: dir }).stdout);
    assert.match(start.hookSpecificOutput.additionalContext, /\[Align\] All agents on goal "Ship the v2 onboarding flow" were paused/);
    const s: S = { sid, cwd: dir, lid: localId("claude-code", sid), key: keyOf(t, sid) };
    assert.deepEqual(injected(t, s)?.holds_told, ["g_ship"], "the envelope's hold counts as told to the model");
    return { fake, t, s };
  }
  const unheld = (fake: FakeServer) => {
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: false };
  };

  test("the release that reaches it is told to the model, with no hold deny in between", async () => {
    const { fake, t, s } = await heldRuleSession();
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [s.key], null, { id: "u_lena", name: "Lena" });
    await sync(t);
    assert.equal(prompt(t, s)?.hookSpecificOutput?.additionalContext ?? "", "", "nothing new while held");
    fake.releaseGoal("ws_acme", "g_ship", [s.key], { id: "u_lena", name: "Lena" });
    unheld(fake);
    await sync(t);
    const out = prompt(t, s, "Try again: run the shell command: ls");
    assert.match(out?.systemMessage ?? "", /Align: Lena released the hold on "Ship the v2 onboarding flow"/);
    assert.ok(String(out?.hookSpecificOutput?.additionalContext ?? "").includes(`[Align] Lena released the hold on goal "${GOAL}", so it no longer blocks tools.`), JSON.stringify(out));
    assert.equal(deny(t, s), "");
    assert.equal(prompt(t, s)?.hookSpecificOutput?.additionalContext ?? "", "", "once");
  });

  test("a hold released before it reached the session is told as released, from the cached goals", async () => {
    const { fake, t, s } = await heldRuleSession();
    unheld(fake);
    await sync(t);
    const out = prompt(t, s);
    assert.ok(String(out?.hookSpecificOutput?.additionalContext ?? "").includes(`[Align] The hold on goal "${GOAL}" was released, so it no longer blocks tools.`), JSON.stringify(out));
  });
});

describe("cycle 13, section 5: works, but would confuse a developer", () => {
  test("a share a replacing `align login` ended: the deny and `align latch status` say so as its notice does, never that this machine signed out", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const H = await shared(t);
    await sync(t);
    stop(fake, A);
    fake.holdGoal("ws_acme", "g_ship", [H.key]);
    await sync(t);
    await login(t);
    assert.match(said(t, A), /^Align: a new sign-in on this machine \(`align login`\) ended this session's share from the earlier sign-in;/);
    for (const s of [A, H]) {
      const why = deny(t, s);
      assert.ok(why.includes(`Its sharing ended (${RELOGIN}), so ${latchWayOut(s.lid, true, "model")}`), why);
      assert.doesNotMatch(why, /signed out/);
    }
    const latch = (await runCli(t, ["latch", "status"])).stdout;
    for (const s of [A, H]) assert.match(latch, new RegExp(`${s.lid.slice(0, 8)} .*; sharing ended \\(a new sign-in on this machine \\(\`align login\`\\) ended its share from the earlier sign-in\\): \`::align share\``));
    assert.doesNotMatch(latch, /signed out/);
    assert.match(await sessionRow(t, A), /ended at a new sign-in \(`align login`\); `::align share` shares it again/);

    // A real sign-out and sign-in still read as such.
    await logout(t);
    await login(t);
    assert.ok(deny(t, A).includes("Its sharing ended (this machine signed out of Align, and is signed in again now)"), deny(t, A));
  });

  test("removed from the workspace: the notice and `align sessions` name the removal, not this sign-in's reach", async () => {
    const { fake, t } = await world({ side: true });
    const W = await shared(t);
    const R = await shared(t);
    await sync(t);
    await logout(t);
    said(t, W);
    // Removed from Acme while signed out; the new pairing can only reach Side Co.
    fake.workspaces = [SIDE];
    fake.otherWorkspaces = [];
    await login(t);
    assert.equal(
      said(t, W),
      "Align: this machine is signed in to Align again, but you are no longer a member of Acme in Align (you were removed from it or left it), so this session can't be shared there again from here; its usage stays on this machine.",
    );
    assert.equal(await sessionRow(t, W), "stopped (Acme; ended at a sign-out; you are no longer a member of its workspace)");
    // Told it could be shared again, then removed: the removal, not "signed in again".
    fake.workspaces = [ACME, SIDE];
    await sync(t);
    assert.match(said(t, R), /^Align: this machine is signed in to Align again\. To share this session again/);
    fake.workspaces = [SIDE];
    await sync(t);
    assert.equal(said(t, R), "Align: you are no longer a member of Acme in Align (you were removed from it or left it), so this session can't be shared there again from here; its usage stays on this machine.");
    // A pairing not given Acme, its person still a member: this sign-in's reach.
    await logout(t);
    assert.match(said(t, W), /signed out of Align/);
    fake.otherWorkspaces = [{ id: ACME.id, name: ACME.name }];
    await login(t);
    assert.match(said(t, W), /this sign-in does not reach Acme/);
  });

  test("`::align share --dir none confirm` makes a no-goal rule and never says the next prompt carries the goal", async () => {
    const { t } = await world();
    const s = session(t);
    const done = prompt(t, s, "::align share --dir none confirm").reason as string;
    assert.match(done, /are now shared with Acme\. This session too, with no goal \(its usage counts as unallocated\)\./);
    assert.doesNotMatch(done, /carries the goal/);
  });

  test("`align logout` counts only the shares the server had: one still queued never reached it", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    const q = session(t);
    fake.setOffline(true);
    assert.match((await runCli(t, ["share", q.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).stdout, /queued to share/);
    const r = await logout(t);
    assert.match(r.stdout, /^1 shared session\(s\) stopped sharing\.$/m, r.stdout);
    assert.match(said(t, q), /had not reached the Align server yet when this machine signed out of Align, so it was not shared/);
    void A;
  });
});
