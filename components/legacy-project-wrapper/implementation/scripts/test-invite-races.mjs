#!/usr/bin/env node
// Invite acceptance against the real migrations and transaction helper. All accounts, devices and tokens are test data.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
// Keep credentials and the unused captcha dependency out of this isolated test process.
const fixtures = new Map([
  [new URL("../lib/secret.ts", import.meta.url).href, 'export const secret = () => "invite-race-test-data"; export const signPayload = () => { throw new Error("unused test fixture"); };'],
  [new URL("../lib/v2/captcha.ts", import.meta.url).href, 'export const requireCaptcha = () => { throw new Error("unused test fixture"); };'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith(new URL("../lib/", import.meta.url).href)) {
      const url = new URL(specifier, context.parentURL);
      if (!path.extname(url.pathname)) url.pathname += ".ts";
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (fixtures.has(url)) return { format: "module", source: fixtures.get(url), shortCircuit: true };
    if (url.endsWith(".json")) return { format: "module", source: `export default ${readFileSync(new URL(url), "utf8")};`, shortCircuit: true };
    if (url === new URL("../lib/v2/errors.ts", import.meta.url).href) {
      // Type stripping cannot run constructor parameter properties. Keep the original error helpers.
      const source = readFileSync(new URL(url), "utf8").replaceAll("public ", "").replace("super(message ?? code);", "super(message ?? code); Object.assign(this, { status, code, extra });");
      return { format: "module-typescript", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const db = await import("../lib/v2/db.ts");
const { acceptInvite } = await import("../lib/v2/workspaces.ts");
const { sha256hex } = await import("../lib/v2/ids.ts");
const RealDate = Date;
const realSetTimeout = globalThis.setTimeout;
let pass = 0;
let fail = 0;

async function test(name, fn) {
  const dir = mkdtempSync(path.join(ROOT, ".invite-races-"));
  const previous = { HOSTED: process.env.HOSTED, ALIGN_DATA_DIR: process.env.ALIGN_DATA_DIR, ALIGN_MAX_MEMBERS: process.env.ALIGN_MAX_MEMBERS };
  process.env.HOSTED = "1";
  process.env.ALIGN_DATA_DIR = dir;
  process.env.ALIGN_MAX_MEMBERS = "10";
  let now = RealDate.parse("2030-01-01T00:00:00.000Z");
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  let holder;
  const waiting = [];
  const pending = [];
  try {
    db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY, name TEXT, email TEXT); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY)");
    db.migrate();
    const at = new Date().toISOString();
    const expires = new Date(now + 60_000).toISOString();
    const user = { id: "test-invitee", email: "invitee@example.test" };
    const token = "a".repeat(43);
    db.run("INSERT INTO ba_user VALUES (?, ?, ?), (?, ?, ?)", "test-owner", "Test owner", "owner@example.test", user.id, "Test invitee", user.email);
    db.run("INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)", "test-ws", "Test workspace", "test-owner", at);
    db.run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", "test-ws", "test-owner", "owner", at);
    db.run("INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)", "test-team", "test-ws", "Test team", at);
    db.run("INSERT INTO v2_devices (id, user_id, name, public_key, created_at) VALUES (?, ?, ?, ?, ?)", "test-device", user.id, "Test device", "unused-test-data", at);
    db.run("INSERT INTO v2_invites (id, ws_id, token_hash, email, role, team_id, team_role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", "test-invite", "test-ws", sha256hex(token), user.email, "owner", "test-team", "lead", "test-owner", at, expires);
    holder = new DatabaseSync(db.dbFile(), { timeout: 0 });
    holder.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    globalThis.setTimeout = (resume) => { waiting.push(resume); return 0; };
    const start = (deviceId = "test-device") => {
      const before = waiting.length;
      const result = acceptInvite(token, user, true, [deviceId]).then(value => ({ value }), error => ({ error }));
      pending.push(result);
      assert.equal(waiting.length, before + 1, "acceptance must reach the busy retry timer");
      return result;
    };
    const effects = () => Object.fromEntries(["v2_members", "v2_pod_members", "v2_device_grants", "v2_audit", "v2_events"].map(table => [table, db.all(`SELECT * FROM ${table} ORDER BY rowid`)]));
    const release = async (result) => {
      assert.ok(waiting.length, "acceptance is waiting for the write lock");
      waiting.shift()();
      return await result;
    };
    await fn({ start, effects, release, holder, user, token, expires, expire: () => { now = RealDate.parse(expires); } });
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${name}  ${e.stack ?? e}`);
  } finally {
    if (holder?.isTransaction) holder.exec("ROLLBACK");
    while (waiting.length) waiting.shift()();
    await Promise.all(pending);
    holder?.close();
    globalThis.setTimeout = realSetTimeout;
    globalThis.Date = RealDate;
    globalThis.__alignV2Db?.domain.close();
    globalThis.__alignV2Db?.auth.close();
    delete globalThis.__alignV2Db;
    delete globalThis.__alignV2Touches;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false);
  }
}

function refused(result, status, code) {
  assert.equal(result.error?.status, status, `expected ${status} ${code}, got ${JSON.stringify(result)}`);
  assert.equal(result.error.code, code);
}

await test("invites: withdrawal during the write-lock wait grants nothing and records nothing", async f => {
  const result = f.start();
  assert.equal(f.holder.prepare("DELETE FROM v2_invites WHERE id = ? AND accepted_at IS NULL").run("test-invite").changes, 1);
  f.holder.exec("COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before, "failed consumption must add no membership, team membership, grant, audit or event");
  refused(outcome, 404, "not_found");
});

await test("invites: expiry during the write-lock wait grants nothing and records nothing", async f => {
  const result = f.start();
  f.expire();
  f.holder.exec("COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before, "failed consumption must add no membership, team membership, grant, audit or event");
  refused(outcome, 404, "not_found");
  assert.equal(db.get("SELECT accepted_at FROM v2_invites").accepted_at, null);
});

await test("invites: expiry between reload and consumption grants nothing and records nothing", async f => {
  const result = f.start();
  f.holder.exec("COMMIT");
  const before = f.effects();
  const Clock = globalThis.Date;
  let reloadedAt;
  globalThis.Date = class extends Clock {
    constructor(...args) {
      // The reload uses Date.now(); the member-cap check constructs the next date.
      if (!args.length) f.expire();
      super(...args);
    }
    static now() {
      const at = Clock.now();
      reloadedAt ??= at;
      return at;
    }
  };
  try {
    const outcome = await f.release(result);
    assert.ok(reloadedAt < Clock.parse(f.expires), "the in-transaction reload must see a valid invite");
    assert.equal(Clock.now(), Clock.parse(f.expires), "the clock must reach the deadline before consumption");
    refused(outcome, 404, "not_found");
    assert.deepEqual(f.effects(), before, "failed consumption must add no membership, team membership, grant, audit or event");
    assert.equal(db.get("SELECT accepted_at FROM v2_invites").accepted_at, null);
  } finally {
    globalThis.Date = Clock;
  }
});

await test("invites: competing acceptances have one winner and the loser records nothing", async f => {
  const first = f.start();
  const second = f.start();
  f.holder.exec("COMMIT");
  const winner = await f.release(first);
  assert.equal(winner.error, undefined);
  assert.equal(winner.value.role, "owner");
  assert.equal(db.get("SELECT COUNT(*) AS n FROM v2_members WHERE user_id = ?", f.user.id).n, 1);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM v2_pod_members").n, 1);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM v2_device_grants").n, 1);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM v2_audit").n, 2);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM v2_events").n, 2);
  const before = f.effects();
  const loser = await f.release(second);
  refused(loser, 409, "already_member");
  assert.equal(loser.error.extra?.workspace_id, "test-ws");
  assert.deepEqual(f.effects(), before, "losing acceptance must add no effects beyond the winner");
  await assert.rejects(acceptInvite(f.token, f.user, true), e => e.status === 409 && e.extra?.workspace_id === "test-ws");
  db.run("DELETE FROM v2_members WHERE user_id = ?", f.user.id);
  await assert.rejects(acceptInvite(f.token, f.user, true), e => e.status === 404 && e.code === "not_found");
});

await test("invites: workspace deletion during the write-lock wait grants nothing and records nothing", async f => {
  const result = f.start();
  f.holder.prepare("UPDATE v2_workspaces SET deleted_at = ?").run(new Date().toISOString());
  f.holder.exec("COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before);
  refused(outcome, 404, "not_found");
});

await test("invites: email is checked again after the write-lock wait", async f => {
  const result = f.start();
  f.holder.prepare("UPDATE v2_invites SET email = ?").run("changed@example.test");
  f.holder.exec("COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before);
  refused(outcome, 403, "email_mismatch");
});

await test("invites: workspace and team roles come from the invite read after the write-lock wait", async f => {
  const result = f.start();
  f.holder.exec("UPDATE v2_invites SET role = 'viewer', team_role = 'member'; COMMIT");
  const outcome = await f.release(result);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.role, "viewer");
  assert.equal(db.get("SELECT role FROM v2_members WHERE user_id = ?", f.user.id).role, "viewer");
  assert.equal(db.get("SELECT role FROM v2_pod_members").role, "member");
  assert.equal(db.get("SELECT props FROM v2_events WHERE name = 'invite_accepted'").props, '{"role":"viewer"}');
});

await test("invites: the member cap is still checked after the write-lock wait", async f => {
  process.env.ALIGN_MAX_MEMBERS = "2";
  const result = f.start();
  f.holder.exec("INSERT INTO ba_user VALUES ('test-other', 'Test other', 'other@example.test'); INSERT INTO v2_members SELECT ws_id, 'test-other', 'member', created_at FROM v2_members; COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before);
  refused(outcome, 403, "member_cap");
  assert.equal(db.get("SELECT accepted_at FROM v2_invites").accepted_at, null);
});

await test("invites: a consume update that changes zero rows grants nothing and records nothing", async f => {
  const result = f.start();
  f.holder.exec("CREATE TRIGGER test_no_consumption BEFORE UPDATE OF accepted_at ON v2_invites BEGIN SELECT RAISE(IGNORE); END; COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before);
  refused(outcome, 404, "not_found");
  assert.equal(db.get("SELECT accepted_at FROM v2_invites").accepted_at, null);
});

await test("invites: a failed device grant rolls back invite consumption and every effect", async f => {
  const result = f.start("test-unknown-device");
  f.holder.exec("COMMIT");
  const before = f.effects();
  const outcome = await f.release(result);
  assert.deepEqual(f.effects(), before);
  refused(outcome, 404, "not_found");
  assert.equal(db.get("SELECT accepted_at FROM v2_invites").accepted_at, null);
});

console.log(`\ntest-invite-races: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
