// Regressions for the real-behavior E2E report on the agent side (findings B1-B9, G1-G3): directive intake past
// replays, in-session binds that apply at the very next prompt, a skewed clock that keeps the pairing, logout ending
// shares (and the way out of a latch nothing can lift), an unreachable server that is visible, install backups, the
// Node check, and a mid-session bind that carries the goal's limits.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, test } from "node:test";
import { loadCredentials, saveCredentials } from "../src/api.ts";
import type { Ctx } from "../src/context.ts";
import { kvGet, kvSet, nowIso } from "../src/db.ts";
import { handleDirective, type Directive } from "../src/directives.ts";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { ensureSession } from "../src/ledger.ts";
import { requestShortId } from "../src/shared/envelope.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, listSpool, localId } from "../src/shared/layout.ts";
import type { FeedFile, Goal, GoalSnapshot, HotState, SpoolRecord, WireRequest } from "../src/shared/types.ts";
import { ingestSpool } from "../src/sync.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);

/** A signed-in device with one session shared toward g_ship on the fake server. */
async function sharedWorld(sid?: string) {
  const fake = new FakeServer();
  await fake.start();
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  cleanups.push(() => fake.stop());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  const SID = sid ?? `cccccccc-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const cwd = path.join(t.root, "repo");
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p0", prompt: "start", cwd });
  const share = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(share.code, 0, share.stderr);
  assert.match(share.stdout, /is shared\./);
  const ctx = ctxFor(t);
  const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
  ctx.db.close();
  return { fake, t, SID, cwd, skey, lid: localId("claude-code", SID) };
}

/** A Claude Code session id whose local id starts with `prefix` (base64url: one in 64 starts with "-"). */
function sidWithLocalPrefix(prefix: string): string {
  for (let i = 0; ; i++) {
    const sid = `dddddddd-1111-2222-3333-${i.toString(16).padStart(12, "0")}`;
    if (localId("claude-code", sid).startsWith(prefix)) return sid;
  }
}

const directiveGets = (fake: FakeServer) => fake.log.filter((l) => l.method === "GET" && l.path === "/api/v2/directives").length;

describe("E2E findings: server side of the agent", () => {
  test("B1: a regressed cursor moves past stored directives and honours next_cursor; a stop after them is enforced; the count is what was processed", async () => {
    const { fake, t, SID, skey, lid } = await sharedWorld();
    for (let i = 0; i < 110; i++) fake.pushDirective({ ws: "ws_acme", kind: i % 2 ? "resume" : "stop", session_keys: [skey], goal: null, binding: null });
    const first = await runCli(t, ["sync"]);
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /110 directives/);
    let ctx = ctxFor(t);
    const top = Number(kvGet(ctx.db, "directive_cursor"));
    assert.equal(top, fake.directives.at(-1)!.seq);
    // A restored database: the cursor goes back to 0, so the server sends the 110 stored ones again.
    kvSet(ctx.db, "directive_cursor", "0");
    ctx.db.close();
    const stop = fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    const gets0 = directiveGets(fake);
    const second = await runCli(t, ["sync"]);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /, 1 directives,/, "only the new stop counts");
    assert.ok(directiveGets(fake) - gets0 <= 2, `pages of replays are not refetched (${directiveGets(fake) - gets0} GETs)`);
    assert.ok(fs.existsSync(layout.latch(t.home, lid)), "the stop latched");
    assert.ok(fake.receipts.some((r) => r.id === stop.id && r.state === "enforced"), "and was acknowledged enforced");
    ctx = ctxFor(t);
    assert.equal(Number(kvGet(ctx.db, "directive_cursor")), stop.seq);
    ctx.db.close();
    const deny = json(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash" }).stdout);
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    const gets1 = directiveGets(fake);
    const third = await runCli(t, ["sync"]);
    assert.match(third.stdout, /, 0 directives,/);
    assert.equal(directiveGets(fake) - gets1, 1, "an empty page ends the poll");
  });

  test("B5: an unreachable server makes `align sync` exit 1 naming the server URL, shows in `align status`, and is logged", async () => {
    const { fake, t } = await sharedWorld();
    fake.setOffline(true);
    const down = await runCli(t, ["sync"]);
    assert.equal(down.code, 1, down.stdout);
    assert.match(down.stderr, new RegExp(`align: could not reach the Align server at ${fake.url.replace(/[.]/g, "\\.")} \\(`));
    assert.match(down.stderr, /stay on this machine; the next sync retries/);
    const status = await runCli(t, ["status"]);
    assert.match(status.stdout, /Server: {5}unreachable since .*: could not reach the Align server at http:\/\/127\.0\.0\.1:\d+/);
    const log = fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8");
    assert.match(log, /sync: could not reach the Align server at http:\/\/127\.0\.0\.1:\d+/);
    fake.setOffline(false);
    const up = await runCli(t, ["sync"]);
    assert.equal(up.code, 0, up.stderr);
    assert.doesNotMatch((await runCli(t, ["status"])).stdout, /unreachable/);
    assert.match(fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8"), /sync: the server is reachable again/);
  });

  test("B3: a clock 10 minutes off keeps the pairing: the refresh signs with the server's time, says how far off the clock is, and remembers it", async () => {
    const { fake, t } = await sharedWorld();
    const skew = path.join(t.root, "skew.mjs");
    fs.writeFileSync(
      skew,
      `const off = Number(process.env.SKEW_MS || 0); const R = Date;
       class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
       globalThis.Date = D;\n`,
    );
    const skewed = { NODE_OPTIONS: `--import ${pathToFileURL(skew).href}`, SKEW_MS: String(10 * 60_000) };
    const expire = () => {
      const c = loadCredentials(t.home)!;
      saveCredentials(t.home, { ...c, access_expires_at: new Date(Date.now() - 60_000).toISOString() });
    };
    expire();
    const r = await runCli(t, ["goals", "--refresh"], skewed);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /this computer's clock is 10 minutes ahead of the Align server's\. Align used the server's time and you stay signed in/);
    const c = loadCredentials(t.home)!;
    assert.ok(!c.signed_out && c.refresh_token, "still signed in");
    assert.ok(Math.abs((c.clock_offset_ms ?? 0) + 600_000) < 30_000, `offset remembered (${c.clock_offset_ms})`);
    assert.equal(fake.skewRefusals, 1);
    assert.equal(fake.refreshes, 1);
    assert.match((await runCli(t, ["status"], skewed)).stdout, /Clock: {6}this computer's clock is 10 minutes ahead of the server's/);
    // The next refresh signs with the remembered offset: no refusal.
    expire();
    assert.equal((await runCli(t, ["goals", "--refresh"], skewed)).code, 0);
    assert.equal(fake.skewRefusals, 1);
    assert.equal(fake.refreshes, 2);
  });

  test("B4/G2/B6: logout ends this machine's shares (never listed as shared again), tells the session, and a stopped session's deny says how to get out", async () => {
    const { fake, t, SID, cwd, skey, lid } = await sharedWorld();
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.ok(fs.existsSync(layout.latch(t.home, lid)));
    const out = await runCli(t, ["logout"]);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /1 shared session\(s\) stopped sharing\. Sessions stopped from the web stay blocked until you run `align stop-sharing <session>`/);
    const sessions = await runCli(t, ["sessions"]);
    assert.doesNotMatch(sessions.stdout, /shared \(Acme\)/);
    assert.match(sessions.stdout, /stopped \(Acme; this machine signed out\)/);
    // Fail closed: still stopped, and the deny says the only way out.
    const id8 = lid.slice(0, 8);
    const deny = json(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout);
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    assert.match(deny.hookSpecificOutput.permissionDecisionReason, new RegExp(`this machine signed out of Align.*can no longer be lifted from the web: tools stay blocked until the user runs \`align stop-sharing ${id8}\``));
    assert.doesNotMatch(deny.hookSpecificOutput.permissionDecisionReason, /until it is resumed there/);
    const told = json(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p9", prompt: "go on", cwd }).stdout);
    assert.match(told.systemMessage, /this session stopped sharing because this machine signed out of Align.*run `align login` in a terminal, then type `::align share` here/);
    assert.match(told.systemMessage, new RegExp(`tools stay blocked until you run \`align stop-sharing ${id8}\``));
    assert.match((await runCli(t, ["latch", "status"])).stdout, new RegExp(`STOPPED \\(tools blocked\\).*sharing ended \\(this machine signed out\\), so only \`align stop-sharing ${id8}\` unblocks it`));
    assert.match((await runCli(t, ["status"])).stdout, /Stop latch: 1 session\(s\) stopped; 1 can't be lifted from the web any more/);
    assert.match(json(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p10", prompt: "::align status", cwd }).stdout).reason, new RegExp(`sharing ended, so run \`align stop-sharing ${id8}\``));
    // Signing in again does not bring the old share back as shared.
    const relogin = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(relogin.code, 0, `${relogin.stdout}\n${relogin.stderr}`);
    assert.doesNotMatch((await runCli(t, ["sessions"])).stdout, /shared \(Acme\)/);
    // The way out works.
    assert.equal((await runCli(t, ["stop-sharing", id8])).code, 0);
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout, "");
  });

  test("a session whose id starts with \"-\": the `align stop-sharing <id>` the deny names works, and so do the other commands that take a session", async () => {
    // The B4/G2/B6 flake: its random session id gave a local id starting with "-" one run in 64, and the CLI read the
    // printed prefix as an unknown option (exit 1).
    const { fake, t, SID, cwd, skey, lid } = await sharedWorld(sidWithLocalPrefix("-"));
    const id8 = lid.slice(0, 8);
    assert.ok(id8.startsWith("-"), id8);
    // "--" too, and a session the hooks only spooled so far: `share` reads it as the session, not an unknown option.
    const SID2 = sidWithLocalPrefix("--");
    runHook(t, "claude", "SessionStart", { session_id: SID2, source: "startup", cwd });
    const two = await runCli(t, ["share", localId("claude-code", SID2).slice(0, 8), "--workspace", "Acme", "--goal", "none", "--yes"]);
    assert.equal(two.code, 0, `${two.stdout}\n${two.stderr}`);
    assert.match(two.stdout, /is shared\./);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const deny = json(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout);
    assert.ok(deny.hookSpecificOutput.permissionDecisionReason.includes(`runs \`align stop-sharing ${id8}\``));
    for (const args of [["requests", "--session", id8], ["requests", `--session=${id8}`], ["delete-history", id8, "--yes"]]) {
      const r = await runCli(t, args);
      assert.equal(r.code, 0, `${args.join(" ")}: ${r.stdout}\n${r.stderr}`);
    }
    const bind = await runCli(t, ["bind", id8, "--goal", "none"]);
    assert.match(bind.stderr, /session is not shared/, "the id resolves to the session (which signed out)");
    // An option the command doesn't have is still refused as one.
    const bogus = await runCli(t, ["stop-sharing", "--bogus"]);
    assert.equal(bogus.code, 1);
    assert.match(bogus.stderr, /Unknown option '--bogus'/);
    const out = await runCli(t, ["stop-sharing", id8]);
    assert.equal(out.code, 0, `${out.stdout}\n${out.stderr}`);
    assert.match(out.stdout, /Stopped sharing\./);
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", cwd }).stdout, "", "unblocked");
  });

  test("B4: a new `align login` over a live pairing revokes the old device and ends its shares", async () => {
    const { fake, t } = await sharedWorld();
    const old = loadCredentials(t.home)!.device_id;
    const again = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /1 session\(s\) shared from this machine's earlier sign-in stopped sharing/);
    assert.ok(fake.devices.get(old)!.revoked, "the old device is revoked on the server");
    assert.notEqual(loadCredentials(t.home)!.device_id, old);
    assert.doesNotMatch((await runCli(t, ["sessions"])).stdout, /shared \(Acme\)/);
  });
});

// ---------- hooks: in-session binds (B2) and the bound goal's limits (G3) ----------
const LIMITS = [
  { id: "l1", type: "must_not" as const, text: "Hooks must not touch the network." },
  { id: "l2", type: "must" as const, text: "Every hook must exit within 300 ms." },
  { id: "l3", type: "out_of_scope" as const, text: "Rewriting the sync pass is out of scope." },
];
const SHIP: GoalSnapshot = { id: "g_ship", version: 3, title: "Ship the v2 onboarding flow", status: "active", measures: [{ id: "m1", text: "First shared session in 10 minutes", target: null }] };

function goal(id: string, title: string, extra: Partial<Goal> = {}): Goal {
  return {
    id,
    version: 1,
    title,
    measures: [{ id: `${id}_m`, text: `${title} measured`, target: null }],
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

const spooled = (t: TestEnv) => listSpool(t.home).map((f) => readJson<SpoolRecord>(f)!);
const say = (t: TestEnv, sid: string, prompt: string, id = `p${Math.random()}`) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: id, prompt, cwd: "/tmp/synthetic-repo" }).stdout);

function switchRequest(target: { id: string; title: string }): WireRequest {
  return {
    id: `rq_${"s".repeat(24)}`,
    type: "switch_goal",
    cancelled: false,
    cancel_reason: null,
    goal: { id: SHIP.id, title: SHIP.title, version: SHIP.version },
    target_goal: { ...target, version: 1 },
    sender: { id: "u_dana", name: "Dana Lee", role: "approver" },
    note: null,
    created_at: nowIso(),
  };
}

describe("E2E findings: in-session binding", () => {
  test("B2 + G3: `::align bind` takes effect at the very next prompt with no sync in between, with the goal's full limits; the sync records that same binding once", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title), goal("g_perf", "Cut hook latency", { limits: LIMITS })]);
    const sid = "sess-bind-now";
    const lid = share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    assert.match(say(t, sid, "::align bind Cut").reason, /from your next prompt this session counts toward "Cut hook latency"/);
    // No sync runs before the next prompt.
    const next = say(t, sid, "carry on", "p-next");
    const c = next.hookSpecificOutput.additionalContext as string;
    assert.match(c, /^\[Align\] From this turn this session counts toward goal "Cut hook latency" \(v1, active\)\./);
    for (const l of LIMITS) assert.ok(c.includes(l.text), `limit "${l.text}" in context`);
    assert.match(c, /Limits set in this goal version by the people who approve it/);
    assert.doesNotMatch(c, /they come with the goal context/);
    const epoch = spooled(t).find((r) => r.type === "epoch_open") as Extract<SpoolRecord, { type: "epoch_open" }>;
    const cmd = spooled(t).find((r) => r.type === "command") as Extract<SpoolRecord, { type: "command" }>;
    assert.equal(epoch.goal_id, "g_perf");
    assert.equal(epoch.root_turn, "p-next");
    assert.equal(epoch.pending_id, cmd.pending_id, "the hook and the sync record one binding");
    ingestSpool(ctx);
    const epochs = ctx.db.prepare("SELECT goal_id, root_turn, cause FROM epochs WHERE local_id=? ORDER BY created_at").all(lid) as { goal_id: string; root_turn: string; cause: string }[];
    assert.deepEqual(epochs.map((e) => `${e.goal_id}@${e.root_turn}:${e.cause}`), ["g_perf@p-next:manual"]);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM pending_bindings").get()!.n, 0, "nothing left to open a second epoch");
    assert.equal((readJson<HotState>(layout.hot(t.home, lid)) as HotState).goal?.id, "g_perf");
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p-after", prompt: "and again", cwd: "/tmp/synthetic-repo" }).stdout, "", "told once");
  });

  test("B2: `::align accept` of a switch_goal moves the session at the very next prompt, and the accepted line never comes before the move", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title), goal("g_perf", "Cut hook latency")]);
    const sid = "sess-accept-now";
    const lid = share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    const q = switchRequest({ id: "g_perf", title: "Cut hook latency" });
    const d: Directive = { id: "dir_switch_1", seq: 1, ws: "ws_1", kind: "request", session_keys: [`key-${sid}`], goal: null, binding: null, request: q, created_at: nowIso() };
    handleDirective(ctx, d);
    assert.match(say(t, sid, "go").systemMessage, /asks: move this session/);
    assert.match(say(t, sid, `::align accept ${requestShortId(q.id)}`).reason, /From your next prompt this session counts toward "Cut hook latency"/);
    const next = say(t, sid, "carry on", "p-move");
    const lines = (next.hookSpecificOutput.additionalContext as string).split("\n");
    assert.match(lines[0], /^\[Align\] From this turn this session counts toward goal "Cut hook latency"/);
    assert.ok(lines.includes(`[Align] The developer accepted Dana Lee's request to move this session to goal "Cut hook latency".`), lines.join("\n"));
    const epoch = spooled(t).find((r) => r.type === "epoch_open") as Extract<SpoolRecord, { type: "epoch_open" }>;
    assert.equal(epoch.cause, "directive:dir_switch_1");
    ingestSpool(ctx);
    const epochs = ctx.db.prepare("SELECT goal_id, cause FROM epochs WHERE local_id=?").all(lid) as { goal_id: string; cause: string }[];
    assert.deepEqual(epochs.map((e) => `${e.goal_id}:${e.cause}`), ["g_perf:directive:dir_switch_1"]);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM pending_bindings").get()!.n, 0);
    assert.equal(ctx.db.prepare("SELECT state FROM goal_requests").get()!.state, "accepted");
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p-after", prompt: "again", cwd: "/tmp/synthetic-repo" }).stdout, "", "each line once");
  });

  test("B2: when the target goal is not cached yet, accepting says so and the model hears nothing until the session has moved", () => {
    const { t, ctx } = localWorld([goal("g_ship", SHIP.title)]);
    const sid = "sess-accept-later";
    share(ctx, sid);
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup" });
    const q = switchRequest({ id: "g_new", title: "A goal not fetched yet" });
    handleDirective(ctx, { id: "dir_switch_2", seq: 1, ws: "ws_1", kind: "request", session_keys: [`key-${sid}`], goal: null, binding: null, request: q, created_at: nowIso() });
    say(t, sid, "go");
    assert.match(say(t, sid, `::align accept ${requestShortId(q.id)}`).reason, /moves to "A goal not fetched yet" at the first prompt after Align has fetched that goal/);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p1", prompt: "go on", cwd: "/tmp/synthetic-repo" }).stdout, "", "no accepted line before the binding moved");
    ingestSpool(ctx);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: "p2", prompt: "go on", cwd: "/tmp/synthetic-repo" }).stdout, "", "still not moved: the goal has no snapshot yet");
  });
});

describe("E2E findings: install, Node, warnings", () => {
  test("B8: a reinstall that changes nothing leaves no Codex backup, and uninstall removes the backups Align made", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    const hooksFile = path.join(t.codexHome, "hooks.json");
    fs.writeFileSync(hooksFile, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } }, null, 2));
    const backups = () => fs.readdirSync(t.codexHome).filter((f) => f.startsWith("hooks.json.align-backup-"));
    assert.equal((await runCli(t, ["install"])).code, 0);
    assert.equal(backups().length, 1, "the first install backs up the user's file");
    const again = await runCli(t, ["install"]);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /Codex hooks in .* are already up to date/);
    assert.equal(backups().length, 1, "nothing changed, so no new backup");
    const un = await runCli(t, ["uninstall"]);
    assert.equal(un.code, 0, un.stderr);
    assert.match(un.stdout, /Removed 1 backup file\(s\) Align made when installing/);
    assert.deepEqual(backups(), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(hooksFile, "utf8")), { hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } }, "the user's own hook stays");
  });

  test("B9: no SQLite ExperimentalWarning on stderr; below Node 24 the CLI refuses with one message and the hooks stay off but keep a stop latch closed", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    const status = await runCli(t, ["status"]);
    assert.equal(status.code, 0, status.stderr);
    assert.doesNotMatch(status.stderr, /ExperimentalWarning|SQLite is an experimental/);
    assert.equal(status.stderr, "");
    const major = Number(process.versions.node.split(".")[0]);
    if (major >= 24) return; // the refusal can only be seen on an older Node
    const strict = { ALIGN_ALLOW_UNSUPPORTED_NODE: "" };
    const r = await runCli(t, ["status"], strict);
    assert.equal(r.code, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr);
    assert.match(r.stderr, new RegExp(`^align: Align needs Node 24 or later, and .* is Node ${process.version.replace(/\./g, "\\.")}\\. Install Node 24 or later`));
    const start = json(runHook(t, "claude", "SessionStart", { session_id: "s-old", source: "startup" }, strict).stdout);
    assert.match(start.systemMessage, /^Align: Align needs Node 24 or later.*Align is off in this session/);
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: "s-old", prompt_id: "p", prompt: "hello" }, strict).stdout, "");
    assert.equal(json(runHook(t, "claude", "UserPromptSubmit", { session_id: "s-old", prompt_id: "p", prompt: "::align status" }, strict).stdout).decision, "block", "a command never reaches the model");
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: "s-old", tool_name: "Bash" }, strict).stdout, "");
    const lid = localId("claude-code", "s-old");
    writeJsonAtomic(layout.latch(t.home, lid), { v: 1, stopped: true, directive_id: "dir_x", seq: 1, at: nowIso() });
    assert.equal(json(runHook(t, "claude", "PreToolUse", { session_id: "s-old", tool_name: "Bash" }, strict).stdout).hookSpecificOutput.permissionDecision, "deny", "a stop latch still fails closed");
    assert.deepEqual(listSpool(t.home), [], "nothing spooled while off");
  });
});
