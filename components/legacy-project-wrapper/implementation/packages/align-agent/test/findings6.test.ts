// Follow-ups to the cycle-5 agent-side E2E report: the counts that took rows made while a session was not shared for
// rows that will upload (C5-1's tail), and the "works, but would confuse a developer" items of its section 5: devices
// named unambiguously at login, history already deleted on the web, every device `--purge` revokes, accurate wording
// for several revokes that wait, `align uninstall` leaving the user's Codex hooks.json byte for byte, the order of
// `align sync`'s lines, and no "can now reach" notice to a session that started with the pass that found the workspace.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { computeUnsharedDigest } from "../src/allocation.ts";
import { loadCredentials, loadPendingRevokes } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, writeLines, type TestEnv } from "./helpers.ts";

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
  const sid = `${String(++n).padStart(8, "f")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
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

/** One finished turn (10 input and 5 output tokens) in the session's transcript, made `lagMs` after now. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 500): void {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("C5-1 follow-up: what counts as waiting to upload, and as shared time", () => {
  test("a turn made while the share had ended is not a row waiting to upload after the re-share, and the unshared-time digest counts it as not shared", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_f1_shared");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    await sleep(20);
    turn(t, A, "req_f1_gap", 0);
    await sleep(50);
    fake.workspaces = [ACME];
    assert.equal((await runCli(t, ["sync"])).code, 0);
    prompt(t, A.sid, "::align share confirm", A.cwd);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(fake.usage.size, 1, "only the turn made while shared went up");

    fake.setOffline(true);
    const off = await runCli(t, ["sync"]);
    assert.equal(off.code, 1);
    assert.match(off.stderr, /\. 0 usage rows and \d+ queued calls stay on this machine/, off.stderr);
    assert.match((await runCli(t, ["status"])).stdout, /Server: {5}unreachable since .*; 0 usage rows wait to upload/);

    const ctx = ctxFor(t);
    const d = computeUnsharedDigest(ctx, Date.now(), true)!;
    ctx.db.close();
    assert.equal(d.total_tokens, 30, "both turns are this machine's agent time");
    assert.equal(d.unshared_tokens, 15, "the turn made while the session was not shared is not shared time");
  });
});

describe("cycle 5, section 5: works, but would confuse a developer", () => {
  test("a re-login keeps the plain name, even while the device it replaces is still live (its revoke waiting): `align login` tells the server which device it replaces", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    fake.failCalls = (m, p) => m === "DELETE" && p === "/api/v2/devices/self";
    const r = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(r.code, 0, r.stderr);
    fake.failCalls = null;
    const now = loadCredentials(t.home)!.device_id;
    assert.ok(!fake.devices.get(first)!.revoked, "the replaced device is still live");
    assert.equal(fake.devices.get(now)!.name, "Test Mac", "no (2) for the device a re-login replaces");
    assert.equal(fake.replacesSeen.at(-1), first, "the poll named the device it replaces");
    assert.doesNotMatch(r.stdout, /other paired device/, "the replaced device is not named as one to revoke");
  });

  test("login names devices unambiguously: another machine's device of the same name makes the new one \"(2)\"; the device it replaced (its revoke waiting) and a device paired after it are never named as ones to revoke", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    // The replaced device's revoke can't get through, so it is still live on the server, with the same name.
    fake.failCalls = (m, p) => m === "DELETE" && p === "/api/v2/devices/self";
    fake.devices.set("dv_othermachine", { id: "dv_othermachine", name: "Test Mac", publicKey: "x", revoked: false, refresh: null, oldRefresh: new Set(), createdAt: "2026-10-02T09:00:00.000Z" });
    fake.devices.set("dv_laterpairing", { id: "dv_laterpairing", name: "Test Mac (3)", publicKey: "x", revoked: false, refresh: null, oldRefresh: new Set(), createdAt: new Date(Date.now() + 3_600_000).toISOString() });
    fake.devices.set("dv_oldlaptop", { id: "dv_oldlaptop", name: "Old laptop", publicKey: "x", revoked: false, refresh: null, oldRefresh: new Set(), createdAt: "2026-10-01T09:00:00.000Z" });
    const r = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(r.code, 0, r.stderr);
    fake.failCalls = null;
    const now = loadCredentials(t.home)!.device_id;
    assert.ok(!fake.devices.get(first)!.revoked && loadPendingRevokes(t.home).some((p) => p.device_id === first), "the replaced device waits to be revoked");
    assert.equal(fake.devices.get(now)!.name, "Test Mac (2)", "two live devices of other machines never share a name");
    assert.match(r.stdout, /Signed in as Sean <sean@example\.test> on device Test Mac \(2\)\./);
    assert.match(r.stdout, /Your account has 2 other paired devices: /);
    assert.match(r.stdout, /Old laptop \(dv_…laptop, paired [^)]+\)/);
    assert.match(r.stdout, /Test Mac \(dv_…achine, paired [^)]+\)/);
    assert.match(r.stdout, new RegExp(`This machine is Test Mac \\(2\\) \\(dv_…${now.slice(-6)}\\)\\.`));
    assert.doesNotMatch(r.stdout, /Test Mac \(3\)|dv_…airing/, "a device paired after this one is not named");
    assert.doesNotMatch(r.stdout, new RegExp(`dv_…${first.slice(-6)}`), "nor this machine's own earlier device");
  });

  test("history already deleted on the web: `align delete-history` says so, exits 0, and nothing stays queued or reads as refused", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    fake.deleteOnWeb(A.key);
    const r = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /This session's shared history was already deleted on the server \(on the web, say\); nothing is left there\. Nothing more is queued\./);
    assert.match((await runCli(t, ["status"])).stdout, /Outbox: {5}0 pending/);
    const row = JSON.parse((await runCli(t, ["sessions", "--all", "--json"])).stdout).find((s: { native_id: string }) => s.native_id === A.sid);
    assert.equal(row.shared, "private");
    assert.match(fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8"), /was already deleted on the server/);
  });

  test("`align uninstall --purge` names every device it revokes, the one an earlier login replaced too", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    fake.failCalls = (m, p) => m === "DELETE" && p === "/api/v2/devices/self";
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    fake.failCalls = null;
    const now = loadCredentials(t.home)!.device_id;
    const purge = await runCli(t, ["uninstall", "--purge"]);
    assert.equal(purge.code, 0, purge.stderr);
    assert.match(purge.stdout, new RegExp(`Revoked device ${first}, which \`align login\` replaced on this machine; its sessions stopped sharing there\\.`));
    assert.match(purge.stdout, new RegExp(`Revoked this device \\(${now}\\)`));
    assert.ok(fake.devices.get(first)!.revoked && fake.devices.get(now)!.revoked);
  });

  test("two revokes waiting while the server is unreachable are both named, each as what it is", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    fake.failCalls = (m, p) => m === "DELETE" && p === "/api/v2/devices/self";
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    const second = loadCredentials(t.home)!.device_id;
    assert.equal((await runCli(t, ["logout"])).code, 0);
    fake.failCalls = null;
    fake.setOffline(true);
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 1);
    assert.match(
      r.stderr,
      new RegExp(`the 2 devices this machine no longer uses \\(${first}, which \`align login\` replaced; ${second}, which this machine signed out of\\) are revoked at the next sync that reaches it`),
      r.stderr,
    );
  });

  test("`align uninstall` leaves the user's own Codex hooks.json byte for byte, layout included", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    const file = path.join(t.codexHome, "hooks.json");
    const mine = '{\n    "hooks": {\n        "Stop": [ { "hooks": [ { "type": "command", "command": "say done" } ] } ]\n    },\n    "note":   "mine"\n}\n';
    fs.writeFileSync(file, mine);
    assert.equal((await runCli(t, ["install", "--codex"])).code, 0);
    assert.notEqual(fs.readFileSync(file, "utf8"), mine, "install merged Align's handlers");
    const un = await runCli(t, ["uninstall"]);
    assert.equal(un.code, 0, un.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), mine);
  });

  test("`align sync` prints \"can now reach\" after its Server: line; a session that started with the pass that found the workspace is not told, an older one is", async () => {
    const { fake, t } = await world();
    const cwd = path.join(t.root, "repo-reach");
    fs.mkdirSync(cwd, { recursive: true });
    const OLD = "abababab-1111-2222-3333-444444444444";
    const NEW = "cdcdcdcd-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: OLD, source: "startup", cwd });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.workspaces = [...fake.workspaces, { id: "ws_new", name: "New Co", role: "member", teams: [] }];
    fake.goals.set("ws_new", []);
    // Its SessionStart spools it; the pass it starts (here, the next sync) is the one that finds New Co.
    runHook(t, "claude", "SessionStart", { session_id: NEW, source: "startup", cwd });
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    const server = r.stdout.indexOf("Server:");
    const reach = r.stdout.indexOf("This machine can now reach New Co");
    assert.ok(server >= 0 && reach > server, r.stdout);
    const hot = (sid: string) => readJson<HotState>(layout.hot(t.home, localId("claude-code", sid)));
    assert.ok(hot(OLD)?.notices.some((x) => /can now reach New Co/.test(x.text)), "the older session is told");
    assert.ok(!(hot(NEW)?.notices ?? []).some((x) => /can now reach New Co/.test(x.text)), "the one that started with the pass is not");
  });
});
