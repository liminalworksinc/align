// Regressions for the cycle-12 agent-side E2E report: C12-1 (notice rows an older agent stored as words, shown word
// for word after an upgrade, and the rows an older hook reads), C12-2 (the pass that hears the device was revoked ends
// the shares there and then), C12-3 (every share path holds back while the ended shares are unread, as `::align share`
// does), C12-4 (a request to a session whose share ended expires here, and an answer the server refused is said), and
// the items of its section 6, first of them the advice while the ended shares are unread (`align sync` first). The
// randomized check of the share-state views, with the revocation, `::align share --dir` and `align share` added, is
// test/sharestate-property.test.ts. C12-4 against the real server: scripts/test-agent-live.mjs "request to an ended
// share (E2E-AGENT cycle 12 C12-4)".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { crossing } from "../src/shared/drift.ts";
import { latchNoticeTail, latchWayOut } from "../src/shared/ended.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { localId, layout, spoolWrite } from "../src/shared/layout.ts";
import { requestShortId } from "../src/shared/envelope.ts";
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
/** What the database keeps as the text of a notice about a share that ended (C12-1). */
const SHARE_CHANGED = "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";
const UNREAD = "Align: this machine is signed in to Align again, but has not yet heard from the Align server whether this session's sharing was stopped on the web meanwhile";

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
const newSid = () => `${String(++n).padStart(8, "d")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const keyOf = (t: TestEnv, sid: string, ws = "ws_acme") => {
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, ws, "claude-code", sid);
  ctx.db.close();
  return key;
};

type S = { sid: string; cwd: string; lid: string; key: string };

/** A Claude Code session in a folder of its own (or `cwd`), seen by the CLI (its SessionStart and a prompt), not shared. */
function session(t: TestEnv, cwd = path.join(t.root, `repo-${n + 1}`)): S {
  const sid = newSid();
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

/** The same, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv): Promise<S> {
  const s = session(t);
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return s;
}

const prompt = (t: TestEnv, s: S, text = "go on") => json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${Math.random()}`, prompt: text, cwd: s.cwd }).stdout);
const said = (t: TestEnv, s: S) => (prompt(t, s)?.systemMessage ?? "") as string;
const deny = (t: TestEnv, s: S) =>
  (json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C12" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason ?? "") as string;
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
const logout = async (t: TestEnv) => assert.equal((await runCli(t, ["logout"])).code, 0);
/** `align login` whose directives call fails: the ended shares stay unread until a pass reads them. */
const unreadLogin = async (fake: FakeServer, t: TestEnv) => {
  fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
  await login(t);
};
const stop = (fake: FakeServer, s: S) => fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [s.key], goal: null, binding: null });
const spooledShares = (t: TestEnv) =>
  fs
    .readdirSync(layout.spool(t.home))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(layout.spool(t.home), f), "utf8")))
    .filter((r) => r.type === "command" && r.command === "share");
const injected = (t: TestEnv, s: S) => readJson<InjectedState>(layout.injected(t.home, s.lid));
const status = (t: TestEnv, s: S) => (prompt(t, s, "::align status")?.reason ?? "") as string;

describe("C12-1: notices about a share's state from an older agent, and the rows an older hook reads", () => {
  /** As an agent from before notices were worded when shown left it: the share-state notices as words, no facts, and no
   *  local migration applied; its hot files show them so. */
  const asOlderAgent = (t: TestEnv, words: Record<string, string>) => {
    const ctx = ctxFor(t);
    for (const [lid, text] of Object.entries(words)) ctx.db.prepare("UPDATE notices SET facts=NULL, text=? WHERE local_id=? AND id LIKE ?").run(text, lid, `${lid}/signed_out_%`);
    for (const lid of Object.keys(words)) renderHot(ctx, lid);
    ctx.db.exec("PRAGMA user_version=0");
    ctx.db.close();
  };
  const OLD_OUT = `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here (it counts toward "${GOAL}" again).`;

  test("after the upgrade they are worded as now: held back while the ended shares are unread, then the state's words, also for one an older hook had shown", async () => {
    const { fake, t } = await world();
    const O1 = await shared(t);
    const O2 = await shared(t);
    await sync(t);
    stop(fake, O2);
    await sync(t);
    await logout(t);
    asOlderAgent(t, {
      [O1.lid]: OLD_OUT,
      [O2.lid]: `${OLD_OUT} It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${O2.lid.slice(0, 8)}\` in a terminal.`,
    });
    // O2's was shown by the older hook (its id is seen), with nothing recorded of its words.
    const inj = injected(t, O2) ?? ({ notices_shown: [] } as unknown as InjectedState);
    const ctx = ctxFor(t);
    const id = (ctx.db.prepare("SELECT id FROM notices WHERE local_id=? AND id LIKE ?").get(O2.lid, `${O2.lid}/signed_out_%`) as { id: string }).id;
    ctx.db.close();
    writeJsonAtomic(layout.injected(t.home, O2.lid), { ...inj, notices_shown: [...inj.notices_shown, id], share_told: undefined });

    // The new agent's first command (this login) migrates them; its directives call fails, so the ended shares are unread.
    await unreadLogin(fake, t);
    for (const s of [O1, O2]) assert.equal(said(t, s), "", "nothing while the ended shares are unread, never the stored `run align login`");
    const c2 = ctxFor(t);
    const left = c2.db.prepare("SELECT id, text FROM notices WHERE facts IS NULL AND (id LIKE '%/signed_out_%' OR id LIKE '%/access_lost_%')").all();
    const stored = (c2.db.prepare("SELECT text FROM notices WHERE local_id=? AND id LIKE ?").get(O1.lid, `${O1.lid}/signed_out_%`) as { text: string }).text;
    c2.db.close();
    assert.deepEqual(left, [], "no share-state notice without facts is left");
    assert.equal(stored, SHARE_CHANGED, "its stored text is one an older hook can show at any time");

    fake.failCalls = null;
    await sync(t);
    assert.equal(said(t, O1), AGAIN);
    assert.equal(said(t, O2), AGAIN + latchNoticeTail(O2.lid, true), "the one an older hook showed is told once more, worded as now, as its deny says");
    assert.ok(deny(t, O2).includes(latchWayOut(O2.lid, true, "model")));
    assert.equal(said(t, O2), "", "once");
  });

  test("a notice this agent stores is one an older hook can show at any time; once this agent's hook takes over it tells the state now, once", async () => {
    const { fake, t } = await world();
    const O3 = await shared(t);
    await sync(t);
    await logout(t);
    const ctx = ctxFor(t);
    const row = ctx.db.prepare("SELECT id, text FROM notices WHERE local_id=? AND id LIKE ?").get(O3.lid, `${O3.lid}/signed_out_%`) as { id: string; text: string };
    ctx.db.close();
    assert.equal(row.text, SHARE_CHANGED, "never event-time advice such as `run align login`");
    // An older hook still installed shows that text and marks it seen; it records nothing of its words.
    const inj = injected(t, O3) ?? ({ notices_shown: [] } as unknown as InjectedState);
    writeJsonAtomic(layout.injected(t.home, O3.lid), { ...inj, notices_shown: [...inj.notices_shown, row.id], share_told: undefined });
    await login(t);
    assert.equal(said(t, O3), AGAIN, "this agent's hook tells the state now");
    assert.equal(said(t, O3), "", "once");
    void fake;
  });
});

describe("C12-2: the sync that hears the device was revoked ends the shares in that same pass", () => {
  test("the next prompt tells the sign-out and the deny of a session stopped from the web no longer says it can be resumed there", async () => {
    const { fake, t } = await world();
    const S1 = await shared(t);
    const S3 = await shared(t);
    await sync(t);
    stop(fake, S1);
    await sync(t);
    assert.match(deny(t, S1), /until it is resumed there/);
    fake.revokeOnWeb(loadCredentials(t.home)!.device_id);
    const r = await sync(t);
    assert.match(r.stdout, /This machine is signed out because this device was revoked on the web/);
    // No other command runs in between (each of them would end the shares too).
    assert.match(said(t, S3), /^Align: this session stopped sharing because this machine signed out of Align/);
    const why = deny(t, S1);
    assert.doesNotMatch(why, /until it is resumed there/);
    assert.ok(why.includes(`Its sharing has since ended (this machine signed out of Align), so ${latchWayOut(S1.lid, false, "model", null, { login: true })}`), why);
    const ctx = ctxFor(t);
    const live = ctx.db.prepare("SELECT local_id FROM shares WHERE state IN ('shared','pending','suspended')").all();
    ctx.db.close();
    assert.deepEqual(live, []);
  });
});

describe("C12-3: every share path holds back while the ended shares are unread", () => {
  test("`::align share --dir` makes the rule but asks nothing for a session whose share ended; `align share` reads the ended shares first or shares nothing; a spooled share is refused; after the read the stopped one stays stopped", async () => {
    const { fake, t } = await world();
    const V1 = await shared(t);
    const V2 = await shared(t);
    const W1 = await shared(t);
    await sync(t);
    fake.stopOnWeb(V1.key);
    fake.stopOnWeb(V2.key);
    await logout(t);
    await unreadLogin(fake, t);

    const preview = prompt(t, V2, "::align share --dir").reason as string;
    assert.match(preview, /This session is not shared yet: this machine has not yet heard from the Align server whether its sharing was stopped on the web meanwhile/);
    assert.doesNotMatch(preview, /This session is shared too/);
    const done = prompt(t, V2, "::align share --dir confirm").reason as string;
    assert.match(done, /are now shared with Acme/);
    assert.match(done, /This session is not shared yet: .* Run `align sync` in a terminal, then type `::align share` here\./);
    assert.doesNotMatch(done, /This session too/);
    assert.equal(spooledShares(t).length, 0, "nothing spooled for this session");
    assert.match((await runCli(t, ["rules"])).stdout, /Acme/);

    // From the terminal: the ended shares can't be read (directives still fail), so nothing is sent.
    const puts = () => fake.log.filter((l) => l.method === "PUT" && l.path.includes("/sessions/")).length;
    const before = puts();
    const r = await runCli(t, ["share", V1.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stderr, /was not shared: this machine is signed in to Align again, but has not yet heard from the Align server whether this session's sharing was stopped on the web meanwhile .* Run `align sync` in a terminal, then share it again with `align share`\./);
    assert.equal(puts(), before, "no share sent");

    // A share spooled before this agent held it back (an older hook, say) is refused by the pass, not sent.
    spoolWrite(t.home, { type: "command", harness: "claude-code", native_id: V2.sid, cwd: V2.cwd, command: "share", arg: null, ts: new Date().toISOString() });
    await runCli(t, ["sync"]);
    assert.equal(puts(), before, "the spooled share was not sent");
    assert.match(said(t, V2), /Align: share failed: this machine is signed in to Align again, but has not yet heard/);

    // Readable again: `align share` reads them first, so the one not stopped on the web is shared at once.
    fake.failCalls = null;
    const w = await runCli(t, ["share", W1.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(w.code, 0, w.stderr);
    assert.match(w.stdout, /is shared/);
    await sync(t);
    for (const s of [V1, V2]) {
      const msg = said(t, s);
      assert.match(msg, /stays stopped/, msg);
      assert.doesNotMatch(msg, /sharing failed/, msg);
    }
  });
});

describe("C12-4: a request to a session whose share ended", () => {
  test("expires here when the share ends at a sign-out: not waiting, not counted, and answering it says it expired", async () => {
    const { fake, t } = await world();
    const R = await shared(t);
    await sync(t);
    const q = fake.sendRequest("ws_acme", { type: "checkpoint", goal_id: "g_ship", session_keys: [R.key] });
    await sync(t);
    assert.match((await runCli(t, ["status"])).stdout, /Requests: {3}1 waiting for your answer/);
    await logout(t);
    await login(t);
    assert.doesNotMatch((await runCli(t, ["status"])).stdout, /Requests:/);
    assert.match((await runCli(t, ["requests"])).stdout, /No requests waiting for an answer/);
    assert.match((await runCli(t, ["requests", "--all"])).stdout, /checkpoint .*: expired \(this session's share ended when this machine signed out of Align, and the Align server expired the request\)/);
    const a = await runCli(t, ["requests", "accept", requestShortId(q.wire.id)]);
    assert.equal(a.code, 2, a.stdout);
    assert.match(a.stderr, /is already expired \(this session's share ended when this machine signed out of Align, and the Align server expired the request\), so it can't be accepted now/);
    assert.ok(!fake.receipts.some((x) => x.state === "accepted"), "no answer sent");
  });

  test("an answer the server refuses (404) is said, never reported as recorded, and the session hears it", async () => {
    const { fake, t } = await world();
    const R = await shared(t);
    await sync(t);
    const q = fake.sendRequest("ws_acme", { type: "checkpoint", goal_id: "g_ship", session_keys: [R.key] });
    await sync(t);
    // The session's share there is no longer this device's (another pairing took it over, say): receipts are 404.
    fake.sessions.get(R.key)!.device = "dv_elsewhere";
    const a = await runCli(t, ["requests", "accept", requestShortId(q.wire.id)]);
    assert.equal(a.code, 1, a.stdout);
    assert.match(a.stdout, new RegExp(`${R.lid.slice(0, 8)} claude-code: not accepted: the Align server did not take the answer accepted here \\(not_found\\): this session's share there has ended`));
    assert.doesNotMatch(a.stdout, /: accepted/);
    const ctx = ctxFor(t);
    const queued = ctx.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='receipt'").get() as { n: number };
    ctx.db.close();
    assert.equal(queued.n, 0, "not sent again");
    assert.match(fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8"), /receipt accepted for directive \S+ \(session \S+\) refused by the server: not_found/);
    assert.match(said(t, R), new RegExp(`Align: the Align server did not take your answer to Dana Lee's request ${requestShortId(q.wire.id)} \\(not_found\\)`));
    assert.match((await runCli(t, ["requests", "--all"])).stdout, /expired \(the Align server did not take the answer accepted here \(not_found\)/);
  });
});

describe("cycle 12, section 6: the advice while the ended shares are unread", () => {
  test("the deny, `::align status`, `align latch status`, `align sessions` and `align status` say to run `align sync` first, as `::align share` does; after the read, `::align share`", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    stop(fake, A);
    await sync(t);
    await logout(t);
    await unreadLogin(fake, t);
    const lid8 = A.lid.slice(0, 8);
    assert.ok(deny(t, A).includes(latchWayOut(A.lid, true, "model", null, { unread: true })), deny(t, A));
    assert.match(deny(t, A), /the user runs `align sync` in a terminal first .*, then types `::align share` in this session/);
    assert.match(status(t, A), /Stop latch: on \(tools blocked; sharing ended \(this machine signed out, and is signed in again now\): run `align sync` first \(this machine has not yet heard whether its sharing was stopped on the web meanwhile\), then `::align share` here shares it again/);
    assert.match((await runCli(t, ["latch", "status"])).stdout, new RegExp(`${lid8} .*sharing ended \\(this machine signed out, and is signed in again now\\): run \`align sync\` first`));
    const row = (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === A.lid)!;
    assert.match(row.shared, /ended at a sign-out; run `align sync` first .*, then `::align share` shares it again/);
    assert.match((await runCli(t, ["status"])).stdout, /1 can be shared again \(run `align sync` first, then `::align share` in the session\)/);
    assert.ok(prompt(t, A, "::align share confirm").reason.startsWith(UNREAD), "and `::align share` says the same");

    fake.failCalls = null;
    await sync(t);
    assert.ok(deny(t, A).includes(latchWayOut(A.lid, true, "model")), deny(t, A));
    assert.doesNotMatch(deny(t, A), /align sync/);
  });
});

describe("cycle 12, section 6: works, but would confuse a developer", () => {
  test("signed out, a stopped session's notice and deny name both ways out in one sentence: a new sign-in and `::align share`, or `align stop-sharing`", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    stop(fake, A);
    await sync(t);
    await logout(t);
    const msg = said(t, A);
    assert.ok(msg.endsWith(latchNoticeTail(A.lid, false, null, { login: true })), msg);
    assert.match(msg, /run `align login` in a terminal, then type `::align share` here .* It was stopped or held from the web, so tools stay blocked until it is shared again that way, after which the stop or hold, if still in place, can be lifted from the web, or until you run `align stop-sharing \S+` in a terminal\.$/);
    assert.ok(deny(t, A).includes(latchWayOut(A.lid, false, "model", null, { login: true })), deny(t, A));
  });

  test("a hold released on the web after the share ended: the deny no longer says work resumes when they release it", async () => {
    const { fake, t } = await world();
    const H = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [H.key]);
    await sync(t);
    await logout(t);
    await login(t);
    fake.releaseGoal("ws_acme", "g_ship", [H.key]);
    await sync(t);
    const why = deny(t, H);
    assert.match(why, /paused all agents on goal/);
    assert.doesNotMatch(why, /Work resumes when they release it/);
    assert.ok(why.includes(latchWayOut(H.lid, true, "model")), why);
  });

  test("a sign-in that does not reach the workspace, then the workspace given back: told the reach changed, not that it signed in again; a re-pairing never says it signed out", async () => {
    const { fake, t } = await world({ side: true });
    const E = await shared(t);
    await sync(t);
    // A pairing that was not given Acme (still a member: `/me` names it among the person's other workspaces).
    fake.workspaces = [SIDE];
    fake.otherWorkspaces = [{ id: ACME.id, name: ACME.name }];
    await login(t);
    assert.equal(
      said(t, E),
      "Align: a new sign-in on this machine (`align login`) ended this session's share from the earlier sign-in, and this sign-in does not reach Acme, so this session can't be shared there again from here; its usage stays on this machine.",
    );
    fake.workspaces = [ACME, SIDE];
    fake.otherWorkspaces = [];
    await sync(t);
    assert.equal(said(t, E), `Align: this machine can reach Acme in Align again. To share this session there again, type \`::align share\` here (it counts toward "${GOAL}" again).`);
    const RP = await shared(t);
    await sync(t);
    await login(t);
    const rp = said(t, RP);
    assert.match(rp, /^Align: a new sign-in on this machine \(`align login`\) ended this session's share from the earlier sign-in; .* type `::align share` here/);
    assert.doesNotMatch(rp, /signed out|signed in to Align again/);
    const row = (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === E.lid);
    assert.ok(row);
  });

  test("signed in with a pairing that does not reach its workspace, `align sessions` says that rather than that this machine signed out", async () => {
    const { fake, t } = await world({ side: true });
    const E = await shared(t);
    await sync(t);
    await logout(t);
    fake.workspaces = [SIDE];
    fake.otherWorkspaces = [{ id: ACME.id, name: ACME.name }];
    await login(t);
    const row = (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === E.lid)!;
    assert.equal(row.shared, "stopped (Acme; ended at a sign-out; this sign-in does not reach its workspace)");
  });

  test("`align stop-sharing` on a stopped and held session whose share ended says its tools are unblocked now", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    stop(fake, A);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    await logout(t);
    const r = await runCli(t, ["stop-sharing", A.lid.slice(0, 8)]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Its tools are unblocked now: its stop from the web and the hold on "${GOAL}" no longer apply to session ${A.lid.slice(0, 8)}\\.`));
    assert.equal(deny(t, A), "");
  });

  test("plain `::align share` in a session that started before its folder's rule shares toward the rule's goal", async () => {
    const { t } = await world();
    const dir = path.join(t.root, "rule-later");
    const s = session(t, dir);
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    assert.match(prompt(t, s, "::align share").reason, new RegExp(`Goal: ${GOAL} \\(this folder's rule's goal\\)`));
    assert.match(prompt(t, s, "::align share confirm").reason, new RegExp(`^Align: sharing requested toward "${GOAL}"`));
  });

  test("a share that never reached the server, then a sign-out: told it was not shared, never that it stopped sharing", async () => {
    const { fake, t } = await world();
    const s = session(t);
    fake.setOffline(true);
    const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.match(r.stdout, /queued to share/);
    await logout(t);
    const msg = said(t, s);
    assert.match(msg, /^Align: this session's share had not reached the Align server yet when this machine signed out of Align, so it was not shared; .*run `align login` in a terminal, then type `::align share` here/);
    assert.doesNotMatch(msg, /stopped sharing/);
  });

  test("a device name of only marks with no letter (U+FE0F, U+034F) is blank, refused before a pairing starts", async () => {
    const { fake, t } = await world();
    const before = fake.log.filter((l) => l.path === "/api/v2/device/authorize").length;
    for (const name of ["️", "͏", "͏️ ​"]) {
      const r = await runCli(t, ["login", "--name", name]);
      assert.equal(r.code, 2, JSON.stringify(name));
      assert.match(r.stderr, /the device name was refused: it is blank/);
    }
    assert.equal(fake.log.filter((l) => l.path === "/api/v2/device/authorize").length, before);
  });

  test("the drift check does not count a reply that only lists the goal's limits; a reply that crosses one still counts", () => {
    const limit = { type: "must_not" as const, text: "Drop the old ledger cluster before the cutover" };
    assert.equal(crossing(limit, "This goal's limits are:\n- Must not: Drop the old ledger cluster before the cutover.\n- Out of scope: the billing rewrite."), false);
    assert.equal(crossing(limit, `Limits (must not): "drop the old ledger cluster before the cutover"`), false);
    assert.equal(crossing({ type: "out_of_scope", text: "The billing rewrite" }, "Out of scope: the billing rewrite."), false);
    assert.equal(crossing({ type: "must", text: "Do not drop the old ledger cluster before the cutover" }, "I will drop the old ledger cluster before the cutover now."), true);
  });

  test("declining a request in the session names which request", async () => {
    const { fake, t } = await world();
    const R = await shared(t);
    await sync(t);
    const q = fake.sendRequest("ws_acme", { type: "checkpoint", goal_id: "g_ship", session_keys: [R.key] });
    await sync(t);
    prompt(t, R);
    assert.match(prompt(t, R, `::align decline ${requestShortId(q.wire.id)}`).reason, new RegExp(`^Align: you declined Dana Lee's request to make a checkpoint \\(${requestShortId(q.wire.id)}\\); Dana Lee will see that\\.`));
  });
});
