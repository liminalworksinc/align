// The re-invite decision (owner decision 2026-11-01) and the cycle-3 leftovers on the agent side: a device given a
// workspace back when its person accepted an invite picks it up at its next pass and can share there again without a
// new pairing (shares in other workspaces untouched); and the stale sign-out notice, the pairing limit's wait, the
// latch wording, why a device was signed out (account deletion), a revoke that finds the device already revoked, an
// unreachable signed-out sync's exit code, and devices left paired with no machine behind them.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { MeFile } from "../src/shared/types.ts";
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
    fake.goals.set("ws_side", []);
  }
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t, login };
}

/** A Claude Code session started in its own folder, shared from the terminal in `ws` toward `goal`. */
async function sharedSession(t: TestEnv, name: string, ws: string, goal: string) {
  const sid = `${name}${name}${name}${name}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`.slice(0, 36);
  const cwd = path.join(t.root, `repo-${name}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${name}-p0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", "--latest", "--cwd", cwd, "--workspace", ws, "--goal", goal, "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  const wsId = ws === "Acme" ? "ws_acme" : "ws_side";
  const key = sessionKey(ctx.secret, wsId, "claude-code", sid);
  ctx.db.close();
  return { sid, cwd, key, lid: localId("claude-code", sid) };
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sessionsJson = async (t: TestEnv) => JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout || "[]") as { native_id: string; shared: string }[];

describe("re-invite: a workspace given back to this device at an invite (owner decision 2026-11-01)", () => {
  test("removed, re-invited and accepted with this device ticked: the next hook pass sees the workspace (/me lists it) with a one-time notice, `::align share` shares the session there again on the same device, and the share in the other workspace is untouched", async () => {
    const { fake, t } = await world({ side: true });
    const device = loadCredentials(t.home)!.device_id;
    const A = await sharedSession(t, "a", "Acme", "Ship the v2");
    const B = await sharedSession(t, "b", "Side Co", "none");
    assert.equal(fake.sessions.get(A.key)?.state, "shared");
    assert.equal(fake.sessions.get(B.key)?.state, "shared");

    // Removed from Acme: the device loses it; the share there ends here with a notice, Side Co's stays.
    fake.workspaces = fake.workspaces.filter((w) => w.id !== "ws_acme");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.match(prompt(t, A.sid, "hello", A.cwd).systemMessage, /no longer have access to Acme in Align/);

    // Re-invited, and the invite accepted with this device ticked: the server gives the device Acme again. A hook pass
    // (which reads /me only every 10 minutes) learns it from the directives answer and reads /me at once.
    fake.workspaces = [...fake.workspaces, { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] }];
    const hookPass = await runCli(t, ["sync", "--hook"]);
    assert.equal(hookPass.code, 0, hookPass.stderr);
    const me = readJson<MeFile>(layout.me(t.home))!;
    assert.deepEqual(me.workspaces.map((w) => w.id).sort(), ["ws_acme", "ws_side"], "/me lists the workspace again");
    assert.ok(fs.existsSync(layout.feed(t.home, "ws_acme")), "its goals are cached again");
    assert.match(fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8"), /workspace added: this device can now reach Acme \(ws_acme\)/);

    // The session that lost it hears once how to share it again, toward the goal it had.
    const told = prompt(t, A.sid, "still there?", A.cwd);
    assert.equal(told.systemMessage, 'Align: this machine can reach Acme in Align again. To share this session there again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).');
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: A.sid, prompt_id: "again", prompt: "again", cwd: A.cwd }).stdout, "", "once");

    // Shared again in the session: the same device, no new pairing; Side Co's share untouched.
    assert.equal(prompt(t, A.sid, "::align share confirm", A.cwd).reason, 'Align: sharing requested toward "Ship the v2 onboarding flow". It takes effect within a few seconds; your next prompt carries the goal.');
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const list = await sessionsJson(t);
    assert.equal(list.find((s) => s.native_id === A.sid)?.shared, "shared (Acme)");
    assert.equal(list.find((s) => s.native_id === B.sid)?.shared, "shared (Side Co)");
    assert.equal(fake.sessions.get(A.key)?.device, device, "shared again from the same device");
    assert.equal(fake.sessions.get(B.key)?.state, "shared");
    assert.equal(fake.sessions.get(B.key)?.device, device);
    assert.equal(loadCredentials(t.home)!.device_id, device, "no new pairing");
    assert.equal(fake.devices.size, 1);
  });

  test("a workspace joined for the first time with this device ticked: `align sync` says so once, and a recent unshared session hears how to share there", async () => {
    const { fake, t } = await world({ side: true });
    const sid = "cccccccc-1111-2222-3333-444444444444";
    const cwd = path.join(t.root, "repo-c");
    fs.mkdirSync(cwd, { recursive: true });
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [...fake.workspaces, { id: "ws_new", name: "New Co", role: "member", teams: [] }];
    fake.goals.set("ws_new", []);
    const first = await runCli(t, ["sync"]);
    assert.match(first.stdout, /This machine can now reach New Co in Align \(given to this device when you accepted an invite\)/);
    const again = await runCli(t, ["sync"]);
    assert.doesNotMatch(again.stdout, /can now reach/, "once");
    const lid8 = localId("claude-code", sid).slice(0, 8);
    assert.equal(prompt(t, sid, "hello", cwd).systemMessage, `Align: this machine can now reach New Co in Align. To share this session there, run \`align share ${lid8} --workspace "New Co" --goal <goal>\` in a terminal.`);
  });

  test("a new pairing's first /me says nothing about workspaces it lists (login lists them itself)", async () => {
    const { t } = await world();
    const r = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /workspace Acme \(ws_acme\)/);
    assert.doesNotMatch((await runCli(t, ["sync"])).stdout, /can now reach/);
  });
});

describe("E2E cycle 3 leftovers", () => {
  test("stale sign-out notice: a share ended by a sign-out, then shared again from the terminal, then ended because the workspace was lost, shows only the last notice", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t, "d", "Acme", "Ship the v2");
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    const again = await runCli(t, ["share", "--latest", "--cwd", A.cwd, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(again.code, 0, again.stderr);
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const told = prompt(t, A.sid, "hello", A.cwd).systemMessage as string;
    assert.match(told, /no longer have access to Acme in Align/);
    assert.doesNotMatch(told, /signed out of Align/, "the sign-out notice was stale once the session was shared again");
  });

  test("login rate limit: `align login` refused for too many pairings says how long to wait (the server's words, or its Retry-After)", async () => {
    const fake = new FakeServer();
    await fake.start();
    cleanups.push(() => fake.stop());
    const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
    cleanups.push(() => t.cleanup());
    const said = "Align on this computer has started 10 device pairings in the last hour, its limit for everyone who pairs here. Try again in 42 minutes, or restart Align to clear it.";
    fake.authorizeLimited = { retryAfter: 2520, message: said };
    const r1 = await runCli(t, ["login"]);
    assert.equal(r1.code, 1);
    assert.equal(r1.stderr.trim(), `align: could not start pairing this device: ${said}`);
    fake.authorizeLimited = { retryAfter: 90 };
    const r2 = await runCli(t, ["login"]);
    assert.equal(r2.code, 1);
    assert.equal(r2.stderr.trim(), "align: could not start pairing this device: too many device pairings were started recently. Try again in 2 minutes.");
  });

  test("latch wording: a stopped session whose workspace was lost says so in `align latch status`, as its deny does", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t, "e", "Acme", "Ship the v2");
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const out = (await runCli(t, ["latch", "status"])).stdout;
    assert.match(out, new RegExp(`STOPPED \\(tools blocked\\).*; sharing ended \\(this machine no longer has access to its Align workspace\\), so only \`align stop-sharing ${A.lid.slice(0, 8)}\` unblocks it`));
    assert.doesNotMatch(out, /no longer has the share/);
  });

  test("account deletion reason: a device whose account was deleted reads so in `align status`; one revoked on the web reads that", async () => {
    const { fake, t } = await world();
    fake.devices.delete(loadCredentials(t.home)!.device_id); // deleting the account deletes its devices
    assert.notEqual((await runCli(t, ["goals", "--refresh"])).code, 0);
    assert.match((await runCli(t, ["status"])).stdout, /Identity: {3}signed out \(the Align server no longer knows this device: its account was deleted \(or the server's data was reset\)\); local metering only/);
    const w2 = await world();
    const d = w2.fake.devices.get(loadCredentials(w2.t.home)!.device_id)!;
    d.revoked = true;
    d.revokedReason = "revoked_on_web";
    assert.notEqual((await runCli(w2.t, ["goals", "--refresh"])).code, 0);
    assert.match((await runCli(w2.t, ["status"])).stdout, /Identity: {3}signed out \(this device was revoked on the web \(Devices page\)\)/);
  });

  test("already revoked: a pending revoke for a device revoked on the web meanwhile says it was already revoked, not \"Revoked\"", async () => {
    const { fake, t } = await world();
    const old = loadCredentials(t.home)!.device_id;
    fake.setOffline(true);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    fake.setOffline(false);
    fake.devices.get(old)!.revoked = true; // the person revoked it on the Devices page meanwhile
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /The device this machine signed out of while the server could not be reached was already revoked/);
    assert.doesNotMatch(r.stdout, /^Revoked/m);
    assert.ok(!fs.existsSync(layout.pendingRevoke(t.home)));
  });

  test("orphan devices: `align login` names the account's other paired devices with where to revoke them; `align uninstall --purge` revokes this one first (or says where to)", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    fake.devices.set("dv_oldlaptop", { id: "dv_oldlaptop", name: "Old laptop", publicKey: "x", revoked: false, refresh: null, oldRefresh: new Set(), createdAt: "2026-10-01T09:00:00.000Z" });
    const r = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(fake.devices.get(first)!.revoked, "the replaced device is revoked, so not listed");
    assert.match(r.stdout, new RegExp(`Your account has 1 other paired device: Old laptop \\(last seen [^)]+\\)\\. Revoke any you no longer use at ${fake.url.replace(/[.]/g, "\\.")}/app/devices\\.`));
    const current = loadCredentials(t.home)!.device_id;
    const purge = await runCli(t, ["uninstall", "--purge"]);
    assert.equal(purge.code, 0, purge.stderr);
    assert.match(purge.stdout, new RegExp(`Revoked this device \\(${current}\\)`));
    assert.ok(fake.devices.get(current)!.revoked);
    assert.ok(!fs.existsSync(t.home));

    const w2 = await world();
    w2.fake.setOffline(true);
    const off = await runCli(w2.t, ["uninstall", "--purge"]);
    assert.equal(off.code, 0);
    assert.match(off.stderr, /could not reach .* to revoke this device \(dv_[^)]+\)\. Its key is deleted now, so revoke it at http:\/\/127\.0\.0\.1:\d+\/app\/devices\./);
  });
});
