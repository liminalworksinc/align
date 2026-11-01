// Regressions for cycle 2 of the real-behavior E2E report on the agent side (N1-N9, the leftover edges and the
// "works, but confusing" items): a replaced in-session bind never comes back, every time the CLI sends is on the
// server's clock (and a stale offset is cleared quietly), sharing while signed out is refused, a failed share's notice
// reaches the next prompt, no workspaces is not an error, login survives a transient 5xx, a re-share keeps its goal, a
// logout while the server is unreachable still revokes the device later, and losing a workspace ends its shares here.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, test } from "node:test";
import { loadCredentials, saveCredentials } from "../src/api.ts";
import type { Ctx } from "../src/context.ts";
import { nowIso } from "../src/db.ts";
import { handleDirective, type Directive } from "../src/directives.ts";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { ensureSession } from "../src/ledger.ts";
import { requestShortId } from "../src/shared/envelope.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, listSpool, localId } from "../src/shared/layout.ts";
import { rulesPath } from "../src/shared/rules.ts";
import { queueSteering } from "../src/shared/steering.ts";
import { record } from "../src/hooks/siblings.ts";
import type { FeedFile, Goal, GoalSnapshot, SpoolRecord, WireRequest } from "../src/shared/types.ts";
import { ingestSpool } from "../src/sync.ts";
import { FakeServer } from "./fake-server.ts";
import { CLI, claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, touch, usage, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);

/** NODE_OPTIONS that run a CLI or hook with this computer's clock `ms` ahead. */
function skewEnv(t: TestEnv, ms: number): NodeJS.ProcessEnv {
  const file = path.join(t.root, "skew.mjs");
  fs.writeFileSync(
    file,
    `const off = Number(process.env.SKEW_MS || 0); const R = Date;
     class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
     globalThis.Date = D;\n`,
  );
  return { NODE_OPTIONS: `--import ${pathToFileURL(file).href}`, SKEW_MS: String(ms) };
}

async function fakeWorld(extra: NodeJS.ProcessEnv = {}) {
  const fake = new FakeServer();
  await fake.start();
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  cleanups.push(() => fake.stop());
  const login = await runCli(t, ["login", "--name", "Test Mac"], extra);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t, login };
}

/** A signed-in device with one session shared toward g_ship on the fake server (as findings.test.ts). */
async function sharedWorld(extra: NodeJS.ProcessEnv = {}) {
  const { fake, t, login } = await fakeWorld(extra);
  const SID = `dddddddd-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const cwd = path.join(t.root, "repo");
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd }, extra);
  runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p0", prompt: "start", cwd }, extra);
  const share = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"], extra);
  assert.equal(share.code, 0, share.stderr);
  const ctx = ctxFor(t);
  const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
  ctx.db.close();
  return { fake, t, SID, cwd, skey, lid: localId("claude-code", SID), login, share };
}

const prompt = (t: TestEnv, sid: string, text: string, cwd?: string, extra: NodeJS.ProcessEnv = {}) =>
  json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, ...(cwd ? { cwd } : {}) }, extra).stdout);
const spooled = (t: TestEnv) => listSpool(t.home).map((f) => readJson<SpoolRecord>(f)!);

// ---------- N1: a bind the developer replaced never comes back ----------
const SHIP: GoalSnapshot = { id: "g_ship", version: 3, title: "Ship the v2 onboarding flow", status: "active", measures: [] };

function goal(id: string, title: string, extra: Partial<Goal> = {}): Goal {
  return {
    id,
    version: 1,
    title,
    measures: [],
    status: "active",
    visibility: "workspace",
    level: "team",
    owner: { id: "u_sean", name: "Sean" },
    team: null,
    anchors: { repos: [], branch_patterns: [], issues: [] },
    bindable: true,
    ...extra,
  };
}

function localWorld(feedGoals: Goal[]) {
  const t = makeEnv();
  cleanups.push(() => t.cleanup());
  const ctx = ctxFor(t);
  cleanups.push(() => ctx.db.close());
  const feed: FeedFile = { workspace_id: "ws_1", workspace_name: "Acme", version: "v1", etag: null, fetched_at: nowIso(), goals: feedGoals };
  writeJsonAtomic(layout.feed(t.home, "ws_1"), feed);
  writeJsonAtomic(layout.me(t.home), { user: { id: "u_sean", name: "Sean", email: "s@example.test" }, device: null, workspaces: [{ id: "ws_1", name: "Acme", role: "owner" }], default_workspace: "ws_1" });
  return { t, ctx };
}

function share(ctx: Ctx, sid: string): string {
  const lid = ensureSession(ctx.db, "claude-code", sid, { cwd: "/tmp/synthetic-repo", ts: nowIso() });
  ctx.db
    .prepare(
      `INSERT INTO shares(local_id, workspace_id, workspace_name, session_key, goal_id, state, from_mode, created_at, goal_json, binding_epoch, binding_goal)
       VALUES(?,?,?,?,?,'shared','start',?,?,?,?)`,
    )
    .run(lid, "ws_1", "Acme", `key-${sid}`, SHIP.id, nowIso(), JSON.stringify(SHIP), "ep_1", SHIP.id);
  renderHot(ctx, lid);
  return lid;
}

describe("E2E cycle 2: in-session binds and requests", () => {
  test("N1: two `::align bind`s in a row, the sync having recorded only the first: the second wins, and the first never opens an epoch", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title), goal("g_perf", "Cut hook latency"), goal("g_docs", "Document the hooks")]);
    const sid = "sess-two-binds";
    const lid = share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    assert.match(prompt(t, sid, "::align bind Cut").reason, /counts toward "Cut hook latency"/);
    ingestSpool(ctx); // the sync recorded the first bind: hot/ now carries it as the pending binding
    assert.equal((readJson<{ pending_binding: { goal_id: string } }>(layout.hot(t.home, lid)) as { pending_binding: { goal_id: string } }).pending_binding.goal_id, "g_perf");
    assert.match(prompt(t, sid, "::align bind Document").reason, /counts toward "Document the hooks"/);
    assert.match(prompt(t, sid, "::align status").reason, /Next prompt switches to: Document the hooks/);
    const first = prompt(t, sid, "carry on");
    assert.match(first.hookSpecificOutput.additionalContext, /^\[Align\] From this turn this session counts toward goal "Document the hooks"/);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p-second", prompt: "and again" }).stdout, "", "the replaced bind does not come back");
    assert.deepEqual(
      spooled(t).filter((r) => r.type === "epoch_open").map((r) => (r as Extract<SpoolRecord, { type: "epoch_open" }>).goal_id),
      ["g_docs"],
    );
    ingestSpool(ctx);
    assert.deepEqual((ctx.db.prepare("SELECT goal_id FROM epochs WHERE local_id=?").all(lid) as { goal_id: string }[]).map((e) => e.goal_id), ["g_docs"]);
    assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM pending_bindings").get() as { n: number }).n, 0);
    assert.equal((ctx.db.prepare("SELECT binding_goal FROM shares WHERE local_id=?").get(lid) as { binding_goal: string }).binding_goal, "g_docs");
  });

  test("confusing: declining an already-accepted request says it is already accepted; a goal not cached yet says a sync brings it", async () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title), goal("g_perf", "Cut hook latency")]);
    const sid = "sess-already";
    share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    const q: WireRequest = {
      id: `rq_${"a".repeat(24)}`,
      type: "switch_goal",
      cancelled: false,
      cancel_reason: null,
      goal: { id: SHIP.id, title: SHIP.title, version: 3 },
      target_goal: { id: "g_perf", title: "Cut hook latency", version: 1 },
      sender: { id: "u_dana", name: "Dana Lee", role: "approver" },
      note: null,
      created_at: nowIso(),
    };
    const d: Directive = { id: "dir_already_1", seq: 1, ws: "ws_1", kind: "request", session_keys: [`key-${sid}`], goal: null, binding: null, request: q, created_at: nowIso() };
    handleDirective(ctx, d);
    prompt(t, sid, "go");
    prompt(t, sid, `::align accept ${requestShortId(q.id)}`);
    assert.match(prompt(t, sid, `::align decline ${requestShortId(q.id)}`).reason, new RegExp(`the request ${requestShortId(q.id)} is already accepted by you, so it can't be declined now`));
    ingestSpool(ctx);
    const r = await runCli(t, ["requests", "decline", requestShortId(q.id)]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, new RegExp(`request ${requestShortId(q.id)} is already accepted, so it can't be declined now`));
    const miss = prompt(t, sid, "::align bind Brand new goal");
    assert.match(miss.reason, /no cached goal matches "Brand new goal" \(goals fetched \d+ s ago\)\. A goal created just now arrives with the next sync, which starts now: try again in a few seconds/);
  });

  test("confusing: the checkpoint notice offers only a decline and never says the agent does it", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title)]);
    const sid = "sess-cp";
    share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    const q: WireRequest = {
      id: `rq_${"c".repeat(24)}`,
      type: "checkpoint",
      cancelled: false,
      cancel_reason: null,
      goal: { id: SHIP.id, title: SHIP.title, version: 3 },
      target_goal: null,
      sender: { id: "u_dana", name: "Dana Lee", role: "approver" },
      note: null,
      created_at: nowIso(),
    };
    handleDirective(ctx, { id: "dir_cp_1", seq: 1, ws: "ws_1", kind: "request", session_keys: [`key-${sid}`], goal: null, binding: null, request: q, created_at: nowIso() });
    const out = prompt(t, sid, "go");
    assert.equal(
      out.systemMessage,
      `Align: Dana Lee (approver of "${SHIP.title}") asks: at the end of the current step, commit the work and summarize where things stand. It goes to the agent now as a safe step that needs no answer; unless you decline it by the end of this turn, Align reports it delivered to the agent and not declined (not that the agent did it). Run \`::align decline ${requestShortId(q.id)}\` if you don't want it, or tell the agent.`,
    );
  });

  test("confusing: a released hold is told to the model once, so it stops believing the work is paused", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title)]);
    const sid = "sess-release";
    share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    const hold = { goal: { id: SHIP.id, title: SHIP.title }, held_by: { id: "u_dana", name: "Dana Lee" }, reason: null, at: nowIso() };
    handleDirective(ctx, { id: "dir_hold_1", seq: 1, ws: "ws_1", kind: "hold", session_keys: [`key-${sid}`], goal: null, binding: null, hold, created_at: nowIso() } as Directive);
    assert.equal(json(runHook(t, "claude", "PreToolUse", { session_id: sid, tool_name: "Bash" }).stdout).hookSpecificOutput.permissionDecision, "deny");
    const release = { goal: { id: SHIP.id, title: SHIP.title }, released_by: { id: "u_dana", name: "Dana Lee" }, at: nowIso() };
    handleDirective(ctx, { id: "dir_release_1", seq: 2, ws: "ws_1", kind: "release", session_keys: [`key-${sid}`], goal: null, binding: null, hold: release, created_at: nowIso() } as Directive);
    const next = prompt(t, sid, "go on");
    assert.equal(next.hookSpecificOutput.additionalContext, `[Align] Dana Lee released the hold on goal "${SHIP.title}", so it no longer blocks tools.`);
    assert.match(next.systemMessage, /Dana Lee released the hold/);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p-r2", prompt: "again" }).stdout, "", "once");
  });

  test("confusing: on an unsupported Node a stopped session may still read, and a stopped and held one's deny names the hold", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title)]);
    const sid = "sess-old-node";
    const lid = share(ctx, sid);
    const strict = { ALIGN_ALLOW_UNSUPPORTED_NODE: "" };
    writeJsonAtomic(layout.latch(t.home, lid), { v: 1, stopped: true, directive_id: "dir_x", seq: 1, at: nowIso() });
    const read = runHook(t, "claude", "PreToolUse", { session_id: sid, tool_name: "Read" }, strict);
    const bash = json(runHook(t, "claude", "PreToolUse", { session_id: sid, tool_name: "Bash" }, strict).stdout);
    if (Number(process.versions.node.split(".")[0]) >= 24) return; // only an older Node shows the old-Node path
    assert.equal(read.stdout, "", "Read is allowed in a stopped session, as on a supported Node");
    assert.equal(bash.hookSpecificOutput.permissionDecision, "deny");
    writeJsonAtomic(layout.hold(t.home, lid), { v: 1, holds: [{ goal_id: SHIP.id, goal_title: SHIP.title, by: "Dana Lee", reason: null, directive_id: "dir_h", seq: 2, at: nowIso() }] });
    const heldRead = json(runHook(t, "claude", "PreToolUse", { session_id: sid, tool_name: "Read" }, strict).stdout);
    assert.match(heldRead.hookSpecificOutput.permissionDecisionReason, /paused all agents on goal/);
  });
});

describe("E2E cycle 2: clock", () => {
  test("N2: a clock 10 minutes ahead: the offset is learned at login, and the session's start, its epoch and its usage go up on the server's clock (nothing refused, nothing withheld)", async () => {
    const pre = makeEnv();
    cleanups.push(() => pre.cleanup());
    const skew = skewEnv(pre, 10 * 60_000);
    const { fake, t, SID, cwd, skey, lid, login } = await sharedWorld(skew);
    assert.match(login.stderr, /this computer's clock is 10 minutes ahead of the Align server's/);
    const local = Date.now() + 10 * 60_000;
    writeLines(path.join(t.claudeDir, "projects", "-repo", `${SID}.jsonl`), [
      claudeUser(SID, "p1", new Date(local + 1000).toISOString(), { cwd }),
      claudeAssistant(SID, "req_skew_1", new Date(local + 2000).toISOString(), usage(10, 5)),
    ]);
    runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p1", prompt: "go", cwd }, skew);
    const r = await runCli(t, ["sync"], skew);
    assert.equal(r.code, 0, r.stderr);
    const now = Date.now();
    assert.equal(fake.timeRefusals, 0, "no time was refused");
    const started = Date.parse(fake.sessions.get(skey)!.body.started_at);
    assert.ok(started <= now + 60_000 && started > now - 10 * 60_000, `started_at on the server's clock (${new Date(started).toISOString()})`);
    const epochs = [...fake.epochs.values()].filter((e) => e.session_key === skey);
    assert.ok(epochs.length >= 1 && epochs.every((e) => Date.parse(e.starts_at) <= now + 60_000), JSON.stringify(epochs));
    const rows = [...fake.usage.values()].filter((u) => u.session_key === skey);
    assert.equal(rows.length, 1, "the turn's usage was uploaded, not withheld");
    assert.ok(Date.parse(rows[0].ts) <= now + 60_000, `usage ts on the server's clock (${rows[0].ts})`);
    const ctx = ctxFor(t);
    assert.ok((ctx.db.prepare("SELECT synced FROM epochs WHERE local_id=?").all(lid) as { synced: number }[]).every((e) => e.synced === 1));
    ctx.db.close();
  });

  test("N2: when the offset is not known yet, a refused start or epoch teaches it and is sent again on the server's clock", async () => {
    const pre = makeEnv();
    cleanups.push(() => pre.cleanup());
    const skew = skewEnv(pre, 10 * 60_000);
    const { fake, t } = await fakeWorld(skew);
    const c = loadCredentials(t.home)!;
    delete c.clock_offset_ms;
    saveCredentials(t.home, c); // as if it had never been measured
    fake.noDate = true; // and no answer says the server's time until a time is refused
    const SID = "eeeeeeee-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: t.root }, skew);
    const shared = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"], skew);
    assert.equal(shared.code, 0, shared.stderr);
    assert.match(shared.stdout, /is shared\./);
    assert.equal(fake.timeRefusals, 1, "refused once, then accepted");
    assert.ok(Math.abs((loadCredentials(t.home)!.clock_offset_ms ?? 0) + 600_000) < 30_000);
  });

  test("N2: an epoch the server still refuses for the clock names the clock problem to the user", async () => {
    const { fake, t, SID, cwd } = await sharedWorld();
    // Every epoch from now on is refused as clock_skew, whatever time it carries.
    fake.skewEpochs = true;
    assert.match(prompt(t, SID, "::align bind Cut", cwd).reason, /counts toward "Cut hook latency"/);
    prompt(t, SID, "go on", cwd);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const told = prompt(t, SID, "and then", cwd);
    assert.match(told.systemMessage, /Align: the server refused this binding because this computer's clock is off \(starts_at is 10 minutes ahead of the server's clock; this device's clock is off\)\. Set the system clock to update automatically\./);
  });

  test("N3: a stale offset is cleared once the clock is right, with no false warning, whether the server still accepts it or refuses it", async () => {
    const { fake, t } = await fakeWorld();
    const expire = (offset: number) => {
      const c = loadCredentials(t.home)!;
      saveCredentials(t.home, { ...c, access_expires_at: new Date(Date.now() - 60_000).toISOString(), clock_offset_ms: offset });
    };
    // Within the server's 5 minutes: the refresh goes through, and the server's Date says the clock is right.
    expire(-180_006);
    const a = await runCli(t, ["goals", "--refresh"]);
    assert.equal(a.code, 0, a.stderr);
    assert.equal(a.stderr, "", "no warning");
    assert.equal(loadCredentials(t.home)!.clock_offset_ms, undefined);
    assert.doesNotMatch((await runCli(t, ["status"])).stdout, /Clock:/);
    // Outside it: the refresh is refused as clock_skew once, then signed with the right time, still with no warning.
    expire(-600_006);
    const b = await runCli(t, ["goals", "--refresh"]);
    assert.equal(b.code, 0, b.stderr);
    assert.equal(b.stderr, "", "no false \"1 minute ahead\" warning");
    assert.equal(loadCredentials(t.home)!.clock_offset_ms, undefined);
    assert.equal(fake.skewRefusals, 1);
  });
});

describe("E2E cycle 3: times on the server's clock", () => {
  /** A checkout with a remote, so the sync pass reports the session's activity. */
  const gitRepo = (dir: string) => {
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(dir, ".git", "config"), '[remote "origin"]\n\turl = https://github.example.edu/lab/c3.git\n');
  };

  test("C3-4: with a clock 10 minutes ahead that Align doesn't know about yet, activity and steering lines are refused once as clock_skew, the offset is learned, and they go up on the server's clock (none lost)", async () => {
    const { fake, t, cwd, lid } = await sharedWorld();
    gitRepo(cwd);
    const skew = skewEnv(t, 10 * 60_000);
    const c = loadCredentials(t.home)!;
    delete c.clock_offset_ms;
    saveCredentials(t.home, c);
    fake.noDate = true; // only a refusal says the server's time
    const local = new Date(Date.now() + 10 * 60_000).toISOString();
    record(t.home, lid, [{ t: "edit", at: local, p: path.join(cwd, "fast.txt") }]);
    touch(path.join(cwd, "fast.txt"), new Date(Date.parse(local) + 100)); // written on that (fast) clock
    queueSteering(t.home, { local_id: lid, workspace_id: "ws_acme", goal_id: "g_ship", suggested_goal_id: "g_perf", share: 58, target: 10, at: local });
    const r = await runCli(t, ["sync"], skew);
    assert.equal(r.code, 0, r.stderr);
    const now = Date.now();
    const edits = fake.activity.filter((a) => a.kind === "edit");
    assert.equal(edits.length, 1, "the edit reached the server");
    assert.ok(Date.parse(edits[0].at) <= now + 60_000, `activity at on the server's clock (${edits[0].at})`);
    assert.equal(fake.steeringEvents.length, 1, "the steering line reached the server");
    assert.ok(Date.parse(fake.steeringEvents[0].at) <= now + 60_000, `steering at on the server's clock (${fake.steeringEvents[0].at})`);
    assert.ok(Math.abs((loadCredentials(t.home)!.clock_offset_ms ?? 0) + 600_000) < 30_000, "the offset was learned");
    assert.match(fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8"), /clock: the server refused activity as clock_skew/);
  });

  test("C3-4: an item the server still refuses is logged with why, never dropped silently", async () => {
    const { fake, t, cwd, lid, skey } = await sharedWorld();
    gitRepo(cwd);
    fake.sessions.delete(skey); // the server no longer has the share
    queueSteering(t.home, { local_id: lid, workspace_id: "ws_acme", goal_id: "g_ship", suggested_goal_id: "g_perf", share: 58, target: 10, at: nowIso() });
    record(t.home, lid, [{ t: "edit", at: nowIso(), p: path.join(cwd, "a.txt") }]);
    touch(path.join(cwd, "a.txt"));
    await runCli(t, ["sync"]);
    const log = fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8");
    assert.match(log, /activity: the server refused 1 of 1 \(not_shared\)/);
    assert.match(log, /steering lines: the server refused 1 of 1 \(not_shared\)/);
  });

  test("C3-5: usage recorded while the clock ran 10 minutes ahead and sent after it was corrected goes up on its epoch's offset, inside its epoch", async () => {
    const pre = makeEnv();
    cleanups.push(() => pre.cleanup());
    const skew = skewEnv(pre, 10 * 60_000);
    const { fake, t, SID, cwd, skey } = await sharedWorld(skew);
    const local = Date.now() + 10 * 60_000;
    writeLines(path.join(t.claudeDir, "projects", "-repo", `${SID}.jsonl`), [
      claudeUser(SID, "p1", new Date(local + 1000).toISOString(), { cwd }),
      claudeAssistant(SID, "req_c35_1", new Date(local + 2000).toISOString(), usage(10, 5)),
    ]);
    runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p1", prompt: "go", cwd }, skew);
    // The clock is corrected (NTP on reconnect) before the rows go up: this pass runs on the right clock.
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    const now = Date.now();
    const epoch = [...fake.epochs.values()].filter((e) => e.session_key === skey).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
    const rows = [...fake.usage.values()].filter((u) => u.session_key === skey);
    assert.equal(rows.length, 1, "uploaded");
    assert.ok(Date.parse(rows[0].ts) <= now + 60_000, `not in the future (${rows[0].ts})`);
    assert.ok(Date.parse(rows[0].ts) >= Date.parse(epoch.starts_at), `inside its epoch (${rows[0].ts} >= ${epoch.starts_at})`);
  });

  test("C3-5: with a clock 7 minutes behind and no offset known, a session's first start goes up on the server's clock (the pass measures the clock before its first time)", async () => {
    const { fake, t } = await fakeWorld();
    const slow = skewEnv(t, -7 * 60_000);
    const c = loadCredentials(t.home)!;
    delete c.clock_offset_ms;
    saveCredentials(t.home, c);
    const SID = "ffffffff-c350-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: t.root }, slow);
    // Shared in the session; the sync pass's first call is the session's PUT.
    assert.match(prompt(t, SID, "::align share Ship the v2 confirm", t.root, slow).reason, /sharing requested toward "Ship the v2 onboarding flow"/);
    const r = await runCli(t, ["sync"], slow);
    assert.equal(r.code, 0, r.stderr);
    const ctx = ctxFor(t);
    const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    ctx.db.close();
    const started = Date.parse(fake.sessions.get(skey)!.body.started_at);
    assert.ok(started > Date.now() - 2 * 60_000, `started_at on the server's clock, not 7 minutes early (${new Date(started).toISOString()})`);
  });
});

describe("E2E cycle 3: CLI output", () => {
  test("C3-7: output into a pipe that closed ends quietly (no EPIPE stack trace)", async () => {
    const { t } = await sharedWorld();
    const p = spawn(process.execPath, [CLI, "status"], { env: t.env, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.destroy(); // `| head -0`: the reader is gone before the first line
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    const code = await new Promise<number | null>((r) => p.on("close", r));
    assert.doesNotMatch(stderr, /EPIPE|at out \(/, stderr);
    assert.equal(code, 0, stderr);
  });

  test("C3-8: `align share <session> --yes` that the server refuses says why and what to do on stderr and exits 1, never \"is error.\"", async () => {
    const { fake, t, cwd } = await sharedWorld();
    const SID = "c3c3c3c3-8888-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
    const ctx = ctxFor(t);
    const key = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    ctx.db.close();
    // Another (never revoked) device holds this session key.
    fake.sessions.set(key, { ws: "ws_acme", device: "dv_old", body: { harness: "claude-code", started_at: nowIso() }, state: "shared" });
    const r = await runCli(t, ["share", SID.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 1, `${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /is error/);
    assert.match(r.stderr, /^align: session [\w-]{8} was not shared: sharing failed \(not_found\): the server did not take this session from this machine\. .*revoke the old device at http:\/\/127\.0\.0\.1:\d+\/app\/devices/m);
  });
});

describe("E2E cycle 3: a web Resume is told", () => {
  test("a stop lifted from the web is told at the next prompt, once: the user gets a notice and the model a context line", async () => {
    const { fake, t, SID, cwd, skey } = await sharedWorld();
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(json(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout).hookSpecificOutput.permissionDecision, "deny");
    prompt(t, SID, "still there?", cwd);
    fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [skey], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const told = prompt(t, SID, "go on", cwd);
    assert.match(told.systemMessage, /Align: this session was resumed from its Align workspace, so its tools work again\./);
    assert.match(told.hookSpecificOutput.additionalContext, /\[Align\] This session was resumed from its Align workspace, so its tools are no longer blocked\./);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p-res", prompt: "again", cwd }).stdout, "", "once");
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout, "", "tools run");
  });
});

describe("E2E cycle 3: a refused edit", () => {
  test("C3-9: an edit the user refused at the permission check is reported neither to a sibling session nor to the team; one that ran is", async () => {
    const { fake, t, SID, cwd } = await sharedWorld();
    fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".git", "config"), '[remote "origin"]\n\turl = https://github.example.edu/lab/c3.git\n');
    // Session A: one shell write the user refuses (the file never appears), one edit that runs.
    runHook(t, "claude", "PreToolUse", { session_id: SID, cwd, tool_name: "Bash", tool_input: { command: "echo skew-one > s1.txt" } });
    runHook(t, "claude", "PreToolUse", { session_id: SID, cwd, tool_name: "Write", tool_input: { file_path: path.join(cwd, "ran.txt") } });
    touch(path.join(cwd, "ran.txt"));
    // A sibling toward the same goal starts in the folder.
    const SID2 = "c3c3c3c3-9999-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID2, source: "startup", cwd });
    assert.equal((await runCli(t, ["share", SID2.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const card = JSON.stringify(prompt(t, SID2, "go", cwd) ?? {});
    assert.match(card, /edited ran\.txt/);
    assert.doesNotMatch(card, /s1\.txt/, "the refused write is not reported as made");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const paths = fake.activity.filter((a) => a.kind === "edit").map((a) => a.path_hash);
    assert.equal(paths.length, 1, `only the edit that ran goes up (${JSON.stringify(fake.activity)})`);
  });
});

describe("E2E cycle 2: sign-out, sharing and workspaces", () => {
  test("N4: `::align share` while signed out is refused, and a folder rule leaves the session private, with no pile of contradictory notices", async () => {
    const { fake, t, cwd } = await sharedWorld();
    fake.revokeAll();
    const loggedOut = await runCli(t, ["goals", "--refresh"]);
    assert.notEqual(loggedOut.code, 0);
    await runCli(t, ["sync"]);
    const SID = "ffffffff-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
    assert.equal(prompt(t, SID, "::align share confirm", cwd).reason, "Align: not signed in on this machine. Run `align login` in a terminal first.");
    assert.equal(spooled(t).filter((r) => r.type === "command").length, 0, "nothing spooled");
    // A folder rule: the session stays private and the developer hears why, once.
    assert.equal((await runCli(t, ["share", "--dir", cwd, "--workspace", "Acme", "--goal", "none", "--yes"])).code, 2, "the CLI needs a sign-in for a rule");
    writeJsonAtomic(rulesPath(t.home), { v: 1, rules: [{ dir: fs.realpathSync(cwd), workspace_id: "ws_acme", workspace_name: "Acme", goal_id: null, goal_title: null, signals: false, created_at: nowIso() }] });
    const start = json(runHook(t, "claude", "SessionStart", { session_id: "gggggggg-1111-2222-3333-444444444444", source: "startup", cwd }).stdout);
    assert.match(start.systemMessage, /this folder is shared with Acme, but this machine is signed out of Align, so this session stays private/);
    await runCli(t, ["sync"]);
    const ctx = ctxFor(t);
    assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM shares WHERE local_id=?").get(localId("claude-code", "gggggggg-1111-2222-3333-444444444444")) as { n: number }).n, 0);
    ctx.db.close();
  });

  test("N5: a share the server refuses tells the session at its next prompt, with what to do", async () => {
    const { fake, t, cwd } = await sharedWorld();
    const SID = "hhhhhhhh-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
    const ctx = ctxFor(t);
    const key = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    ctx.db.close();
    // Another device holds this session key (the old pairing was never revoked).
    fake.sessions.set(key, { ws: "ws_acme", device: "dv_old", body: { harness: "claude-code", started_at: nowIso() }, state: "shared" });
    prompt(t, SID, "::align share confirm", cwd);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const told = prompt(t, SID, "go on", cwd);
    assert.match(told.systemMessage, /^Align: sharing failed \(not_found\): the server did not take this session from this machine\. .*revoke the old device at http:\/\/127\.0\.0\.1:\d+\/app\/devices, then type `::align share` here again\. This session stays private\.$/);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p-n5", prompt: "again", cwd }).stdout, "", "once");
  });

  test("N6: with no workspace in reach, `align goals`, `align allocation`, `align asks` and `align steering status` say so instead of failing", async () => {
    const { fake, t } = await fakeWorld();
    fake.workspaces = [];
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    for (const args of [["goals"], ["allocation"], ["asks"], ["steering", "status"]]) {
      const r = await runCli(t, args);
      assert.equal(r.code, 0, `${args.join(" ")}: ${r.stderr}`);
      assert.doesNotMatch(r.stderr, /undefined/);
      assert.match(r.stdout, /No workspaces on this device/);
    }
  });

  test("N7: `align login` keeps polling through a transient 502 and finishes signed in", async () => {
    const fake = new FakeServer();
    await fake.start();
    cleanups.push(() => fake.stop());
    fake.failTokenPolls = 2;
    const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
    cleanups.push(() => t.cleanup());
    const r = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Signed in as Sean/);
    assert.equal(fake.devices.size, 1);
  });

  test("N8 + N9 + asks: after logout and login, `::align share confirm` shares toward the goal the session had; status names the person as the server says now", async () => {
    const { fake, t, SID, cwd } = await sharedWorld();
    fake.addAsk("ws_acme", { id: "ask_1", text: "Keep the old flow readable", state: "accepted" });
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const told = prompt(t, SID, "hello", cwd);
    assert.match(told.systemMessage, /then type `::align share` here \(it counts toward "Ship the v2 onboarding flow" again\)\./);
    assert.match((await runCli(t, ["status"])).stdout, /Identity: {3}signed out \(you ran `align logout`\); local metering only/);
    fs.rmSync(layout.asksFeed(t.home, "ws_acme"), { force: true });
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    assert.ok(fs.existsSync(layout.asksFeed(t.home, "ws_acme")), "login caches the asks feed, so the first session's envelope has them");
    const reply = prompt(t, SID, "::align share confirm", cwd).reason;
    assert.equal(reply, 'Align: sharing requested toward "Ship the v2 onboarding flow". It takes effect within a few seconds; your next prompt carries the goal.');
    const cmd = spooled(t).find((r) => r.type === "command") as Extract<SpoolRecord, { type: "command" }>;
    assert.equal(cmd.arg, "g_ship");
    fake.user = { ...fake.user, name: "Sean Renamed" };
    await runCli(t, ["sync"]);
    assert.match((await runCli(t, ["status"])).stdout, /Identity: {3}Sean Renamed <sean@example\.test>/);
  });

  test("C3-6: on a device with two workspaces and no default, `::align share confirm` after logout and login shares toward the goal it had, in its workspace", async () => {
    const fake = new FakeServer();
    await fake.start();
    cleanups.push(() => fake.stop());
    fake.workspaces = [...fake.workspaces, { id: "ws_side", name: "Side Co", role: "owner", teams: [] }];
    fake.goals.set("ws_side", []);
    const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
    cleanups.push(() => t.cleanup());
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    assert.equal(readJson<{ default_workspace: string | null }>(layout.me(t.home))?.default_workspace, null, "no default workspace");
    const SID = "c3c3c3c3-1111-2222-3333-444444444444";
    const cwd = path.join(t.root, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
    assert.equal((await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    const reply = prompt(t, SID, "::align share confirm", cwd).reason;
    assert.equal(reply, 'Align: sharing requested toward "Ship the v2 onboarding flow". It takes effect within a few seconds; your next prompt carries the goal.');
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.match((await runCli(t, ["sessions"])).stdout, /shared \(Acme\)/);
    const told = prompt(t, SID, "go on", cwd);
    assert.doesNotMatch(JSON.stringify(told ?? {}), /share failed/);
    // A session that never had a workspace can't tell which: it says so instead of claiming a share.
    const SID2 = "c3c3c3c3-1111-2222-3333-555555555555";
    runHook(t, "claude", "SessionStart", { session_id: SID2, source: "startup", cwd });
    assert.match(prompt(t, SID2, "::align share confirm", cwd).reason, /more than one workspace and none is the default/);
  });

  test("logout while the server is unreachable: the device is revoked at the next sync that reaches it, `align status` says a revoke is pending until then", async () => {
    const { fake, t } = await sharedWorld();
    const old = loadCredentials(t.home)!.device_id;
    fake.setOffline(true);
    const out = await runCli(t, ["logout"]);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stderr, /could not reach .* to revoke this device\. Align revokes it the next time it reaches the server \(the next `align sync` or `align login`\)/);
    assert.equal((fs.statSync(layout.pendingRevoke(t.home)).mode & 0o777).toString(8), "600");
    assert.ok(!fs.existsSync(layout.deviceKey(t.home)), "the device key is gone from its usual place");
    assert.match((await runCli(t, ["status"])).stdout, new RegExp(`Revoke: {5}pending for device ${old}, signed out .* the next \`align sync\` or \`align login\` revokes it`));
    const still = await runCli(t, ["sync"]);
    assert.equal(still.code, 0);
    assert.ok(fs.existsSync(layout.pendingRevoke(t.home)), "kept while the server is unreachable");
    fake.setOffline(false);
    assert.ok(!fake.devices.get(old)!.revoked);
    const back = await runCli(t, ["sync"]);
    assert.match(back.stdout, /Revoked the device this machine signed out of/);
    assert.ok(fake.devices.get(old)!.revoked, "revoked on the server");
    assert.ok(!fs.existsSync(layout.pendingRevoke(t.home)));
    assert.doesNotMatch((await runCli(t, ["status"])).stdout, /Revoke:/);
  });

  test("logout while the server is unreachable, then `align login`: the old device is revoked first (an expired access token is refreshed with the old key to do it)", async () => {
    const { fake, t } = await sharedWorld();
    const old = loadCredentials(t.home)!.device_id;
    fake.setOffline(true);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    fake.setOffline(false);
    const p = JSON.parse(fs.readFileSync(layout.pendingRevoke(t.home), "utf8"));
    fs.writeFileSync(layout.pendingRevoke(t.home), JSON.stringify({ ...p, access_expires_at: new Date(Date.now() - 60_000).toISOString() }), { mode: 0o600 });
    const before = fake.log.length;
    const login = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(login.code, 0, login.stderr);
    assert.match(login.stdout, new RegExp(`Revoked device ${old}`));
    assert.ok(fake.devices.get(old)!.revoked);
    const calls = fake.log.slice(before).map((l) => `${l.method} ${l.path}`);
    assert.ok(calls.indexOf("DELETE /api/v2/devices/self") < calls.indexOf("POST /api/v2/device/authorize"), calls.join(", "));
    assert.ok(calls.includes("POST /api/v2/device/refresh"), "the old key signed a refresh for a fresh access token");
  });

  test("removed from the workspace: the next contact ends the share here with a notice, the stop latch stays until `align stop-sharing`, cached goals go", async () => {
    const { fake, t, SID, cwd, skey, lid } = await sharedWorld();
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [];
    writeLines(path.join(t.claudeDir, "projects", "-repo", `${SID}.jsonl`), [
      claudeUser(SID, "p1", new Date(Date.now() + 1000).toISOString(), { cwd }),
      claudeAssistant(SID, "req_rm_1", new Date(Date.now() + 2000).toISOString(), usage(10, 5)),
    ]);
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match((await runCli(t, ["sessions"])).stdout, /stopped \(Acme; no access to the workspace\)/);
    const told = prompt(t, SID, "hello", cwd);
    assert.match(told.systemMessage, /this session stopped sharing because you no longer have access to Acme in Align \(you were removed from it or left it\).*tools stay blocked until you run `align stop-sharing [\w-]{8}`/);
    const deny = json(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout);
    assert.match(deny.hookSpecificOutput.permissionDecisionReason, /this machine no longer has access to its Align workspace.*`align stop-sharing [\w-]{8}`/);
    assert.ok(!fs.existsSync(layout.feed(t.home, "ws_acme")), "no cached goals of a workspace out of reach");
    const resumed = json(runHook(t, "claude", "SessionStart", { session_id: SID, source: "resume", cwd }).stdout);
    assert.ok(!resumed?.hookSpecificOutput?.additionalContext, "no goal envelope for a session that no longer counts toward it");
    assert.equal((await runCli(t, ["stop-sharing", lid.slice(0, 8)])).code, 0);
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout, "");
  });

  test("confusing: `align sync` against an unreachable server prints no \"0 sent\" line above the error", async () => {
    const { fake, t } = await sharedWorld();
    fake.setOffline(true);
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.stdout, /^Server:/m);
    assert.match(r.stderr, /could not reach the Align server/);
  });
});
