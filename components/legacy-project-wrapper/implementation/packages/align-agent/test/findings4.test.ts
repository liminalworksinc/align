// Regressions for the cycle-4 agent-side E2E report: shared history deleted from any of the account's devices and
// never reported deleted when the server refused (C4-1); a sync pass bound to one device identity (C4-2); pending
// revokes kept as a set (C4-3); logout and login serialised on one lock (C4-4); an edit approved after a pass read it
// (C4-5); a stop after a resume (C4-6); `::align share <goal>` on a two-workspace device (C4-7); a stopped session's
// re-share (C4-8); a replaced device's wording (C4-9); and the "confusing" items (unshared-time note after a re-pair,
// stacked notices, unknown dash references, `requests --session`, `--past` after delete-history, two logins at once).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { computeUnsharedDigest } from "../src/allocation.ts";
import { addNotice, renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import type { PodFeed } from "../src/hooks/siblings.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, touch, usage, waitFor, writeLines, type TestEnv } from "./helpers.ts";

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
  return { fake, t };
}

let n = 0;
/** A Claude Code session in `cwd` (a folder of its own by default), shared from the terminal toward "Ship the v2". */
async function shared(t: TestEnv, cwd = path.join(t.root, `repo-${++n}`)) {
  const sid = `${String(++n).padStart(8, "a")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
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

/** One finished turn in the session's transcript, so the next pass has a usage row to upload. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string): void {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now();
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at + 500).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 1000).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
}

const relogin = async (t: TestEnv) => {
  assert.equal((await runCli(t, ["logout"])).code, 0);
  const l = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(l.code, 0, l.stderr);
};
const hot = (t: TestEnv, lid: string) => readJson<HotState>(layout.hot(t.home, lid))!;
const shareRow = (t: TestEnv, lid: string) => {
  const ctx = ctxFor(t);
  const row = ctx.db.prepare("SELECT state, error FROM shares WHERE local_id=?").get(lid) as { state: string; error: string | null } | undefined;
  ctx.db.close();
  return row ?? null;
};
const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const holdOnce = (fake: FakeServer, match: (method: string, p: string) => boolean) => {
  let release!: () => void;
  fake.holdCalls = { match, release: new Promise<void>((r) => (release = r)), left: 1 };
  return () => {
    fake.holdCalls = null;
    release();
  };
};

describe("C4-2: a sync pass is one device's", () => {
  test("an upload held in flight while `align login` replaces the device is not sent again as the new device: the pass stops, with one notice for the session", async () => {
    const { fake, t } = await world();
    const s = await shared(t);
    const old = loadCredentials(t.home)!.device_id;
    turn(t, s, "req_race_1");
    const release = holdOnce(fake, (m, p) => m === "POST" && p.endsWith("/usage"));
    const sync = runCli(t, ["sync"]);
    await waitFor(() => fake.log.some((l) => l.method === "POST" && l.path.endsWith("/usage")), 10_000, "the held upload");
    const login = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(login.code, 0, login.stderr);
    const now = loadCredentials(t.home)!.device_id;
    assert.notEqual(now, old);
    const refreshes = fake.refreshes;
    release();
    const r = await sync;
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /pairing changed during this sync/);
    assert.equal(fake.refreshes, refreshes, "the pass did not refresh the new device");
    assert.ok(!fake.log.some((l) => l.path.endsWith("/usage") && l.device === now), "nothing went up as the new device");
    const notices = hot(t, s.lid).notices.map((x) => x.text);
    assert.equal(notices.filter((x) => /stopped sharing/.test(x) || /no longer accepts/.test(x)).length, 1, notices.join("\n"));
    assert.match(notices.join("\n"), /because this machine signed out of Align/);
  });

  test("a session the new pairing shares while `align login` is still revoking the old device keeps its share", async () => {
    const { fake, t } = await world();
    const before = await shared(t);
    const release = holdOnce(fake, (m, p) => m === "DELETE" && p === "/api/v2/devices/self");
    const login = runCli(t, ["login", "--name", "Test Mac"]);
    await waitFor(() => fake.log.some((l) => l.method === "DELETE" && l.path === "/api/v2/devices/self"), 10_000, "login's revoke in flight");
    const fresh = await shared(t);
    const now = loadCredentials(t.home)!.device_id;
    assert.equal(fake.sessions.get(fresh.key)?.device, now, "shared by the new device");
    release();
    const l = await login;
    assert.equal(l.code, 0, l.stderr);
    assert.equal(shareRow(t, fresh.lid)?.state, "shared", "the new device's share is not ended as signed out");
    assert.deepEqual({ ...shareRow(t, before.lid) }, { state: "stopped", error: "device_signed_out" }, "the replaced device's share ended");
    assert.match(l.stdout, /1 session\(s\) shared from this machine's earlier sign-in stopped sharing/);
  });
});

describe("C4-3 + C4-9: pending revokes", () => {
  test("a revoke `align login` could not do survives an offline logout: both devices wait in revoke.json, `align status` says which was replaced, and the next sync revokes both", async () => {
    const { fake, t } = await world();
    await shared(t);
    const first = loadCredentials(t.home)!.device_id;
    fake.failCalls = (m, p) => m === "DELETE" && p === "/api/v2/devices/self";
    const login = await runCli(t, ["login", "--name", "Test Mac"]);
    assert.equal(login.code, 0, login.stderr);
    assert.match(login.stderr, new RegExp(`could not revoke this machine's earlier device ${first}`));
    const second = loadCredentials(t.home)!.device_id;
    fake.failCalls = null;
    fake.setOffline(true);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const status = (await runCli(t, ["status"])).stdout;
    assert.match(status, new RegExp(`Revoke: {5}pending for device ${first}, replaced by \`align login\` .* and not revoked yet`));
    assert.match(status, new RegExp(`Revoke: {5}pending for device ${second}, signed out .* while .* could not be reached`));
    fake.setOffline(false);
    const r = await runCli(t, ["sync"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(fake.devices.get(first)!.revoked, "the device the login replaced is revoked");
    assert.ok(fake.devices.get(second)!.revoked, "and the one the logout signed out");
    assert.match(r.stdout, new RegExp(`Revoked device ${first}, which \`align login\` replaced on this machine`));
    assert.match(r.stdout, /Revoked the device this machine signed out of while the server could not be reached/);
    assert.ok(!fs.existsSync(layout.pendingRevoke(t.home)));
    const log = fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8");
    assert.match(log, new RegExp(`revoked device ${first}, replaced by \`align login\``));
    assert.doesNotMatch(log, new RegExp(`revoked device ${first}, .*could not be reached`), "a replaced device is not logged as an offline sign-out");
  });

  test("an older revoke.json that holds a single device is still read and revoked", async () => {
    const { fake, t } = await world();
    fake.setOffline(true);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const file = JSON.parse(fs.readFileSync(layout.pendingRevoke(t.home), "utf8"));
    const one = file.devices[0];
    delete one.reason;
    fs.writeFileSync(layout.pendingRevoke(t.home), JSON.stringify(one), { mode: 0o600 });
    fake.setOffline(false);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.ok(fake.devices.get(one.device_id)!.revoked);
    assert.ok(!fs.existsSync(layout.pendingRevoke(t.home)));
  });
});

describe("C4-4: logout and login share one lock", () => {
  test("`align logout` while `align login` waits to commit: the machine never ends signed in as a device the server revoked, and \"Signed out\" means the credentials are gone", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    // Something else holds the credentials lock (a sync's refresh, say).
    const lock = layout.refreshLock(t.home);
    fs.writeFileSync(lock, "", { flag: "wx", mode: 0o600 });
    const login = runCli(t, ["login", "--name", "Test Mac"]);
    await waitFor(() => fake.log.some((l) => l.path === "/api/v2/device/token" && l.status === 200), 10_000, "the new pairing, waiting to commit");
    // The first revoke the server sees is held: the logout's own (it read the old device), or the login's.
    const release = holdOnce(fake, (m, p) => m === "DELETE" && p === "/api/v2/devices/self");
    const logout = runCli(t, ["logout"]);
    await new Promise((r) => setTimeout(r, 400));
    fs.unlinkSync(lock);
    // Let the held revoke go once the login is done, or after a while (when the logout holds the lock meanwhile).
    await Promise.race([login, new Promise((r) => setTimeout(r, 2500))]);
    release();
    const [li, lo] = await Promise.all([login, logout]);
    const c = loadCredentials(t.home)!;
    const said = `login: ${li.stdout} ${li.stderr}; logout: ${lo.stdout} ${lo.stderr}`;
    assert.ok(fake.devices.get(first)!.revoked, `the first device is revoked (${said})`);
    if (!c.signed_out) assert.ok(!fake.devices.get(c.device_id)!.revoked, `signed in here as ${c.device_id}, which the server revoked (${said})`);
    else assert.ok(!fs.existsSync(layout.deviceKey(t.home)), "signed out: no device key");
    // "Signed out" and "Signed in" never both describe the state left: whichever finished last is what holds.
    if (/Signed in as/.test(li.stdout) && /Signed out\./.test(lo.stdout)) assert.ok(!c.signed_out || li.code !== 0, said);
  });
});

describe("cycle 4: two `align login`s at once", () => {
  test("two `align login`s at once: the one whose device the other replaced does not say \"Signed in\"", async () => {
    const { fake, t } = await world();
    // The first login's read of /me is held until the second login has replaced (and revoked) its device.
    const release = holdOnce(fake, (m, p) => m === "GET" && p === "/api/v2/me");
    const from = fake.log.length;
    const first = runCli(t, ["login", "--name", "Laptop 1"]);
    await waitFor(() => fake.log.slice(from).some((l) => l.method === "GET" && l.path === "/api/v2/me"), 10_000, "the first login's /me");
    const firstDevice = loadCredentials(t.home)!.device_id;
    const second = await runCli(t, ["login", "--name", "Laptop 2"]);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /Signed in as Sean <sean@example\.test> on device Laptop 2\./);
    release();
    const one = await first;
    assert.ok(fake.devices.get(firstDevice)!.revoked);
    assert.doesNotMatch(one.stdout, /Signed in/, one.stdout);
    assert.equal(one.code, 1);
    assert.match(one.stderr, new RegExp(`another \`align login\` .* finished while this one did, so device ${firstDevice} it paired is replaced and revoked; it is signed in as device ${loadCredentials(t.home)!.device_id}`));
  });
});

describe("C4-1: deleting shared history", () => {
  test("after a re-pair, `align delete-history` deletes the history on the server from the new device (which the server audits), and the session's own activity no longer comes back as \"you, on another machine\"", async () => {
    const { fake, t } = await world();
    const s = await shared(t);
    turn(t, s, "req_del_1");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal([...fake.usage.values()].filter((u) => u.session_key === s.key).length, 1);
    // The session's own work, as the team feed returns it to this person's devices.
    fake.addRemoteActivity("ws_acme", { session_key: s.key, mine: true, user: { id: fake.user.id, name: fake.user.name }, kind: "edit", repo_id: "r".repeat(32), path_hash: "h".repeat(32) });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.ok(readJson<PodFeed>(layout.podFeed(t.home, "ws_acme"))!.items.some((i) => i.session_key === s.key), "cached");
    await relogin(t);
    const device = loadCredentials(t.home)!.device_id;
    const del = await runCli(t, ["delete-history", s.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.match(del.stdout, /Shared history deleted\./);
    assert.ok(!fake.sessions.has(s.key), "the server deleted the session");
    assert.equal([...fake.usage.values()].filter((u) => u.session_key === s.key).length, 0, "and its usage");
    assert.deepEqual(fake.deletedBy, [{ key: s.key, device }], "by the new device");
    assert.ok(!readJson<PodFeed>(layout.podFeed(t.home, "ws_acme"))!.items.some((i) => i.session_key === s.key), "its cached activity went with it");
  });

  test("a deletion the server refuses is never reported as done: the share and the queued deletion stay, stderr says why and exit 1; asked again once the server takes it, it is deleted", async () => {
    const { fake, t } = await world();
    const s = await shared(t);
    turn(t, s, "req_del_2");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    fake.refuseDeletes = true;
    const del = await runCli(t, ["delete-history", s.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 1, del.stdout);
    assert.doesNotMatch(del.stdout, /Shared history deleted/);
    assert.match(del.stderr, new RegExp(`the shared history of session ${s.lid.slice(0, 8)} was not deleted: the server refused \\(not_found\\)\\..*The deletion stays queued here and is tried again; you can also delete it on the web at http://127\\.0\\.0\\.1:\\d+/app/w/ws_acme/sessions\\.`));
    assert.ok(fake.sessions.has(s.key));
    assert.equal(shareRow(t, s.lid)?.state, "stopped", "the share is kept, not forgotten");
    const ctx = ctxFor(t);
    assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE local_id=? AND kind='delete_session'").get(s.lid) as { n: number }).n, 1, "the deletion stays queued");
    ctx.db.close();
    assert.match((await runCli(t, ["sessions"])).stdout, /stopped \(Acme; history deletion refused \(not_found\)\)/);
    fake.refuseDeletes = false;
    const again = await runCli(t, ["delete-history", s.lid.slice(0, 8), "--yes"]);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /Shared history deleted\./);
    assert.ok(!fake.sessions.has(s.key));
  });
});

describe("cycle 4: CLI arguments and `--past`", () => {
  test("an unknown dash-prefixed session reference says no session matches, with the `--` hint", async () => {
    const { t } = await world();
    const r = await runCli(t, ["stop-sharing", "-Zzzzzzz"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^align: no session matches "-Zzzzzzz", and it is not an option of `align stop-sharing`\. A session id that starts with "-" can also follow `--`, as in `align stop-sharing -- -Zzzzzzz`\./);
  });

  test("`align requests --session <id>` lists only that session's requests", async () => {
    const { fake, t } = await world();
    const a = await shared(t);
    const b = await shared(t);
    fake.sendRequest("ws_acme", { type: "checkpoint", goal_id: "g_ship", session_keys: [a.key], note: "for A" });
    fake.sendRequest("ws_acme", { type: "checkpoint", goal_id: "g_ship", session_keys: [b.key], note: "for B" });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const all = (await runCli(t, ["requests"])).stdout;
    assert.match(all, /for A/);
    assert.match(all, /for B/);
    const onlyA = await runCli(t, ["requests", "--session", a.lid.slice(0, 8)]);
    assert.equal(onlyA.code, 0, onlyA.stderr);
    assert.match(onlyA.stdout, /for A/);
    assert.doesNotMatch(onlyA.stdout, /for B/);
  });

  test("`align share --dir --past` skips a session whose shared history the user deleted", async () => {
    const { t } = await world();
    const folder = path.join(t.root, "repo-past");
    const s = await shared(t, folder);
    turn(t, s, "req_past_1");
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const del = await runCli(t, ["delete-history", s.lid.slice(0, 8), "--yes"]);
    assert.match(del.stdout, /Shared history deleted\./);
    const r = await runCli(t, ["share", "--dir", folder, "--past", "3", "--workspace", "Acme", "--goal", "none"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /0 session\(s\) in .* from the last 3 days/);
    assert.match(r.stdout, /Skipped 1 whose shared history you deleted/);
    assert.doesNotMatch(r.stdout, new RegExp(s.lid.slice(0, 8)));
  });
});

describe("C4-5: an edit approved after a pass read it", () => {
  test("is reported once, for its own session, not for the session most recently active in the repo", async () => {
    const { fake, t } = await world();
    const repo = path.join(t.root, "repo-git");
    fs.mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://github.example.edu/lab/c45.git"]);
    const A = await shared(t, repo);
    const B = await shared(t, repo);
    assert.equal((await runCli(t, ["sync"])).code, 0, "a first pass takes the repo's baseline");
    // A's Write waits on the permission prompt: recorded at PreToolUse, its file not written yet. A pass reads it.
    const file = path.join(repo, "pending2.txt");
    runHook(t, "claude", "PreToolUse", { session_id: A.sid, cwd: repo, tool_name: "Write", tool_input: { file_path: file } });
    assert.equal((await runCli(t, ["sync"])).code, 0);
    // B is the session most recently active in the repo; then the user approves A's Write.
    prompt(t, B.sid, "go on", repo);
    touch(file);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    const edits = fake.activity.filter((a) => a.kind === "edit" && a.mine);
    assert.equal(edits.length, 1, JSON.stringify(edits));
    assert.equal(edits[0].session_key, A.key, "credited to the session that made it");
  });
});
