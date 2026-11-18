#!/usr/bin/env node
// Spend exceptions: real domain modules, migrations and SQLite transactions without a Next build or listener.
// The HTTP coverage remains in the clearly marked budgets section of test-v2.mjs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
if (path.resolve(ROOT) === path.join(process.env.HOME || "/", "liminal/align")) throw new Error("Run from a worktree");
// Match test-invite-races: only unused external dependencies are inert. No spending code is replaced.
const fixtures = new Map([
  [new URL("../lib/secret.ts", import.meta.url).href, 'export const secret = () => "spend-test-data-secret"; export const signPayload = () => { throw new Error("unused test dependency"); };'],
  [new URL("../lib/v2/captcha.ts", import.meta.url).href, 'export const requireCaptcha = () => { throw new Error("unused test dependency"); };'],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context);
    if (specifier.startsWith(".") && ["../lib/", "../app/"].some((dir) => context.parentURL?.startsWith(new URL(dir, import.meta.url).href))) {
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
      const source = readFileSync(new URL(url), "utf8").replaceAll("public ", "").replace("super(message ?? code);", "super(message ?? code); Object.assign(this, { status, code, extra });");
      return { format: "module-typescript", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const db = await import("../lib/v2/db.ts");
const spend = await import("../lib/v2/budgets.ts");
const { spendMonth } = await import("../lib/v2/spend-month.ts");
const { homeTeamId, chooseSpendHomeTeam, spendHomeTeam } = await import("../lib/v2/spend-home.ts");
const { memberPrincipal } = await import("../lib/v2/workspaces.ts");
const { openBindingEpoch, listSessions, currentSessionBudget } = await import("../lib/v2/sessions.ts");
const { pseudonymise, runRetention } = await import("../lib/v2/retention-core.mts");
const { purgeWorkspace } = await import("../lib/v2/core.mts");
const RealDate = Date;
const initial = RealDate.parse("2030-01-16T12:00:00.000Z");
let now = initial, passed = 0, failed = 0;
const W = "ws_spend", T = "pod_spend", T2 = "pod_other", end = "2030-02-01T00:00:00.000Z";
const pp = (who, ws = W) => memberPrincipal(ws, who);
const reject = (fn, status, code) => assert.rejects(fn, (e) => e.status === status && (!code || e.code === code));
const ask = (who = "member", b = {}) => spend.createBudgetRequest(pp(who), T, { amount_usd: 20, reason: "Finish the task", ...b }, "browser");
const act = (who, r, action, b = {}) => spend.actOnBudgetRequest(pp(who), r.id, action, { revision: r.revision, ...b });
const budget = (b = { amount_usd: 100, allowance_usd: 5 }, month = null) => spend.writeBudget(pp("lead"), T, month, b);
const burn = (who = "owner", month = null) => spend.budgetBurn(pp(who), T, month);
const snapshot = () => JSON.stringify(["v2_budget_requests", "v2_budget_request_decisions", "v2_team_budgets", "v2_team_budget_history", "v2_audit"].map((t) => db.all(`SELECT * FROM ${t} ORDER BY rowid`)));

async function test(name, fn) {
  const dir = mkdtempSync(path.join(ROOT, ".spend-test-"));
  const previous = { HOSTED: process.env.HOSTED, ALIGN_DATA_DIR: process.env.ALIGN_DATA_DIR };
  process.env.HOSTED = ""; process.env.ALIGN_DATA_DIR = dir;
  now = initial;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  try {
    db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY, name TEXT, email TEXT); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY); CREATE TABLE ba_session (id TEXT PRIMARY KEY, expiresAt TEXT, createdAt TEXT)");
    db.migrate();
    const at = new Date().toISOString();
    for (const who of ["owner", "owner2", "lead", "lead2", "member", "viewer", "other", "outside"]) db.run("INSERT INTO ba_user VALUES (?, ?, ?)", who, who, `${who}@example.test`);
    db.run("INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, 'Test workspace', 'owner', ?), ('ws_outside', 'Outside', 'outside', ?)", W, at, at);
    for (const [who, role] of [["owner", "owner"], ["owner2", "owner"], ["lead", "member"], ["lead2", "member"], ["member", "member"], ["viewer", "viewer"], ["other", "member"]]) db.run("INSERT INTO v2_members VALUES (?, ?, ?, ?)", W, who, role, at);
    db.run("INSERT INTO v2_members VALUES ('ws_outside', 'outside', 'owner', ?)", at);
    db.run("INSERT INTO v2_pods VALUES (?, ?, 'Build', ?), (?, ?, 'Other', ?)", T, W, at, T2, W, at);
    for (const [who, role] of [["lead", "lead"], ["lead2", "lead"], ["member", "member"], ["viewer", "lead"]]) db.run("INSERT INTO v2_pod_members VALUES (?, ?, ?, ?, ?)", W, T, who, role, at);
    db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'other', 'lead', ?)", W, T2, at);
    await fn();
    assert.deepEqual(db.all("PRAGMA foreign_key_check"), []);
    passed++; console.log(`PASS  budgets: ${name}`);
  } catch (e) {
    failed++; console.log(`FAIL  budgets: ${name}\n${e.stack ?? e}`);
  } finally {
    globalThis.Date = RealDate;
    globalThis.__alignV2Db?.domain.close(); globalThis.__alignV2Db?.auth.close();
    delete globalThis.__alignV2Db; delete globalThis.__alignV2Touches;
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(dir, { recursive: true, force: true });
  }
}

function goal(id, visibility = "workspace", team = T) {
  db.run("INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at) VALUES (?, ?, 'member', ?, ?, 1, ?, '[]', '{}', 'active', ?, ?)", id, W, team, visibility, `${id} private canary`, new Date().toISOString(), new Date().toISOString());
}
function session(key = "a".repeat(43), who = "member") {
  const at = "2030-01-01T00:00:00.000Z";
  db.run("INSERT OR IGNORE INTO v2_devices (id, user_id, name, public_key, created_at) VALUES ('dv_spend', ?, 'Test device', 'test key', ?)", who, at);
  db.run("INSERT INTO v2_sessions (ws_id, session_key, user_id, device_id, harness, repo_key, started_at, state, created_at, updated_at) VALUES (?, ?, ?, 'dv_spend', 'codex', 'test-repo', ?, 'shared', ?, ?)", W, key, who, at, at, at);
  return key;
}
async function usage(key, goalId, amount, requestKey = "r".repeat(43)) {
  const dev = { deviceId: "dv_spend", user: { id: "member" } };
  const epoch = `ep_${key.slice(0, 22)}`;
  await openBindingEpoch(pp("member"), dev, key, { epoch_id: epoch, goal_id: goalId, starts_at: "2030-01-01T00:00:00.000Z", cause: "manual" });
  db.run("INSERT INTO v2_usage (ws_id, session_key, request_key, epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source, received_at) VALUES (?, ?, ?, ?, ?, 'test-model', 'main', 10, 10, 0, 0, 0, 0, 'estimated_list_usd', ?, 'test', 'otel', ?)", W, key, requestKey, epoch, "2030-01-10T00:00:00.000Z", amount, new Date().toISOString());
}

if (process.argv[2] === "--race-worker") {
  const job = JSON.parse(process.argv[3]);
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [initial])); } static now() { return initial; } };
  try { const value = job.kind === "ask" ? await ask(job.who, job.body) : await act(job.who, job.request, job.action, job.body); console.log(JSON.stringify({ status: "fulfilled", value })); }
  catch (e) { console.log(JSON.stringify({ status: "rejected", reason: { status: e.status, code: e.code } })); }
  process.exit(0);
}
function race(jobs) {
  return Promise.all(jobs.map((job) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--race-worker", JSON.stringify(job)], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = ""; child.stdout.on("data", (s) => output += s); child.stderr.on("data", (s) => error += s);
    child.on("error", reject); child.on("exit", (code) => { try { if (code) throw new Error(error); resolve(JSON.parse(output)); } catch (e) { reject(e); } });
  })));
}

await test("absent budget and creation refusal preserve existing work", async () => {
  assert.equal(burn().budget, null); assert.equal(burn().estimated_spend_usd_micros, 0); assert.equal(burn().effective_budget_usd_micros, null);
  await reject(() => ask(), 409, "budget_missing");
  assert.equal(db.all("SELECT * FROM v2_directives").length, 0);
});
await test("set/change/remove are immutable audited history; no-op removal is idempotent", async () => {
  await budget(); await spend.writeBudget(pp("owner"), T, null, { amount_usd: 120 }); await budget(null); await budget(null);
  assert.deepEqual(burn().history.map((h) => [h.action, h.actor.id, h.amount_usd_micros]), [["set", "lead", 100_000_000], ["changed", "owner", 120_000_000], ["removed", "lead", null]]);
  assert.equal(db.all("SELECT * FROM v2_audit").length, 3); assert.equal(burn().budget, null);
});
await test("authorization matrix includes stored viewer-lead and cross-workspace isolation", async () => {
  for (const [who, status, code] of [["member", 403, "not_team_lead"], ["viewer", 403, "read_only"], ["other", 403, "not_team_lead"], ["outside", 404, "not_found"]]) {
    await reject(() => spend.writeBudget(pp(who), T, null, { amount_usd: 100 }), status, code);
    await reject(() => spend.writeBudget(pp(who), T, null, null), status, code);
  }
  await reject(() => spend.writeBudget(pp("outside", "ws_outside"), T, null, { amount_usd: 1 }), 404);
  assert.equal(db.all("SELECT * FROM v2_audit").length, 0);
});
await test("currency accepts cents exactly and rejects unknown/nonfinite/fractional/oversized amounts", async () => {
  for (const v of [null, undefined, "1", NaN, Infinity, -1, 0.001, 0.010000001, 1_000_001]) await reject(() => budget({ amount_usd: v }), 400);
  for (const v of [0, 0.29, 1_000_000]) assert.equal((await budget({ amount_usd: v })).budget.amount_usd_micros, Math.round(v * 100) * 10_000);
  await reject(() => budget({ amount_usd: 1, allowance_usd: -1 }), 400);
});
await test("UTC month validation, past/future reads and no carry-forward", async () => {
  for (const month of ["", "2030-00", "2030-13", "30-01", "2030-1", "2030-02-01"]) assert.throws(() => spendMonth(month), (e) => e.status === 400);
  await reject(() => budget({ amount_usd: 1 }, "2029-12"), 409, "month_closed");
  await budget({ amount_usd: 100 }, "2030-02");
  assert.equal(burn().budget, null); assert.equal(burn("owner", "2030-02").forecast_usd_micros, null);
  assert.equal(burn("owner", "2029-12").can.manage, false);
  assert.equal(spendMonth("2032-02").end - spendMonth("2032-02").start, 29 * 86_400_000);
});
await test("allowance defaults to one monthly grant; ceiling exhaustion waits and later changes preserve grants", async () => {
  await budget(); const a = await ask("member", { amount_usd: 5 }), b = await ask("member", { amount_usd: 5 });
  assert.equal(a.state, "granted"); assert.equal(a.authority_label, "This request was recorded under the team's allowance."); assert.deepEqual(a.decisions, []); assert.equal(a.expires_at, end);
  assert.equal(b.state, "waiting");
  assert.equal(burn().budget.allowance_ceiling_usd_micros, 5_000_000);
  assert.equal(burn().allowance_remaining_usd_micros, 0);
  assert.equal(burn().effective_budget_usd_micros, 105_000_000);
  await budget({ amount_usd: 100, allowance_usd: 0 });
  assert.equal(spend.getBudgetRequest(pp("member"), a.id).state, "granted"); assert.equal((await ask("member", { amount_usd: 0.01 })).state, "waiting");
});
await test("monthly allowance ceiling is transactional, never reset by budget changes, and starts anew next month", async () => {
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 8 });
  const results = (await race(["member", "lead"].map((who) => ({ kind: "ask", who, body: { amount_usd: 5 } })))).map((r) => { assert.equal(r.status, "fulfilled"); return r.value; });
  assert.deepEqual(results.map((r) => r.state).sort(), ["granted", "waiting"]);
  assert.equal(burn().allowance_granted_usd_micros, 5_000_000); assert.equal(burn().allowance_remaining_usd_micros, 3_000_000);
  assert.equal((await ask("member", { amount_usd: 3 })).state, "granted");
  await budget(null); await budget({ amount_usd: 100, allowance_usd: 5 });
  assert.equal(burn().allowance_remaining_usd_micros, 0);
  assert.equal((await ask("member", { amount_usd: 1 })).state, "waiting");
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 10 });
  assert.equal((await ask("member", { amount_usd: 2 })).state, "granted");
  assert.equal(burn().history.at(-1).allowance_ceiling_usd_micros, 10_000_000);
  for (const b of [{ amount_usd: 100, allowance_ceiling_usd: 1 }, { amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: -1 }, { amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 0.001 }]) await reject(() => budget(b), 400);
  now = RealDate.parse(end); await budget();
  assert.equal((await ask("member", { amount_usd: 5 })).state, "granted");
  assert.equal(burn().allowance_granted_usd_micros, 5_000_000);
});
await test("only non-viewer team members ask; reason, goal and sessions are validated", async () => {
  await budget(); goal("g_private", "private"); const key = session();
  for (const who of ["owner", "other"]) await reject(() => ask(who), 403, "not_in_team");
  await reject(() => ask("viewer"), 403, "read_only");
  for (const b of [{ amount_usd: 0 }, { reason: " " }, { reason: "\u200b" }, { reason: "x".repeat(1001) }, { session_keys: [key, key] }, { session_keys: ["bad"] }, { session_keys: Array(51).fill(key) }]) await reject(() => ask("member", b), 400);
  await reject(() => ask("lead", { goal_id: "g_private" }), 404);
  await reject(() => ask("lead", { session_keys: [key] }), 404);
  const r = await ask("member", { goal_id: "g_private", session_keys: [key] }); assert.equal(r.session_count, 1);
});
await test("private goal and session references are withheld from deciders and visible only to their owner", async () => {
  await budget(); goal("g_private", "private"); const key = session(); const r = await ask("member", { goal_id: "g_private", session_keys: [key] });
  const owner = spend.getBudgetRequest(pp("owner"), r.id), mine = spend.getBudgetRequest(pp("member"), r.id);
  assert.equal(owner.goal, null); assert.equal(owner.goal_hidden, true); assert.deepEqual(owner.session_keys, []); assert.equal(owner.session_count, 1);
  assert.ok(!JSON.stringify(owner).includes("g_private")); assert.ok(!JSON.stringify(owner).includes(key)); assert.equal(mine.goal.id, "g_private"); assert.deepEqual(mine.session_keys, [key]);
  assert.throws(() => spend.getBudgetRequest(pp("other"), r.id), (e) => e.status === 404);
  db.run("DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?", W, key);
  assert.equal(spend.getBudgetRequest(pp("member"), r.id).session_count, 1); assert.deepEqual(spend.getBudgetRequest(pp("member"), r.id).session_keys, []);
});
await test("self-approval is forbidden for a lead and for an owner who is also a team member", async () => {
  await budget();
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'owner', 'lead', ?)", W, T, new Date().toISOString());
  for (const who of ["lead", "owner"]) { const r = await ask(who); await reject(() => act(who, r, "approve", { amount_usd: 1, expires_at: end }), 403, "not_an_approver"); await reject(() => act(who, r, "decline", { reason: "No" }), 403); }
});
await test("partial approval has an actor, amount and expiry and raises the effective budget exactly once", async () => {
  await budget(); const r = await ask(); const a = await act("lead", r, "approve", { amount_usd: 12.34, expires_at: end, note: "Finish this part" });
  assert.equal(a.state, "granted"); assert.equal(a.authority, "approver"); assert.equal(a.decisions[0].actor.id, "lead"); assert.equal(a.approved_usd_micros, 12_340_000); assert.equal(burn().effective_budget_usd_micros, 112_340_000);
  await reject(() => act("lead2", r, "approve", { amount_usd: 12, expires_at: end }), 409, "stale_revision"); assert.equal(burn().effective_budget_usd_micros, 112_340_000);
});
await test("all invalid decisions roll back; revision errors precede body validation", async () => {
  await budget(); const r = await ask(); const before = snapshot();
  for (const body of [{ amount_usd: 21, expires_at: end }, { amount_usd: 0, expires_at: end }, { amount_usd: 1, expires_at: "2030-01-16T12:00:00Z" }, { amount_usd: 1, expires_at: "2030-02-01T00:00:01Z" }, { amount_usd: 1, expires_at: "bad" }]) await reject(() => act("lead", r, "approve", body), 400);
  await reject(() => act("lead", r, "decline", { reason: " " }), 400);
  await reject(() => act("lead", r, "decline", { revision: 99, reason: "x".repeat(1001) }), 400, "unknown_revision");
  await reject(() => spend.actOnBudgetRequest(pp("lead"), r.id, "decline", { reason: "No" }), 400);
  assert.equal(snapshot(), before);
});
await test("only requester withdraws and a withdrawn request accepts no decision", async () => {
  await budget(); const r = await ask(); await reject(() => act("owner", r, "withdraw"), 403, "not_requester");
  const w = await act("member", r, "withdraw"); assert.equal(w.state, "withdrawn");
  await reject(() => act("lead", w, "approve", { amount_usd: 1, expires_at: end }), 409, "wrong_state"); assert.deepEqual(w.decisions, []);
});
await test("wrong-state refusals say what happened and name the actor as you to that actor", async () => {
  await budget();
  const declined = await act("lead", await ask(), "decline", { reason: "Scope" });
  for (const [who, message] of [["lead", "You declined this request, so nothing changes."], ["owner", "This request was declined by lead, so nothing changes."]]) {
    await assert.rejects(() => act(who, declined, "approve", {}), (e) => e.code === "wrong_state" && e.message === message);
    assert.equal(spend.getBudgetRequest(pp(who), declined.id).state_note, message);
  }
  const withdrawn = await act("member", await ask(), "withdraw");
  assert.equal(withdrawn.state_note, "You withdrew this request, so nothing changes.");
  const granted = await act("lead", await ask(), "approve", { amount_usd: 1, expires_at: end });
  await assert.rejects(() => act("lead", granted, "approve", {}), (e) => e.message === "You already granted this request.");
});
await test("concurrent decisions store one decision and one grant", async () => {
  await budget(); const r = await ask(); const outcomes = await race([{ kind: "act", who: "lead", request: r, action: "approve", body: { amount_usd: 2, expires_at: end } }, { kind: "act", who: "lead2", request: r, action: "decline", body: { reason: "No" } }]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1); assert.equal(outcomes.find((r) => r.status === "rejected").reason.status, 409);
  assert.equal(spend.getBudgetRequest(pp("member"), r.id).decisions.length, 1);
});
await test("authorization is checked again after waiting for the SQLite writer lock", async () => {
  await budget();
  const holder = new DatabaseSync(db.dbFile(), { timeout: 0 });
  try {
    holder.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    const before = snapshot();
    const pending = spend.writeBudget(pp("lead"), T, null, { amount_usd: 999 });
    holder.prepare("UPDATE v2_pod_members SET role = 'member' WHERE ws_id = ? AND user_id = 'lead'").run(W);
    holder.exec("COMMIT");
    await reject(() => pending, 403, "not_team_lead");
    assert.equal(snapshot(), before);
    holder.exec("BEGIN IMMEDIATE");
    const create = ask();
    holder.prepare("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'").run(W);
    holder.exec("COMMIT");
    await reject(() => create, 403, "not_in_team");
    assert.equal(snapshot(), before);
  } finally { if (holder.isTransaction) holder.exec("ROLLBACK"); holder.close(); }
});
await test("second look excludes requester, leads and first owner; preserves both decisions", async () => {
  await budget(); const r = await ask(); const d = await act("owner", r, "decline", { reason: "Scope" }); const s = await act("member", d, "second-look");
  for (const who of ["member", "lead", "owner"]) await reject(() => act(who, s, "approve", { amount_usd: 10, expires_at: end }), 403);
  const g = await act("owner2", s, "approve", { amount_usd: 10, expires_at: end });
  assert.deepEqual(g.decisions.map((d) => [d.decision, d.actor.id]), [["declined", "owner"], ["granted", "owner2"]]);
  await reject(() => act("member", g, "second-look"), 409, "wrong_state");
});
await test("only one referral even after two declines; a newly promoted first decider remains ineligible", async () => {
  await budget(); const r = await ask(); const d = await act("lead", r, "decline", { reason: "Scope" }); const s = await act("member", d, "second-look");
  db.run("UPDATE v2_members SET role = 'owner' WHERE ws_id = ? AND user_id = 'lead'", W);
  await reject(() => act("lead", s, "decline", { reason: "Again" }), 403, "not_an_approver");
  const d2 = await act("owner", s, "decline", { reason: "Still no" });
  await reject(() => act("member", d2, "second-look"), 409, "wrong_state"); assert.equal(d2.decisions.length, 2);
});
await test("a second look without an eligible owner is explained and refused without recording anything", async () => {
  await budget(); const d = await act("owner", await ask(), "decline", { reason: "Scope" });
  db.run("UPDATE v2_members SET role = 'member' WHERE ws_id = ? AND user_id = 'owner2'", W);
  const before = snapshot(), read = spend.getBudgetRequest(pp("member"), d.id);
  assert.equal(read.can.second_look, false); assert.match(read.second_look_unavailable_reason, /No other workspace owner/);
  await reject(() => act("member", read, "second-look"), 409, "no_eligible_approver"); assert.equal(snapshot(), before);
  db.run("UPDATE v2_members SET role = 'owner' WHERE ws_id = ? AND user_id = 'owner2'", W);
  const s = await act("member", read, "second-look"); assert.equal(s.state, "waiting");
  db.run("UPDATE v2_members SET role = 'member' WHERE ws_id = ? AND user_id = 'owner2'", W);
  const stuck = spend.getBudgetRequest(pp("member"), s.id);
  assert.deepEqual(stuck.approvers, []); assert.match(stuck.decision_unavailable_reason, /No other workspace owner/);
});
await test("sole lead and sole owner may create a waiting request but can never decide it", async () => {
  await budget();
  db.run("UPDATE v2_members SET role = 'member' WHERE ws_id = ? AND user_id = 'owner2'", W);
  db.run("UPDATE v2_pod_members SET role = 'member' WHERE ws_id = ? AND pod_id = ?", W, T);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'owner', 'lead', ?)", W, T, new Date().toISOString());
  const r = await ask("owner");
  assert.equal(r.state, "waiting"); assert.deepEqual(r.approvers, []); assert.match(r.decision_unavailable_reason, /Nobody is eligible/);
  assert.deepEqual(spend.listBudgetRequests(pp("owner")).mine[0], r);
  await reject(() => act("owner", r, "approve", { amount_usd: 1, expires_at: end }), 403, "not_an_approver");
});
await test("expiry happens exactly at its instant and month end, without background writes", async () => {
  await budget(); const r = await ask(); const g = await act("lead", r, "approve", { amount_usd: 10, expires_at: "2030-01-17T00:00:00Z" });
  const waiting = await ask(), declined = await act("lead", await ask(), "decline", { reason: "No" });
  const before = snapshot(); now = RealDate.parse("2030-01-17T00:00:00Z");
  assert.equal(spend.getBudgetRequest(pp("member"), g.id).state, "expired"); assert.equal(burn().effective_budget_usd_micros, 100_000_000);
  now = RealDate.parse(end);
  assert.equal(spend.getBudgetRequest(pp("member"), waiting.id).state, "expired"); assert.equal(spend.getBudgetRequest(pp("member"), declined.id).state, "declined"); assert.equal(burn().budget, null);
  await reject(() => act("member", declined, "second-look"), 409); assert.equal(snapshot(), before);
});
await test("aggregate burn includes private goals and captures no-goal membership at epoch opening", async () => {
  await budget(); goal("g_public"); goal("g_private", "private");
  await usage(session("a".repeat(43)), "g_public", 20_000_000);
  await usage(session("b".repeat(43)), "g_private", 10_000_000);
  await usage(session("c".repeat(43)), null, 10_000_000);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  for (const who of ["owner", "viewer"]) { const b = burn(who); assert.equal(b.estimated_spend_usd_micros, 40_000_000); assert.equal(b.remaining_usd_micros, 60_000_000); assert.equal(b.no_goal.share_percent, 25); assert.ok(!JSON.stringify(b).includes("g_private")); }
  assert.throws(() => burn("other"), (e) => e.status === 404);
  assert.equal(burn().forecast_usd_micros, 80_000_000); assert.equal(burn().runs_out_at, null);
});
await test("no-goal work counts only in the earliest joined team", async () => {
  await budget(); db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date().toISOString());
  await usage(session(), null, 10_000_000);
  assert.equal(burn().priced_spend_usd_micros, 10_000_000); assert.equal(spend.budgetBurn(pp("owner"), T2).priced_spend_usd_micros, 0);
});
await test("unpriced work yields labelled spend/forecast lower bounds and a remaining upper bound; shares stay absent", async () => {
  await budget(); assert.equal(burn().no_goal.share_percent, null); await usage(session(), null, null);
  const b = burn(); assert.equal(b.unpriced_requests, 1); assert.equal(b.priced_spend_usd_micros, 0);
  assert.equal(b.estimated_spend_usd_micros, 0); assert.equal(b.spend_bound, "lower");
  assert.equal(b.remaining_usd_micros, 100_000_000); assert.equal(b.remaining_bound, "upper");
  assert.equal(b.forecast_usd_micros, 0); assert.equal(b.forecast_bound, "lower"); assert.equal(b.runs_out_at, null);
  assert.match(b.pricing_note, /1 unpriced request excluded/);
  assert.equal(b.no_goal.estimated_spend_usd_micros, 0); assert.equal(b.no_goal.spend_bound, "lower"); assert.equal(b.no_goal.share_percent, null);
  await usage(session("b".repeat(43)), null, 40_000_000);
  const priced = burn(); assert.equal(priced.estimated_spend_usd_micros, 40_000_000); assert.equal(priced.forecast_usd_micros, 80_000_000); assert.equal(priced.remaining_usd_micros, 60_000_000);
  now = RealDate.parse("2030-02-01T00:00:00Z");
  const future = burn("owner", "2030-03"); assert.equal(future.forecast_usd_micros, null); assert.equal(future.forecast_bound, null);
});
await test("linear exhaustion forecast accounts for grant expiry and negative remaining", async () => {
  await budget({ amount_usd: 50 }); await usage(session(), null, 40_000_000);
  const grant = await act("lead", await ask(), "approve", { amount_usd: 20, expires_at: "2030-01-21T00:00:00Z" });
  assert.equal(burn().forecast_usd_micros, 80_000_000); assert.equal(burn().runs_out_at, "2030-01-21T00:00:00.000Z");
  assert.equal(grant.approved_usd_micros, 20_000_000);
  await budget({ amount_usd: 10 }); assert.equal(burn().remaining_usd_micros, -10_000_000);
});
await test("request groups show own terminal states and waiting only to eligible deciders; reads are inert", async () => {
  await budget(); const granted = await ask("member", { amount_usd: 1 }), waiting = await ask(), declined = await act("lead", await ask(), "decline", { reason: "No" });
  const before = snapshot(); const owner = spend.listBudgetRequests(pp("owner")), mine = spend.listBudgetRequests(pp("member"));
  assert.equal(owner.waiting_on_me.length, 1); assert.equal(owner.waiting_on_me[0].id, waiting.id);
  assert.deepEqual(new Set(mine.mine.map((r) => r.state)), new Set(["waiting", "granted", "declined"]));
  assert.deepEqual(spend.listBudgetRequests(pp("other")), { waiting_on_me: [], mine: [], others: [], next_cursor: null });
  assert.equal(spend.getBudgetRequest(pp("member"), granted.id).authority, "allowance"); assert.equal(spend.getBudgetRequest(pp("member"), declined.id).can.second_look, true); assert.equal(snapshot(), before);
});
await test("Home selects only actionable requests and own current/previous-month records; member count does not multiply queries", async () => {
  await budget(); const current = await ask(), old = await ask(), previous = await ask();
  db.run("UPDATE v2_budget_requests SET month = '2029-11' WHERE id = ?", old.id);
  db.run("UPDATE v2_budget_requests SET month = '2029-12' WHERE id = ?", previous.id);
  const ownLead = await ask("lead");
  const mine = spend.homeBudgetRequests(pp("member"));
  assert.deepEqual(new Set(mine.mine.map((r) => r.id)), new Set([current.id, previous.id]));
  assert.equal(mine.mine.find((r) => r.id === previous.id).state, "expired");
  const lead = spend.homeBudgetRequests(pp("lead"));
  assert.deepEqual(lead.waiting_on_me.map((r) => r.id), [current.id]); assert.deepEqual(lead.mine.map((r) => r.id), [ownLead.id]);
  assert.equal(spend.listBudgetRequests(pp("member")).mine.length, 1);
  assert.equal(spend.listBudgetRequests(pp("member"), undefined, "2029-11").mine[0].id, old.id);
  const cache = db.openDb().stmts, originalGet = cache.get;
  let reads = 0;
  cache.get = function (sql) {
    const stmt = originalGet.call(this, sql);
    if (!stmt) return stmt;
    return new Proxy(stmt, { get(target, key) {
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? (...args) => { if (key === "get" || key === "all") reads++; return value.apply(target, args); } : value;
    } });
  };
  try {
    const reader = pp("lead"); reads = 0; spend.homeBudgetRequests(reader); const baseline = reads;
    for (let n = 0; n < 100; n++) {
      db.run("INSERT INTO ba_user VALUES (?, ?, ?)", `extra${n}`, `Extra ${n}`, `extra${n}@example.test`);
      db.run("INSERT INTO v2_members VALUES (?, ?, 'member', ?)", W, `extra${n}`, new Date().toISOString());
    }
    reads = 0; spend.homeBudgetRequests(reader); assert.equal(reads, baseline);
    assert.ok(baseline < 40, `bounded request hydration: ${baseline} reads`);
  } finally { cache.get = originalGet; }
});
await test("retention roll-ups preserve team/no-goal totals and cover multi-team requests once", async () => {
  await budget(); goal("g_public"); db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date().toISOString());
  await usage(session(), null, 10_000_000); await usage(session("b".repeat(43)), "g_public", 20_000_000);
  const before = burn();
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.equal(db.all("SELECT * FROM v2_sessions").length, 0);
  const after = burn(); assert.equal(after.priced_spend_usd_micros, before.priced_spend_usd_micros); assert.equal(after.no_goal.share_percent, before.no_goal.share_percent); assert.equal(after.no_goal.attribution_unknown, false);
  assert.equal(db.get("SELECT requests, team_attributed_requests FROM v2_spend_rollups WHERE goal_id = ''").team_attributed_requests, 1);
});
await test("pre-feature unattributable no-goal roll-ups report unknown rather than zero", async () => {
  await budget(); db.run("INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, requests, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, est_list_usd_micros, unpriced_requests) VALUES (?, '', '2030-01-02', 'old', 'unknown', 2, 1, 1, 0, 0, 0, 0, 10, 1)", W);
  const b = burn(); assert.equal(b.no_goal.attribution_unknown, true); assert.equal(b.no_goal.unattributed_rolled_up_requests, 2); assert.equal(b.no_goal.unattributed_rolled_up_unpriced_requests, 1); assert.equal(b.unpriced_requests, null); assert.equal(b.known_unpriced_requests, 0); assert.equal(b.estimated_spend_usd_micros, null); assert.equal(b.remaining_usd_micros, null); assert.equal(b.no_goal.share_percent, null);
});
await test("former-member replacement covers every new actor column; workspace purge cascades all records", async () => {
  await budget(); const r = await ask(); await act("owner", r, "decline", { reason: "No" });
  await db.tx(() => { db.run("DELETE FROM v2_members WHERE ws_id = ? AND user_id = 'owner'", W); pseudonymise(db.sql, W, "owner", new Date().toISOString(), "test-secret"); });
  assert.equal(spend.getBudgetRequest(pp("owner2"), r.id).decisions[0].actor.name, "Former member #1");
  await db.tx(() => purgeWorkspace(db.sql, W));
  for (const t of ["v2_team_budgets", "v2_team_budget_history", "v2_budget_requests", "v2_budget_request_decisions", "v2_budget_request_sessions", "v2_team_no_goal_rollups", "v2_spend_home_teams"]) assert.deepEqual(db.all(`SELECT * FROM ${t}`), []);
});
await test("migration 24 leaves every pre-feature period without a home team and preserves unallocated spend", async () => {
  const migrations = runInNewContext(/const MIGRATIONS: string\[\] = (\[[\s\S]*?\n\]);/.exec(readFileSync(path.join(ROOT, "lib/v2/db.ts"), "utf8"))[1]);
  assert.equal(migrations.length, 24);
  const old = new DatabaseSync(":memory:");
  try {
    old.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY)");
    migrations.slice(0, 23).forEach((m) => old.exec(m));
    old.exec("INSERT INTO ba_user VALUES ('m'); INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES ('w', 'Old', 'm', 'x'); INSERT INTO v2_members VALUES ('w','m','owner','x'); INSERT INTO v2_pods VALUES ('z','w','First team','x'), ('a','w','Later team','x'); INSERT INTO v2_pod_members VALUES ('w','z','m','member','2020'), ('w','a','m','member','2021'); INSERT INTO v2_sessions (ws_id, session_key, user_id, harness, repo_key, started_at, state, created_at, updated_at) VALUES ('w','s','m','codex','r','x','shared','x','x'); INSERT INTO v2_epochs (ws_id, session_key, epoch_id, starts_at, cause, authority, created_at) VALUES ('w','s','e','x','manual','none','x');");
    old.exec("INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, requests, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, est_list_usd_micros, unpriced_requests) VALUES ('w','','2020-01-01','old','unknown',1,1,2,3,4,5,6,100,0)");
    old.exec(migrations[23]);
    assert.equal(old.prepare("SELECT spend_team_id FROM v2_epochs WHERE epoch_id = 'e'").get().spend_team_id, null);
    const retained = old.prepare("SELECT * FROM v2_spend_rollups").get();
    assert.equal(retained.requests, 1); assert.equal(retained.est_list_usd_micros, 100); assert.equal(retained.team_attributed_requests, 0);
    assert.deepEqual(old.prepare("SELECT * FROM v2_team_no_goal_rollups").all(), []);
    assert.deepEqual(old.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { old.close(); }
});
await test("home choice is personal, membership-bound, and affects only later epochs", async () => {
  await budget();
  assert.equal(homeTeamId(W, "member"), T); assert.equal(homeTeamId(W, "owner"), null);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date(now + 1000).toISOString());
  await usage(session(), null, 10_000_000);
  assert.equal(spendHomeTeam(pp("member")).can_choose, true);
  await chooseSpendHomeTeam(pp("member"), { team_id: T2 });
  assert.equal(currentSessionBudget(pp("member"), "a".repeat(43)).team.id, T);
  assert.throws(() => currentSessionBudget(pp("owner"), "a".repeat(43)), (e) => e.status === 404);
  await usage(session("b".repeat(43)), null, 20_000_000);
  assert.equal(burn().priced_spend_usd_micros, 10_000_000);
  assert.equal(spend.budgetBurn(pp("owner"), T2).priced_spend_usd_micros, 20_000_000);
  await spend.writeBudget(pp("owner"), T2, null, { amount_usd: 100 });
  const labels = listSessions(pp("member")).mine.map((s) => s.team_budget_label).join(" ");
  assert.match(labels, /Build's team budget/); assert.match(labels, /Other's team budget/);
  await reject(() => chooseSpendHomeTeam(pp("other"), { team_id: T }), 404);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member' AND pod_id = ?", W, T2);
  assert.equal(homeTeamId(W, "member"), T);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  await usage(session("c".repeat(43)), null, 30_000_000);
  assert.equal(homeTeamId(W, "member"), null);
  assert.equal(burn().priced_spend_usd_micros + spend.budgetBurn(pp("owner"), T2).priced_spend_usd_micros, 30_000_000);
  const { spend: report } = await import("../lib/v2/spend.ts");
  assert.equal(report(pp("owner"), "team", null, null).total.est_list_usd_micros, 60_000_000);
});

await test("CSV and burn share home attribution; every numeric and basis total survives retention and privacy", async () => {
  const { spendTeamExport, spend: report } = await import("../lib/v2/spend.ts");
  const { spendCsv, spendMonth } = await import("../lib/v2/spend-export.ts");
  await budget(); goal("g_private", "private");
  await usage(session(), null, 10_123_456);
  await usage(session("b".repeat(43)), "g_private", 20_000_000);
  await chooseSpendHomeTeam(pp("member"), { team_id: T });
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  await usage(session("c".repeat(43)), null, null);
  const range = spendMonth("2030-01");
  const read = (who) => spendTeamExport(pp(who), range.from, range.to);
  const before = [read("owner"), read("other")];
  for (const who of ["owner", "viewer", "other"]) {
    const r = read(who), old = report(pp(who), "team", range.from, range.to);
    assert.equal(r.total.requests, old.total.requests);
    for (const k of Object.keys(r.total).filter((k) => k !== "by_basis")) {
      assert.equal(r.total[k], [...r.rows, ...r.no_goal, r.unallocated].reduce((n, s) => n + s[k], 0), k);
      for (const basis of Object.keys(r.total.by_basis))
        assert.equal(r.total.by_basis[basis][k], [...r.rows, ...r.no_goal, r.unallocated].reduce((n, s) => n + s.by_basis[basis][k], 0));
    }
    if (who !== "other") assert.equal(r.no_goal[0].est_list_usd_micros, burn().no_goal.priced_spend_usd_micros);
    assert.equal(r.unallocated.unpriced_requests, 1);
    const csv = spendCsv(pp(who), range);
    assert.ok(csv.includes(who === "other" ? '"30.123456"' : '"10.123456"')); assert.ok(!csv.includes("g_private")); assert.ok(!csv.includes("a".repeat(43)));
  }
  assert.equal(read("owner").no_goal[0].label, "Build: spend in no goal");
  assert.equal(read("other").no_goal.length, 0);
  assert.equal(read("other").rows.filter((r) => r.kind === "private").length, 1);
  assert.equal(read("other").rows.find((r) => r.kind === "private").est_list_usd_micros, 30_123_456);
  assert.ok(!spendCsv(pp("other"), range).includes("Build"));
  db.run("UPDATE v2_pods SET name = ? WHERE id = ?", '=1+1,\n"quoted"', T);
  assert.ok(spendCsv(pp("owner"), range).includes('"\'=1+1,\n""quoted"": spend in no goal"'));
  db.run("UPDATE v2_pods SET name = 'Build' WHERE id = ?", T);
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.deepEqual([read("owner"), read("other")], before);
  assert.equal(db.all("SELECT * FROM v2_team_no_goal_rollups").length, 1);
});


await test("member-or-owner budget privacy and unnamed-row folding", async () => {
  await budget(); goal("g_public"); await usage(session(), "g_public", 20_000_000); await usage(session("b".repeat(43)), null, 10_000_000);
  for (const who of ["member", "viewer", "owner"]) assert.equal(burn(who).estimated_spend_usd_micros, 30_000_000);
  assert.throws(() => burn("other"), (e) => e.status === 404);
  const { spendTeamExport } = await import("../lib/v2/spend.ts"), hidden = spendTeamExport(pp("other"), "2030-01-01T00:00:00Z", end);
  assert.ok(!JSON.stringify(hidden).includes("Build")); assert.equal(hidden.no_goal.length, 0);
  assert.equal(hidden.rows.filter((r) => r.kind === "private").length, 1); assert.equal(hidden.rows[0].est_list_usd_micros, 30_000_000);
});
await test("terminal source cannot receive an allowance and five waiting requests is the limit", async () => {
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 100 });
  for (let n = 0; n < 5; n++) { const r = await spend.createBudgetRequest(pp("member"), T, { amount_usd: 1, reason: "Finish work", filed_from: "browser" }, "terminal"); assert.equal(r.state, "waiting"); assert.equal(r.filed_from, "terminal"); assert.equal(r.authority, null); }
  await reject(() => spend.createBudgetRequest(pp("member"), T, { amount_usd: 1, reason: "Finish work" }, "terminal"), 409, "too_many_waiting_requests");
  const browser = await ask("member", { amount_usd: 1 }); assert.equal(browser.state, "granted"); assert.equal(browser.filed_from, "browser");
});
await test("budget lists default to this month and page without duplicate rows", async () => {
  await budget(); for (let n = 0; n < 5; n++) await ask();
  const one = spend.listBudgetRequests(pp("member"), T, null, { limit: "2" });
  const two = spend.listBudgetRequests(pp("member"), T, null, { limit: "2", cursor: one.next_cursor });
  assert.equal(one.mine.length, 2); assert.equal(two.mine.length, 2); assert.equal(new Set([...one.mine, ...two.mine].map((r) => r.id)).size, 4);
  assert.throws(() => spend.listBudgetRequests(pp("member"), T, null, { limit: "101" }), (e) => e.status === 400);
});

await test("Home budget requests use the one Needs list, its counts, phases and record links", async () => {
  const { buildNeeds, inPhase } = await import("../app/app/_ui/home/needs.ts");
  await budget(); const r = await ask();
  const view = (me, rows) => buildNeeds({ ws: W, me, crs: [], asks: [], alignments: [], apps: [], budgets: rows });
  const owner = view("owner", [spend.getBudgetRequest(pp("owner"), r.id)]);
  assert.equal(inPhase(owner.rows, "needs_you").length, 1); assert.equal(owner.rows[0].key, `budget:${r.id}`);
  assert.ok(owner.rows[0].href.includes(`request=${r.id}`)); assert.equal(owner.unknown.length, 0);
  assert.equal(inPhase(view("member", [r]).rows, "waiting_on_others").length, 1);
  const declined = await act("lead", r, "decline", { reason: "Scope" });
  assert.equal(inPhase(view("member", [declined]).rows, "needs_you").length, 1);
  const withdrawn = await act("member", await ask(), "withdraw");
  assert.equal(inPhase(view("member", [withdrawn]).rows, "done").length, 1);
  assert.ok(view("owner", null).unknown.includes("budget requests"));
});

console.log(`test-budgets: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
