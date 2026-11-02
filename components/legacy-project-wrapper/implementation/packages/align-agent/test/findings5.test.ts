// Regressions for the cycle-5 agent-side E2E report: usage from turns made while a session's share had ended, uploaded
// when it was shared again under an epoch that had closed (C5-1); a lost workspace leaving the other one as a hidden,
// sticky default (C5-2); the stale "no longer have access" notice told next to "can reach ... again" (C5-3); and an
// `align sync` cut short by `align logout` saying "Signed out: nothing uploaded." (C5-4).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { MeFile } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, waitFor, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };

async function world(opts: { side?: boolean } = {}) {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  if (opts.side) {
    fake.workspaces = [...fake.workspaces, SIDE];
    fake.goals.set("ws_side", []);
  }
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = `${String(++n).padStart(8, "e")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
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

/** One finished turn in the session's transcript, its prompt and request `lagMs` after now (0: made right now). Returns
 *  the request's time. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 500): string {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
  return new Date(at + 50).toISOString();
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("C5-1: turns made while a session's share had ended stay on this machine", () => {
  test("lost access, a turn, the workspace given back and `::align share confirm`: the turn made in between is never uploaded, the preview says the share counts from now, and the next turn goes up under the new epoch", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const keysBefore = () => new Set(fake.usage.keys());

    // A turn while shared goes up under the first epoch.
    turn(t, A, "req_c51_shared");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const first = [...fake.usage.values()];
    assert.equal(first.length, 1, "the shared turn went up");
    const firstEpoch = first[0].epoch_id as string;

    // Removed from Acme: the next pass ends the share here ("its usage stays on this machine from now on").
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    await sleep(20);
    // A turn made now, while the session is not shared.
    const gapTs = turn(t, A, "req_c51_gap", 0);
    const gapAt = Date.now();
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const seen = keysBefore();

    // Given Acme back (an invite accepted with this device ticked), then shared again in the session.
    fake.workspaces = [ACME];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    await waitFor(() => Date.now() > gapAt + 100, 1000, "time to pass the gap turn");
    const preview = prompt(t, A.sid, "::align share", A.cwd).reason as string;
    assert.equal(prompt(t, A.sid, "::align share confirm", A.cwd).reason, 'Align: sharing requested toward "Ship the v2 onboarding flow". The next sync asks the Align server for it (within a few seconds); once it is shared, your next prompt carries the goal.');
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.sessions.get(A.key)?.state, "shared");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const afterReshare = [...fake.usage.keys()].filter((k) => !seen.has(k));
    assert.deepEqual(afterReshare, [], "the turn made while the share had ended was not uploaded when the session was shared again");
    // The preview said what the share then did: a session shared before counts from now.
    assert.match(preview, /counts from now\./, preview);
    assert.doesNotMatch(preview, /counts from session start/);

    // A turn after the re-share goes up, under the new epoch.
    turn(t, A, "req_c51_after");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const fresh = [...fake.usage.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => v);
    assert.equal(fresh.length, 1, "only the turn after the re-share went up");
    assert.notEqual(fresh[0].epoch_id, firstEpoch, "under the re-share's epoch");
    const ctx = ctxFor(t);
    const local = ctx.db.prepare("SELECT ts, epoch_id, uploaded FROM requests WHERE local_id=?").all(A.lid) as { ts: string; epoch_id: string | null; uploaded: number }[];
    ctx.db.close();
    assert.equal(local.length, 3, "all three turns are metered here");
    const gap = local.find((r) => r.ts === gapTs);
    assert.deepEqual(gap && { epoch_id: gap.epoch_id, uploaded: gap.uploaded }, { epoch_id: null, uploaded: 0 }, "the turn made in between has no epoch and stays here");
  });

  test("logout, a turn, login and `::align share confirm`: the turn made while signed out is never uploaded, also for a share that ended before epochs kept their end", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_c51_l_shared");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.usage.size, 1);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    // As an agent from before this fix left it: the ended share's epochs have no end.
    const ctx = ctxFor(t);
    if ((ctx.db.prepare("PRAGMA table_info(epochs)").all() as { name: string }[]).some((c) => c.name === "ends_at")) ctx.db.prepare("UPDATE epochs SET ends_at=NULL").run();
    ctx.db.close();
    await sleep(20);
    turn(t, A, "req_c51_l_gap", 0);
    await sleep(50);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    assert.equal(prompt(t, A.sid, "::align share confirm", A.cwd).reason, 'Align: sharing requested toward "Ship the v2 onboarding flow". The next sync asks the Align server for it (within a few seconds); once it is shared, your next prompt carries the goal.');
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.usage.size, 1, "the turn made while signed out was not uploaded");
    turn(t, A, "req_c51_l_after");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.usage.size, 2, "the turn after the re-share went up");
  });
});

describe("C5-2: the default workspace follows the server's", () => {
  test("a device that reached one workspace and reaches two again has no default, so a session with no workspace of its own gets the multi-workspace answer; a default set in config.json shows in `align config`", async () => {
    const { fake, t } = await world({ side: true });
    const me = () => readJson<MeFile>(layout.me(t.home))!;
    assert.equal(me().default_workspace, null, "two workspaces, no default");
    fake.workspaces = [SIDE];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(me().default_workspace, "ws_side", "the only workspace it reaches");
    fake.workspaces = [SIDE, ACME];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(me().workspaces.map((w) => w.id).sort(), ["ws_acme", "ws_side"]);
    assert.equal(me().default_workspace, null, "no default carried over from when it reached one");

    const sid = "c5c5c5c5-1111-2222-3333-444444444444";
    const cwd = path.join(t.root, "repo-c");
    fs.mkdirSync(cwd, { recursive: true });
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
    const multi = /^Align: this machine reaches more than one workspace and none is the default/;
    assert.match(prompt(t, sid, "::align share Ship confirm", cwd).reason, multi);
    assert.match(prompt(t, sid, "::align share confirm", cwd).reason, multi);
    assert.ok(!fs.existsSync(layout.spool(t.home)) || !fs.readdirSync(layout.spool(t.home)).some((f) => fs.readFileSync(path.join(layout.spool(t.home), f), "utf8").includes('"command"')), "nothing spooled");

    // A default chosen in config.json is used while the device reaches it, and `align config` shows it.
    const cfg = readJson<Record<string, unknown>>(layout.config(t.home))!;
    writeJsonAtomic(layout.config(t.home), { ...cfg, default_workspace: "ws_acme" });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(me().default_workspace, "ws_acme");
    assert.match((await runCli(t, ["config"])).stdout, /default_workspace Acme \(ws_acme\)/);
  });
});

describe("C5-3: only the newest share-state notice", () => {
  test("lost access and given the workspace back before the session's next prompt: that prompt tells only that it can reach the workspace again", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [ACME];
    assert.equal((await runCli(t, ["sync", "--hook"])).code, 0);
    const told = prompt(t, A.sid, "still there?", A.cwd);
    assert.equal(told.systemMessage, 'Align: this machine can reach Acme in Align again. To share this session there again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).');
  });
});

describe("C5-4: `align sync` cut short by `align logout`", () => {
  test("says the pairing changed during the sync, not \"Signed out: nothing uploaded.\", and logs it", async () => {
    const { fake, t } = await world();
    await shared(t);
    const device = loadCredentials(t.home)!.device_id;
    let release!: () => void;
    fake.holdCalls = { match: (m, p) => m === "GET" && p === "/api/v2/directives", release: new Promise<void>((r) => (release = r)), left: 1 };
    // Only this pass's call: `align login` reads the directives answer too (its ended sessions, cycle 9).
    const from = fake.log.length;
    const sync = runCli(t, ["sync"]);
    await waitFor(() => fake.log.slice(from).some((l) => l.method === "GET" && l.path === "/api/v2/directives"), 10_000, "the held directives call");
    const out = await runCli(t, ["logout"]);
    assert.equal(out.code, 0, out.stderr);
    assert.ok(fake.devices.get(device)!.revoked);
    fake.holdCalls = null;
    release();
    const r = await sync;
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /This machine's Align pairing changed during this sync \(`align login` or `align logout`\), so it stopped there/);
    assert.doesNotMatch(r.stdout, /Signed out: nothing uploaded\./);
    assert.match(fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8"), /sync: this machine's pairing changed during the pass/);
    // A sync run signed out says so as before.
    assert.match((await runCli(t, ["sync"])).stdout, /Signed out: nothing uploaded\./);
    // The logout's reason stands.
    assert.match((await runCli(t, ["status"])).stdout, /Identity: {3}signed out \(you ran `align logout`\)/);
  });
});
