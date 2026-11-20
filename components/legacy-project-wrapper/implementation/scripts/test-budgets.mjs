#!/usr/bin/env node
// Team budgets: real domain modules, migrations and SQLite transactions without a Next build or listener.
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
async function usage(key, goalId, amount, requestKey = "r".repeat(43), who = "member") {
  const dev = { deviceId: "dv_spend", user: { id: who } };
  const epoch = `ep_${key.slice(0, 22)}`;
  await openBindingEpoch(pp(who), dev, key, { epoch_id: epoch, goal_id: goalId, starts_at: "2030-01-01T00:00:00.000Z", cause: "manual" });
  db.run("INSERT INTO v2_usage (ws_id, session_key, request_key, epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source, received_at) VALUES (?, ?, ?, ?, ?, 'test-model', 'main', 10, 10, 0, 0, 0, 0, 'estimated_list_usd', ?, 'test', 'otel', ?)", W, key, requestKey, epoch, "2030-01-10T00:00:00.000Z", amount, new Date().toISOString());
}

if (process.argv[2] === "--race-worker") {
  const job = JSON.parse(process.argv[3]);
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [initial])); } static now() { return initial; } };
  try { const value = job.kind === "read" ? await burn() : job.kind === "ask" ? await ask(job.who, job.body) : await act(job.who, job.request, job.action, job.body); console.log(JSON.stringify({ status: "fulfilled", value })); }
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

await test("origin retries preserve captured team attribution and closed period displays", async () => {
  await budget();
  const key = session(), dev = { deviceId: "dv_spend", user: { id: "member" } };
  const body = { epoch_id: `ep_${"p".repeat(22)}`, goal_id: null, starts_at: "2030-01-01T00:00:00.000Z", root_turn: "turn-1", cause: "manual", origin: "folder_rule" };
  const open = (b = body) => openBindingEpoch(pp("member"), dev, key, b);
  const [first, concurrent] = await Promise.all([open(), open()]);
  assert.deepEqual(concurrent, first);
  assert.equal(first.origin, "folder_rule");
  assert.match(listSessions(pp("member")).mine[0].team_budget_label, /Build's team budget/);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date().toISOString());
  await chooseSpendHomeTeam(pp("member"), { team_id: T2 });
  const stored = () => db.get("SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", W, key, body.epoch_id);
  const before = stored();
  for (const origin of [undefined, null, "switch_request", "folder_rule"]) assert.deepEqual(await open({ ...body, origin }), first);
  for (const change of [{ origin: "hand" }, { root_turn: "turn-2" }, { starts_at: "2030-01-02T00:00:00.000Z" }]) {
    await reject(() => open({ ...body, ...change }), 409, "epoch_conflict");
  }
  await reject(() => open({ ...body, origin: "unknown" }), 400);
  await reject(() => open({ ...body, cause: `directive:dir_${"a".repeat(24)}` }), 400);
  assert.deepEqual(stored(), before);
  assert.equal(stored().spend_team_id, T);
  const endsAt = "2030-01-03T00:00:00.000Z";
  db.run("UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ?", endsAt, W, key);
  assert.deepEqual(await open(), { ...first, ends_at: endsAt });
  const listed = listSessions(pp("member")).mine[0];
  assert.equal(listed.current_epoch, null);
  assert.deepEqual(listed.last_epoch, { origin: "folder_rule" });
  assert.equal(listed.team_budget_label, null);
});

await test("switch acceptance changes on retries preserve the recorded origin", async () => {
  goal("g_switch");
  const key = session(), directive = `dir_${"a".repeat(24)}`, request = `rq_${"a".repeat(24)}`, at = "2030-01-01T00:00:00.000Z";
  db.run("INSERT INTO v2_directives (id, ws_id, kind, goal_id, created_at) VALUES (?, ?, 'request', 'g_switch', ?)", directive, W, at);
  db.run("INSERT INTO v2_directive_targets VALUES (?, ?, ?)", W, directive, key);
  db.run("INSERT INTO v2_requests (id, ws_id, goal_id, type, target_goal_id, goal_version, sender_id, sender_role, directive_id, created_at) VALUES (?, ?, 'g_switch', 'switch_goal', 'g_switch', 1, 'owner', 'owner', ?, ?)", request, W, directive, at);
  db.run("INSERT INTO v2_request_targets (ws_id, request_id, session_key, state, updated_at) VALUES (?, ?, ?, 'received', ?)", W, request, key, at);
  const body = { epoch_id: `ep_${"p".repeat(22)}`, goal_id: "g_switch", starts_at: at, cause: `directive:${directive}`, origin: "switch_request" };
  const open = (b = body) => openBindingEpoch(pp("member"), { deviceId: "dv_spend", user: { id: "member" } }, key, b);
  const first = await open();
  assert.equal(first.origin, null);
  await reject(() => open({ ...body, cause: "manual" }), 409, "epoch_conflict");
  await reject(() => open({ ...body, goal_id: null }), 409, "epoch_conflict");
  db.run("UPDATE v2_request_targets SET state = 'accepted'");
  assert.deepEqual(await open(), first);
  const acceptedBody = { ...body, epoch_id: `ep_${"q".repeat(22)}`, starts_at: "2030-01-02T00:00:00.000Z" };
  const accepted = await open(acceptedBody);
  assert.equal(accepted.origin, "switch_request");
  db.run("UPDATE v2_request_targets SET state = 'received'");
  assert.deepEqual(await open(acceptedBody), accepted);
});

await test("origin spend agrees with team exports, budget totals and billing bases", async () => {
  await budget(); goal("g_origins");
  for (const [letter, origin, basis, amount] of [["a", "hand", "api_usd", 10], ["b", "folder_rule", "subscription_included", 20], ["c", null, "unknown", null]]) {
    const key = session(letter.repeat(43));
    await usage(key, "g_origins", amount);
    db.run("UPDATE v2_epochs SET origin = ? WHERE session_key = ?", origin, key);
    db.run("UPDATE v2_usage SET basis = ? WHERE session_key = ?", basis, key);
  }
  const { spend: report, spendTeamExport } = await import("../lib/v2/spend.ts");
  const from = "2030-01-01T00:00:00.000Z", to = end;
  const byGoal = report(pp("owner"), "goal", from, to), byTeam = spendTeamExport(pp("owner"), from, to);
  assert.deepEqual(byGoal.total, byTeam.total);
  assert.equal(byGoal.total.by_basis.api_usd.est_list_usd_micros, 10);
  assert.equal(byGoal.total.by_basis.subscription_included.est_list_usd_micros, 20);
  assert.equal(byGoal.total.by_basis.unknown.unpriced_requests, 1);
  const split = byGoal.rows[0].by_origin;
  for (const field of ["requests", "est_list_usd_micros", "unpriced_requests"]) assert.equal(split.reduce((n, row) => n + row[field], 0), byGoal.total[field]);
  assert.equal((await burn()).priced_spend_usd_micros, byGoal.total.est_list_usd_micros);
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  const retained = report(pp("owner"), "goal", from, to);
  assert.deepEqual(retained.total, byGoal.total);
  assert.equal(retained.rows[0].by_origin.length, 1);
  assert.equal(retained.rows[0].by_origin[0].rolled_up, true);
  assert.equal(retained.rows[0].by_origin[0].origin, null);
  assert.deepEqual(spendTeamExport(pp("owner"), from, to).total, retained.total);
});

await test("absent budget and creation refusal preserve existing work", async () => {
  assert.equal((await burn()).budget, null); assert.equal((await burn()).estimated_spend_usd_micros, 0); assert.equal((await burn()).effective_budget_usd_micros, null);
  await reject(() => ask(), 409, "budget_missing");
  assert.equal(db.all("SELECT * FROM v2_directives").length, 0);
});
await test("teams of one or two can keep a budget and report the small-team disclosure condition", async () => {
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id <> 'lead'", W, T);
  await budget(); assert.equal((await burn()).team_member_count, 1); assert.equal((await burn()).budget.amount_usd_micros, 100_000_000);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T, new Date().toISOString());
  assert.equal((await burn()).team_member_count, 2); assert.equal((await burn()).budget.amount_usd_micros, 100_000_000);
});
await test("no-goal spend from fewer than three people is flagged without a count", async () => {
  await budget(); goal("g_public");
  const add = async (who, letter, amount = 1_000_000) => {
    const key = session(letter.repeat(43), who);
    await usage(key, null, amount, "r".repeat(43), who);
    return key;
  };
  assert.ok((await burn()).team_member_count >= 3); assert.equal((await burn()).no_goal.few_contributors, false);
  await usage(session("g".repeat(43)), "g_public", 9_000_000);
  await add("other", "o");
  const beforeMonth = await add("lead", "b"), afterRead = await add("lead", "f"), unattributed = await add("lead", "h");
  db.run("UPDATE v2_usage SET ts = '2029-12-31T23:59:59.999Z' WHERE session_key = ?", beforeMonth);
  db.run("UPDATE v2_usage SET ts = ? WHERE session_key = ?", new Date(now).toISOString(), afterRead);
  db.run("UPDATE v2_epochs SET spend_team_id = NULL WHERE session_key = ?", unattributed);
  assert.equal((await burn()).no_goal.few_contributors, false);
  const first = await add("member", "a");
  await usage(first, null, 2_000_000, "s".repeat(43));
  await add("member", "c");
  assert.equal((await burn()).no_goal.few_contributors, true);
  assert.equal((await burn("viewer")).no_goal.few_contributors, true);
  await add("lead", "d", null);
  assert.equal((await burn()).no_goal.few_contributors, true);
  // A later home-team choice cannot change the captured attribution or who counts as a contributor.
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date().toISOString());
  await chooseSpendHomeTeam(pp("member"), { team_id: T2 });
  await add("member", "j");
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = 'member'", W, T);
  assert.equal((await burn()).team_member_count, 3); assert.equal((await burn()).no_goal.few_contributors, true);
  await add("lead2", "e");
  assert.equal((await burn()).no_goal.few_contributors, false);
  assert.equal((await burn("owner", "2030-02")).no_goal.few_contributors, false);
  assert.ok(!("contributor_count" in (await burn()).no_goal));
  const { spendCsv } = await import("../lib/v2/spend-export.ts");
  const csv = spendCsv(pp("owner"), spendMonth("2030-01"));
  assert.ok(!/contributor|person|people|member|lead/.test(csv));
  assert.equal(csv.split("\r\n")[4], '"month","team","requests","estimated_list_cost_usd","unpriced_requests","input","output","cache_read","cache_write_5m","cache_write_1h","cache_write_unsplit"');
  // Retained usage keeps no identities: with three known contributors rolled away, the figure may be one person's.
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.equal((await burn("owner", "2030-01")).no_goal.few_contributors, true);
});
await test("set/change/remove are immutable audited history; no-op removal is idempotent", async () => {
  await budget(); await spend.writeBudget(pp("owner"), T, null, { amount_usd: 120 }); await budget(null); await budget(null);
  assert.deepEqual((await burn()).history.map((h) => [h.action, h.actor.id, h.amount_usd_micros]), [["set", "lead", 100_000_000], ["changed", "owner", 120_000_000], ["removed", "lead", null]]);
  assert.equal(db.all("SELECT * FROM v2_audit").length, 3); assert.equal((await burn()).budget, null);
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
  assert.equal((await burn()).budget, null); assert.equal((await burn("owner", "2030-02")).forecast_usd_micros, null);
  assert.equal((await burn("owner", "2029-12")).can.manage, false);
  assert.equal(spendMonth("2032-02").end - spendMonth("2032-02").start, 29 * 86_400_000);
});
await test("allowance defaults to one monthly grant; ceiling exhaustion waits and later changes preserve grants", async () => {
  await budget(); const a = await ask("member", { amount_usd: 5 }), b = await ask("member", { amount_usd: 5 });
  assert.equal(a.state, "granted"); assert.equal(a.authority_label, "This request was recorded under the team's allowance."); assert.deepEqual(a.decisions, []); assert.equal(a.expires_at, end);
  assert.equal(b.state, "waiting");
  assert.equal((await burn()).budget.allowance_ceiling_usd_micros, 5_000_000);
  assert.equal((await burn()).allowance_remaining_usd_micros, 0);
  assert.equal((await burn()).effective_budget_usd_micros, 105_000_000);
  await budget({ amount_usd: 100, allowance_usd: 0 });
  assert.equal(spend.getBudgetRequest(pp("member"), a.id).state, "granted"); assert.equal((await ask("member", { amount_usd: 0.01 })).state, "waiting");
});
await test("monthly allowance ceiling is transactional, never reset by budget changes, and starts anew next month", async () => {
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 8 });
  const results = (await race(["member", "lead"].map((who) => ({ kind: "ask", who, body: { amount_usd: 5 } })))).map((r) => { assert.equal(r.status, "fulfilled"); return r.value; });
  assert.deepEqual(results.map((r) => r.state).sort(), ["granted", "waiting"]);
  assert.equal((await burn()).allowance_granted_usd_micros, 5_000_000); assert.equal((await burn()).allowance_remaining_usd_micros, 3_000_000);
  assert.equal((await ask("member", { amount_usd: 3 })).state, "granted");
  await budget(null); await budget({ amount_usd: 100, allowance_usd: 5 });
  assert.equal((await burn()).allowance_remaining_usd_micros, 0);
  assert.equal((await ask("member", { amount_usd: 1 })).state, "waiting");
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 10 });
  assert.equal((await ask("member", { amount_usd: 2 })).state, "granted");
  assert.equal((await burn()).history.at(-1).allowance_ceiling_usd_micros, 10_000_000);
  for (const b of [{ amount_usd: 100, allowance_ceiling_usd: 1 }, { amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: -1 }, { amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 0.001 }]) await reject(() => budget(b), 400);
  now = RealDate.parse(end); await budget();
  assert.equal((await ask("member", { amount_usd: 5 })).state, "granted");
  assert.equal((await burn()).allowance_granted_usd_micros, 5_000_000);
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
  assert.equal(a.state, "granted"); assert.equal(a.authority, "approver"); assert.equal(a.decisions[0].actor.id, "lead"); assert.equal(a.approved_usd_micros, 12_340_000); assert.equal((await burn()).effective_budget_usd_micros, 112_340_000);
  await reject(() => act("lead2", r, "approve", { amount_usd: 12, expires_at: end }), 409, "stale_revision"); assert.equal((await burn()).effective_budget_usd_micros, 112_340_000);
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
    assert.equal(spend.getBudgetRequest(pp(who), declined.id).state_note, `This request was declined by ${who === "lead" ? "you" : "lead"}.`);
  }
  const withdrawn = await act("member", await ask(), "withdraw");
  assert.equal(withdrawn.state_note, "This request was withdrawn.");
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
  assert.equal(spend.getBudgetRequest(pp("member"), g.id).state, "expired"); assert.equal((await burn()).effective_budget_usd_micros, 100_000_000);
  now = RealDate.parse(end);
  assert.equal(spend.getBudgetRequest(pp("member"), waiting.id).state, "expired"); assert.equal(spend.getBudgetRequest(pp("member"), declined.id).state, "declined"); assert.equal((await burn()).budget, null);
  await reject(() => act("member", declined, "second-look"), 409); assert.equal(snapshot(), before);
});
await test("closed months include grants in force during that month after they expire", async () => {
  await budget({ amount_usd: 100 });
  const r = await ask(); await act("lead", r, "approve", { amount_usd: 20, expires_at: "2030-01-17T00:00:00Z" });
  await usage(session(), null, 90_000_000);
  assert.equal((await burn()).effective_budget_usd_micros, 120_000_000);
  now = RealDate.parse("2030-02-02T00:00:00Z");
  const past = (await burn("owner", "2030-01"));
  assert.equal(past.effective_budget_usd_micros, 120_000_000); assert.equal(past.remaining_usd_micros, 30_000_000);
  assert.ok(past.estimated_spend_usd_micros / past.effective_budget_usd_micros < 0.8);
});
await test("aggregate burn includes private goals and captures no-goal membership at epoch opening", async () => {
  await budget(); goal("g_public"); goal("g_private", "private");
  await usage(session("a".repeat(43)), "g_public", 20_000_000);
  await usage(session("b".repeat(43)), "g_private", 10_000_000);
  await usage(session("c".repeat(43)), null, 10_000_000);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  for (const who of ["owner", "viewer"]) { const b = (await burn(who)); assert.equal(b.estimated_spend_usd_micros, 40_000_000); assert.equal(b.remaining_usd_micros, 60_000_000); assert.equal(b.no_goal.share_percent, 25); assert.ok(!JSON.stringify(b).includes("g_private")); }
  await assert.rejects(() => burn("other"), (e) => e.status === 404);
  assert.equal((await burn()).forecast_usd_micros, 80_000_000); assert.equal((await burn()).runs_out_at, null);
});
await test("no-goal work counts only in the earliest joined team", async () => {
  await budget(); db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T2, new Date().toISOString());
  await usage(session(), null, 10_000_000);
  assert.equal((await burn()).priced_spend_usd_micros, 10_000_000); assert.equal((await spend.budgetBurn(pp("owner"), T2)).priced_spend_usd_micros, 0);
});
await test("unpriced work yields labelled spend/forecast lower bounds and a remaining upper bound; shares stay absent", async () => {
  await budget(); assert.equal((await burn()).no_goal.share_percent, null); await usage(session(), null, null);
  const b = (await burn()); assert.equal(b.unpriced_requests, 1); assert.equal(b.priced_spend_usd_micros, 0);
  assert.equal(b.estimated_spend_usd_micros, 0); assert.equal(b.spend_bound, "lower");
  assert.equal(b.remaining_usd_micros, 100_000_000); assert.equal(b.remaining_bound, "upper");
  assert.equal(b.forecast_usd_micros, 0); assert.equal(b.forecast_bound, "lower"); assert.equal(b.runs_out_at, null);
  assert.match(b.pricing_note, /1 unpriced request excluded/);
  assert.equal(b.no_goal.estimated_spend_usd_micros, 0); assert.equal(b.no_goal.spend_bound, "lower"); assert.equal(b.no_goal.share_percent, null);
  await usage(session("b".repeat(43)), null, 40_000_000);
  const priced = (await burn()); assert.equal(priced.estimated_spend_usd_micros, 40_000_000); assert.equal(priced.forecast_usd_micros, 80_000_000); assert.equal(priced.remaining_usd_micros, 60_000_000);
  now = RealDate.parse("2030-02-01T00:00:00Z");
  const future = (await burn("owner", "2030-03")); assert.equal(future.forecast_usd_micros, null); assert.equal(future.forecast_bound, null);
});
await test("linear exhaustion forecast accounts for grant expiry and negative remaining", async () => {
  await budget({ amount_usd: 50 }); await usage(session(), null, 40_000_000);
  const grant = await act("lead", await ask(), "approve", { amount_usd: 20, expires_at: "2030-01-21T00:00:00Z" });
  assert.equal((await burn()).forecast_usd_micros, 80_000_000); assert.equal((await burn()).runs_out_at, "2030-01-21T00:00:00.000Z");
  assert.equal(grant.approved_usd_micros, 20_000_000);
  await budget({ amount_usd: 10 }); assert.equal((await burn()).remaining_usd_micros, -10_000_000);
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
  const before = (await burn());
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.equal(db.all("SELECT * FROM v2_sessions").length, 0);
  const after = (await burn()); assert.equal(after.priced_spend_usd_micros, before.priced_spend_usd_micros); assert.equal(after.no_goal.share_percent, before.no_goal.share_percent); assert.equal(after.no_goal.attribution_unknown, false);
  assert.equal(db.get("SELECT requests, team_attributed_requests FROM v2_spend_rollups WHERE goal_id = ''").team_attributed_requests, 1);
});
await test("pre-feature unattributable no-goal roll-ups report unknown rather than zero", async () => {
  await budget(); db.run("INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, requests, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, est_list_usd_micros, unpriced_requests) VALUES (?, '', '2030-01-02', 'old', 'unknown', 2, 1, 1, 0, 0, 0, 0, 10, 1)", W);
  const b = (await burn()); assert.equal(b.no_goal.attribution_unknown, true); assert.ok(!("unattributed_rolled_up_requests" in b.no_goal)); assert.ok(!("unattributed_rolled_up_unpriced_requests" in b.no_goal)); assert.equal(b.unpriced_requests, null); assert.equal(b.known_unpriced_requests, 0); assert.equal(b.estimated_spend_usd_micros, null); assert.equal(b.remaining_usd_micros, null); assert.equal(b.no_goal.share_percent, null);
});
await test("earlier live no-goal usage makes team burn incomplete and retention never marks it attributed", async () => {
  await budget(); goal("g_public");
  const oldKey = session(); await usage(oldKey, null, 10_000_000);
  db.run("UPDATE v2_epochs SET spend_team_id = NULL WHERE session_key = ?", oldKey);
  let b = (await burn()); assert.equal(b.estimated_spend_usd_micros, null); assert.notEqual(b.spend_bound, "exact");
  await usage(session("b".repeat(43)), "g_public", 20_000_000);
  b = (await burn()); assert.equal(b.estimated_spend_usd_micros, 20_000_000); assert.equal(b.spend_bound, "lower");
  assert.equal(b.no_goal.attribution_unknown, true); assert.match(b.pricing_note, /Some earlier usage could not be attributed/);
  assert.equal(b.remaining_bound, "upper"); assert.equal(b.forecast_bound, "lower"); assert.equal(b.runs_out_at, null);
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.equal(db.get("SELECT team_attributed_requests FROM v2_spend_rollups WHERE goal_id = ''").team_attributed_requests, 0);
  b = (await burn()); assert.equal(b.no_goal.attribution_unknown, true); assert.equal(b.estimated_spend_usd_micros, 20_000_000); assert.equal(b.spend_bound, "lower");
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
  assert.equal(migrations.length, 27);
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
    migrations.slice(24, 26).forEach((m) => old.exec(m));
    const period = old.prepare("SELECT * FROM v2_epochs WHERE epoch_id = 'e'").get();
    old.exec(migrations[26]);
    assert.deepEqual({ ...old.prepare("SELECT * FROM v2_epochs WHERE epoch_id = 'e'").get() }, { ...period, origin: null });
    assert.deepEqual(old.prepare("SELECT * FROM v2_spend_rollups").get(), retained);
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
  assert.equal((await currentSessionBudget(pp("member"), "a".repeat(43))).team.id, T);
  await assert.rejects(() => currentSessionBudget(pp("owner"), "a".repeat(43)), (e) => e.status === 404);
  await usage(session("b".repeat(43)), null, 20_000_000);
  assert.equal((await burn()).priced_spend_usd_micros, 10_000_000);
  assert.equal((await spend.budgetBurn(pp("owner"), T2)).priced_spend_usd_micros, 20_000_000);
  await spend.writeBudget(pp("owner"), T2, null, { amount_usd: 100 });
  const labels = listSessions(pp("member")).mine.map((s) => s.team_budget_label).join(" ");
  assert.match(labels, /Build's team budget/); assert.match(labels, /Other's team budget/);
  await reject(() => chooseSpendHomeTeam(pp("other"), { team_id: T }), 404);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member' AND pod_id = ?", W, T2);
  assert.equal(homeTeamId(W, "member"), T);
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  await usage(session("c".repeat(43)), null, 30_000_000);
  assert.equal(homeTeamId(W, "member"), null);
  assert.equal((await burn()).priced_spend_usd_micros + (await spend.budgetBurn(pp("owner"), T2)).priced_spend_usd_micros, 30_000_000);
  const { spend: report } = await import("../lib/v2/spend.ts");
  assert.equal(report(pp("owner"), "team", null, null).total.est_list_usd_micros, 60_000_000);
});

await test("CSV matches table totals while burn preserves home attribution across retention and privacy", async () => {
  const { spendTeamExport, spend: report } = await import("../lib/v2/spend.ts");
  const { spendCsv, spendMonth } = await import("../lib/v2/spend-export.ts");
  await budget(); goal("g_private", "private"); goal("g_public");
  await usage(session(), null, 10_123_456);
  await usage(session("b".repeat(43)), "g_private", 20_000_000);
  await usage(session("d".repeat(43)), "g_public", 1_234_567);
  await chooseSpendHomeTeam(pp("member"), { team_id: T });
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  await usage(session("c".repeat(43)), null, null);
  const range = spendMonth("2030-01");
  const read = (who) => spendTeamExport(pp(who), range.from, range.to);
  const before = [read("owner"), read("other")];
  for (const who of ["owner", "viewer", "other"]) {
    const r = read(who), old = report(pp(who), "team", range.from, range.to);
    assert.deepEqual(r, old);
    for (const k of Object.keys(r.total).filter((k) => k !== "by_basis")) {
      assert.equal(r.total[k], [...r.rows, r.unallocated].reduce((n, s) => n + s[k], 0), k);
      for (const basis of Object.keys(r.total.by_basis))
        assert.equal(r.total.by_basis[basis][k], [...r.rows, r.unallocated].reduce((n, s) => n + s.by_basis[basis][k], 0));
    }
    assert.equal(r.unallocated.est_list_usd_micros, (await burn()).no_goal.priced_spend_usd_micros);
    assert.equal(r.unallocated.unpriced_requests, 1);
    const csv = spendCsv(pp(who), range);
    assert.ok(csv.includes('"10.123456"')); assert.ok(!csv.includes("g_private")); assert.ok(!csv.includes("a".repeat(43)));
  }
  assert.equal(read("other").rows.filter((r) => r.kind === "private").length, 1);
  assert.equal(read("other").rows.find((r) => r.kind === "private").est_list_usd_micros, 20_000_000);
  assert.equal(read("other").rows.find((r) => r.kind === "team").est_list_usd_micros, 1_234_567);
  db.run("UPDATE v2_pods SET name = ? WHERE id = ?", '=1+1,\n"quoted"', T);
  assert.ok(spendCsv(pp("owner"), range).includes('"\'=1+1,\n""quoted"""'));
  db.run("UPDATE v2_pods SET name = 'Build' WHERE id = ?", T);
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.deepEqual([read("owner"), read("other")], before);
  assert.equal(db.all("SELECT * FROM v2_team_no_goal_rollups").length, 1);
});


await test("monthly CSV matches every table row for each reader role before and after retention", async () => {
  const { spendTeamExport, spend: table } = await import("../lib/v2/spend.ts");
  const { spendCsv } = await import("../lib/v2/spend-export.ts");
  const hiddenTeam = "pod_hidden", at = new Date().toISOString(), range = spendMonth("2030-01");
  db.run("INSERT INTO ba_user VALUES ('unaffiliated', 'Unaffiliated', 'unaffiliated@example.test')");
  db.run("INSERT INTO v2_members VALUES (?, 'unaffiliated', 'member', ?)", W, at);
  db.run("UPDATE v2_pod_members SET role = 'member' WHERE ws_id = ? AND user_id = 'other'", W);
  db.run("INSERT INTO v2_pods VALUES (?, ?, 'Hidden team', ?)", hiddenTeam, W, at);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'lead2', 'member', ?)", W, hiddenTeam, at);
  // Open each goal while its uploader owns it, then assign its final owner before any report read.
  const goals = [
    ["public_a", "workspace", T, "lead2", 10_123_456],
    ["public_b", "workspace", T2, "other", 20_000_001],
    ["team_a", "pod", T, "lead2", 30_000_002],
    ["team_b", "pod", T2, "other", 40_000_003],
    ["private_a", "private", T, "member", 50_000_004],
    ["private_b", "private", T2, "other", 60_000_005],
    ["private_owner", "private", T, "owner", 61_000_001],
    ["private_lead", "private", T, "lead", 62_000_001],
    ["private_unaffiliated", "private", T2, "unaffiliated", 63_000_001],
    ["private_viewer", "private", T, "viewer", 64_000_001],
    ["hidden_team", "pod", hiddenTeam, "lead2", 70_000_006],
    ["hidden_private", "private", hiddenTeam, "lead2", 80_000_007],
    ["no_team", "workspace", null, "lead2", 90_000_008],
    ["hidden_no_team", "private", null, "lead2", 100_000_009],
  ];
  let index = 0;
  const addUsage = async (goalId, amount) => {
    const key = String(++index).padStart(43, "s");
    session(key);
    await usage(key, goalId, amount);
    await usage(key, goalId, null, "u".repeat(43));
    // Exercise every exported token column, not just the columns populated by the common helper.
    db.run("UPDATE v2_usage SET input = ?, output = ?, cache_read = ?, cache_write_5m = ?, cache_write_1h = ?, cache_write_unsplit = ? WHERE session_key = ?", index, index * 2, index * 3, index * 4, index * 5, index * 6, key);
  };
  for (const [id, visibility, team, owner, amount] of goals) {
    goal(id, visibility, team); await addUsage(id, amount);
    db.run("UPDATE v2_goals SET owner_id = ? WHERE id = ?", owner, id);
  }
  for (const team of [T2, hiddenTeam]) db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, team, at);
  for (const [team, amount] of [[T, 3_000_011], [T2, 5_000_013], [hiddenTeam, 7_000_017]]) {
    await chooseSpendHomeTeam(pp("member"), { team_id: team }); await addUsage(null, amount);
  }
  db.run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = 'member'", W);
  await addUsage(null, 11_000_019);
  db.run("INSERT INTO v2_pod_members VALUES (?, ?, 'member', 'member', ?)", W, T, at);
  await budget();
  const readers = [
    ["owner", ["public_a", "public_b", "team_a", "team_b", "private_owner", "hidden_team", "no_team"]],
    ["lead", ["public_a", "public_b", "team_a", "private_lead", "no_team"]],
    ["member", ["public_a", "public_b", "team_a", "private_a", "no_team"]],
    ["other", ["public_a", "public_b", "team_b", "private_b", "no_team"]],
    ["unaffiliated", ["public_a", "public_b", "private_unaffiliated", "no_team"]],
    ["viewer", ["public_a", "public_b", "team_a", "private_viewer", "no_team"]],
  ];
  const numbers = ["requests", "est_list_usd_micros", "unpriced_requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit"];
  const check = () => readers.map(([who, visible]) => {
    const report = table(pp(who), "team", range.from, range.to);
    const exported = spendTeamExport(pp(who), range.from, range.to);
    const visibleGoals = goals.filter(([id]) => visible.includes(id)), expectedTeams = new Map();
    for (const [, , team, , amount] of visibleGoals.filter(([, , team]) => team)) {
      expectedTeams.set(team, (expectedTeams.get(team) ?? 0) + amount);
    }
    assert.deepEqual(report.rows.filter((r) => r.kind === "team").map((r) => [r.team.id, r.est_list_usd_micros]).sort(), [...expectedTeams].sort(), who);
    for (const r of report.rows.filter((r) => r.kind === "team" || r.kind === "no_team")) {
      const contributing = visibleGoals.filter(([, , team]) => team === (r.team?.id ?? null));
      assert.equal(r.est_list_usd_micros, contributing.reduce((n, g) => n + g[4], 0), who);
      assert.equal(r.requests, contributing.length * 2, who);
      assert.equal(r.unpriced_requests, contributing.length, who);
    }
    const hidden = goals.filter(([id]) => !visible.includes(id));
    const privateRows = report.rows.filter((r) => r.kind === "private");
    assert.equal(privateRows.length, 1, who);
    assert.equal(privateRows[0].est_list_usd_micros, hidden.reduce((n, g) => n + g[4], 0), who);
    assert.equal(privateRows[0].unpriced_requests, hidden.length, who);
    assert.equal(privateRows[0].requests, hidden.length * 2, who);
    assert.deepEqual(Object.keys(privateRows[0]).sort(), ["key", "kind", "label", "by_basis", ...numbers].sort(), who);
    assert.equal(report.unallocated.est_list_usd_micros, 26_000_060, who);
    assert.equal(report.unallocated.unpriced_requests, 4, who);
    assert.deepEqual(exported, report, who);
    const csv = spendCsv(pp(who), range);
    // These fixture labels contain no CSV metacharacters; compare every serialized data cell exactly.
    const expectedRows = [...report.rows, { label: "Not bound to a goal", ...report.unallocated }, { label: "Total", ...report.total }];
    assert.deepEqual(csv.split("\r\n").slice(5, -1), expectedRows.map((r) => [range.month, r.label, ...numbers.map((k) => k === "est_list_usd_micros" ? `${Math.trunc(r[k] / 1_000_000)}.${String(r[k] % 1_000_000).padStart(6, "0")}` : r[k])].map((v) => `"${v}"`).join(",")), who);
    for (const k of numbers) {
      assert.equal(report.total[k], [...report.rows, report.unallocated].reduce((n, r) => n + r[k], 0), `${who}: ${k}`);
      for (const basis of Object.keys(report.total.by_basis)) assert.equal(report.total.by_basis[basis][k], [...report.rows, report.unallocated].reduce((n, r) => n + r.by_basis[basis][k], 0), `${who}: ${basis}: ${k}`);
    }
    for (const [id] of goals) assert.ok(!csv.includes(id), `${who}: goal reference`);
    if (who !== "owner") assert.ok(!csv.includes("Hidden team"), who);
    const empty = spendMonth("2030-03"), emptyTable = table(pp(who), "team", empty.from, empty.to);
    assert.deepEqual(emptyTable.rows, [], who);
    assert.deepEqual(spendCsv(pp(who), empty).split("\r\n").slice(5, -1).map((line) => line.split(",")[1]), ['"Not bound to a goal"', '"Total"'], who);
    return report;
  });
  const before = check();
  for (const who of ["owner", "lead", "member", "viewer"]) assert.equal((await burn(who)).no_goal.priced_spend_usd_micros, 3_000_011);
  for (const who of ["other", "unaffiliated"]) await reject(async () => burn(who), 404);
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  assert.deepEqual(check(), before);
});

await test("member-or-owner budget privacy and CSV parity with readable goal-bound team rows", async () => {
  await budget(); goal("g_public"); await usage(session(), "g_public", 20_000_000); await usage(session("b".repeat(43)), null, 10_000_000);
  for (const who of ["member", "viewer", "owner"]) assert.equal((await burn(who)).estimated_spend_usd_micros, 30_000_000);
  await assert.rejects(() => burn("other"), (e) => e.status === 404);
  const { spendTeamExport } = await import("../lib/v2/spend.ts"), hidden = spendTeamExport(pp("other"), "2030-01-01T00:00:00Z", end);
  const { spend } = await import("../lib/v2/spend.ts");
  assert.deepEqual(hidden.rows, spend(pp("other"), "team", "2030-01-01T00:00:00Z", end).rows);
  assert.equal(hidden.rows[0].team.name, "Build");
  assert.equal(hidden.rows[0].est_list_usd_micros, 20_000_000); assert.equal(hidden.unallocated.est_list_usd_micros, 10_000_000);
});
await test("terminal source cannot receive an allowance and five waiting requests is the limit", async () => {
  session();
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 100 });
  for (let n = 0; n < 5; n++) { const r = await spend.createBudgetRequest(pp("member"), T, { amount_usd: 1, reason: "Finish work", filed_from: "browser" }, "terminal", "dv_spend"); assert.equal(r.state, "waiting"); assert.equal(r.filed_from, "terminal", "dv_spend"); assert.equal(r.authority, null); }
  await reject(() => spend.createBudgetRequest(pp("member"), T, { amount_usd: 1, reason: "Finish work" }, "terminal", "dv_spend"), 409, "too_many_waiting_requests");
  const browser = await ask("member", { amount_usd: 1 }); assert.equal(browser.state, "granted"); assert.equal(browser.filed_from, "browser");
});
await test("filing source records the authenticated device and survives rename in records, lists and Home", async () => {
  await budget(); session();
  const r = await spend.createBudgetRequest(pp("member"), T, { amount_usd: 1, reason: "Finish", source_device_name: "Forged" }, "terminal", "dv_spend");
  const expected = "Filed from a terminal on the device Test device. Align cannot tell whether member or an agent on that device ran the command.";
  assert.equal(r.filing_note, expected); assert.equal(r.state, "waiting");
  assert.deepEqual({ ...db.get("SELECT source_device_id, source_device_name FROM v2_budget_requests WHERE id = ?", r.id) }, { source_device_id: "dv_spend", source_device_name: "Test device" });
  db.run("UPDATE v2_devices SET name = 'Renamed' WHERE id = 'dv_spend'");
  assert.equal(spend.getBudgetRequest(pp("lead"), r.id).filing_note, expected);
  assert.equal(spend.listBudgetRequests(pp("member")).mine[0].filing_note, expected);
  assert.equal(spend.homeBudgetRequests(pp("member")).mine[0].filing_note, expected);
  const browser = await ask("member", { amount_usd: 1 }); assert.equal(browser.filing_note, "Filed in the browser by member.");
  const { buildNeeds } = await import("../app/app/_ui/home/needs.ts");
  const rows = buildNeeds({ ws: W, me: "member", budgets: [r], crs: [], asks: [], alignments: [], apps: [], sends: [] }).rows;
  assert.ok(rows.some((row) => row.who.includes(expected)));
  await reject(() => spend.createBudgetRequest(pp("lead"), T, { amount_usd: 1, reason: "Finish" }, "terminal", "dv_spend"), 404);
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
  await act("lead", r, "decline", { reason: "Scope" });
  const declined = spend.getBudgetRequest(pp("member"), r.id);
  assert.equal(inPhase(view("member", [declined]).rows, "needs_you").length, 1);
  const { rankNeeds, ORDERS } = await import("../app/app/_ui/home/needs.ts");
  for (const order of ["approver", "requester"]) {
    const rows = ORDERS[order].map((kind) => ({ ...owner.rows[0], key: kind, kind }));
    assert.deepEqual(rankNeeds(rows.reverse(), order).map((r) => r.kind), ORDERS[order]);
    assert.equal(ORDERS[order].indexOf("budget_request"), ORDERS[order].indexOf("decide") + 1);
  }
  assert.equal(view("member", [declined]).rows[0].action.label, "Ask for a second look");
  const referred = await act("member", declined, "second-look");
  const finalDecline = await act("owner", referred, "decline", { reason: "Still out of scope" });
  const done = view("member", [finalDecline]);
  assert.equal(inPhase(done.rows, "needs_you").length, 0); assert.equal(inPhase(done.rows, "done").length, 1); assert.equal(done.rows[0].action, null);
  const withdrawn = await act("member", await ask(), "withdraw");
  assert.equal(inPhase(view("member", [withdrawn]).rows, "done").length, 1);
  assert.ok(view("owner", null).unknown.includes("budget requests"));
});

await test("every budget action records its audit name and acting person; terminal requests record no allowance grant", async () => {
  const expectAudit = (events) => assert.deepEqual(db.all("SELECT action, actor_id FROM v2_audit ORDER BY rowid").map((r) => [r.action, r.actor_id]), events);
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 10 });
  await spend.writeBudget(pp("owner"), T, null, { amount_usd: 120, allowance_usd: 5, allowance_ceiling_usd: 10 });
  const allowance = await spend.createBudgetRequest(pp("member"), T, { amount_usd: 5, reason: "Finish work" }, "browser");
  session();
  const terminal = await spend.createBudgetRequest(pp("member"), T, { amount_usd: 5, reason: "Finish work" }, "terminal", "dv_spend");
  const declined = await act("lead", terminal, "decline", { reason: "Scope" });
  const second = await act("member", declined, "second-look");
  await act("owner", second, "approve", { amount_usd: 3, expires_at: end });
  const withdrawn = await act("member", await ask(), "withdraw");
  await spend.writeBudget(pp("lead"), T, null, null);
  expectAudit([["team_budget.set", "lead"], ["team_budget.changed", "owner"],
    ["budget_request.requested", "member"], ["budget_request.allowance_granted", "member"],
    ["budget_request.requested", "member"], ["budget_request.declined", "lead"], ["budget_request.second_look", "member"],
    ["budget_request.approved", "owner"], ["budget_request.requested", "member"], ["budget_request.withdrawn", "member"], ["team_budget.removed", "lead"]]);
  assert.deepEqual(db.all("SELECT action FROM v2_audit WHERE object_id = ? ORDER BY rowid", terminal.id).map((r) => r.action), ["budget_request.requested", "budget_request.declined", "budget_request.second_look", "budget_request.approved"]);
  assert.equal(allowance.authority, "allowance"); assert.equal(withdrawn.state, "withdrawn");
});

await test("a requester promoted to viewer can still withdraw their waiting request", async () => {
  await budget(); const r = await ask();
  db.run("UPDATE v2_members SET role = 'viewer' WHERE ws_id = ? AND user_id = 'member'", W);
  const read = spend.getBudgetRequest(pp("member"), r.id);
  assert.equal(read.can.withdraw, true); assert.equal(read.can.approve, false); assert.equal(read.can.second_look, false);
  assert.equal((await act("member", read, "withdraw")).state, "withdrawn");
});

await test("only a session's person sees its budget label, and a month without a budget omits it", async () => {
  await budget(); const key = session(); await usage(key, null, 1_000_000);
  assert.match(listSessions(pp("member")).mine.find((s) => s.session_key === key).team_budget_label, /spend counts toward Build's team budget/);
  const owner = listSessions(pp("owner"));
  assert.ok(!("team_budget_label" in owner.all.find((s) => s.session_key === key)));
  assert.ok(!JSON.stringify(owner).includes("team budget this month"));
  now = Date.parse(end);
  assert.equal(listSessions(pp("member")).mine.find((s) => s.session_key === key).team_budget_label, null);
});

await test("creation rate limit survives withdrawal and rejects without audit, including across a connection restart", async () => {
  await budget();
  for (let n = 0; n < 60; n++) await act("member", await ask(), "withdraw");
  const before = snapshot();
  await reject(() => ask(), 429, "rate_limited"); assert.equal(snapshot(), before);
  globalThis.__alignV2Db.domain.close(); globalThis.__alignV2Db.auth.close(); delete globalThis.__alignV2Db;
  await reject(() => ask(), 429, "rate_limited"); assert.equal(snapshot(), before);
  now += 3600_001; assert.equal((await ask()).state, "waiting");
});
await test("hourly request counts use covering index ranges without scanning request history", async () => {
  await budget(); await ask();
  const queries = [...globalThis.__alignV2Db.stmts.keys()].filter((sql) => sql.startsWith("SELECT COUNT(*) AS n FROM v2_budget_requests WHERE ws_id = ?") && sql.includes("created_at > ?"));
  assert.equal(queries.length, 2);
  const since = new Date(now - 3600_000).toISOString();
  for (const sql of queries) {
    const requester = sql.includes("requester_id = ?");
    const plan = db.all(`EXPLAIN QUERY PLAN ${sql}`, ...(requester ? [W, "member", since] : [W, since])).map((r) => r.detail).join("\n");
    assert.doesNotMatch(plan, /\bSCAN\b/);
    assert.match(plan, new RegExp(`SEARCH v2_budget_requests USING COVERING INDEX ${requester ? "v2_budget_requests_requester_created" : "v2_budget_requests_created"}\\b`));
    assert.ok(plan.includes(requester ? "(ws_id=? AND requester_id=? AND created_at>?)" : "(ws_id=? AND created_at>?)"), plan);
  }
});
await test("budget request foreign-key child lookups use covering indexes", async () => {
  for (const [table, columns, index, params] of [
    ["v2_budget_request_sessions", ["ws_id", "session_key"], "v2_budget_request_sessions_session", [W, "a".repeat(43)]],
    ["v2_budget_requests", ["ws_id", "goal_id"], "v2_budget_requests_goal", [W, "g_public"]],
    ["v2_budget_requests", ["source_device_id"], "v2_budget_requests_source_device", ["dv_spend"]],
  ]) {
    assert.deepEqual(db.all(`PRAGMA index_info(${index})`).map((r) => r.name), columns);
    const plan = db.all(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE ${columns.map((c) => `${c} = ?`).join(" AND ")}`, ...params).map((r) => r.detail).join("\n");
    assert.doesNotMatch(plan, /\bSCAN\b/);
    assert.match(plan, new RegExp(`SEARCH ${table} USING COVERING INDEX ${index}\\b`));
  }
});

await test("one requester's allowance grants consume their hourly limit without blocking another person", async () => {
  await budget({ amount_usd: 100, allowance_usd: 5, allowance_ceiling_usd: 1000 });
  for (let n = 0; n < 60; n++) assert.equal((await ask("member", { amount_usd: 1 })).authority, "allowance");
  const before = snapshot();
  await reject(() => ask("member", { amount_usd: 1 }), 429, "rate_limited"); assert.equal(snapshot(), before);
  assert.equal((await ask("lead2", { amount_usd: 1 })).authority, "allowance");
  for (let n = 0; n < 539; n++) db.run(`INSERT INTO v2_budget_requests (id, ws_id, pod_id, month, requester_id, filed_from, state, amount_usd_micros, reason, created_at, updated_at) VALUES (?, ?, ?, '2030-01', 'owner2', 'browser', 'withdrawn', 1000000, 'Earlier request', ?, ?)`, `br_ceiling_${n}`, W, T, new Date().toISOString(), new Date().toISOString());
  await reject(() => ask("lead", { amount_usd: 1 }), 429, "rate_limited");
});

await test("changing the cursor row or an unread row between pages never skips or repeats a request", async () => {
  await budget();
  const all = [];
  for (let n = 0; n < 5; n++) { now += 1000; all.push(await ask()); }
  const one = spend.listBudgetRequests(pp("member"), T, null, { limit: "2" });
  now += 1000; await act("lead", one.mine[1], "decline", { reason: "Scope" });
  now += 1000; await act("lead", all[1], "approve", { amount_usd: 10, expires_at: end });
  const two = spend.listBudgetRequests(pp("member"), T, null, { limit: "2", cursor: one.next_cursor });
  const three = spend.listBudgetRequests(pp("member"), T, null, { limit: "2", cursor: two.next_cursor });
  assert.deepEqual([...one.mine, ...two.mine, ...three.mine].map((r) => r.id), all.reverse().map((r) => r.id));
  assert.equal(three.next_cursor, null);
});

await test("retention updates only the matching day, model and basis coverage", async () => {
  const key = session(); await usage(key, null, 1_000_000);
  const epoch = db.get("SELECT epoch_id FROM v2_epochs WHERE session_key = ?", key).epoch_id;
  db.run(`INSERT INTO v2_usage (ws_id, session_key, request_key, epoch_id, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, basis, est_list_usd_micros, price_table_version, source, received_at)
    VALUES (?, ?, ?, ?, '2030-01-11T00:00:00.000Z', 'second-model', 'main', 1, 1, 0, 0, 0, 0, 'unknown', NULL, 'test', 'otel', ?)`, W, key, "z".repeat(43), epoch, new Date().toISOString());
  for (const [day, model, basis] of [["2030-01-09", "test-model", "estimated_list_usd"], ["2030-01-10", "other-model", "estimated_list_usd"], ["2030-01-10", "test-model", "unknown"]]) db.run(`INSERT INTO v2_spend_rollups
    (ws_id, goal_id, day, model, basis, requests, input, output, cache_read, cache_write_5m, cache_write_1h, cache_write_unsplit, est_list_usd_micros, unpriced_requests, team_attributed_requests, team_attributed_unpriced_requests)
    VALUES (?, '', ?, ?, ?, 7, 1, 1, 0, 0, 0, 0, 1, 3, 2, 1)`, W, day, model, basis);
  const old = db.all("SELECT * FROM v2_spend_rollups ORDER BY day, model, basis");
  await runRetention(db.sql, db.tx, new Date("2032-01-01T00:00:00Z"), { secret: "test-secret" });
  for (const row of old) assert.deepEqual(db.get("SELECT * FROM v2_spend_rollups WHERE ws_id = ? AND goal_id = '' AND day = ? AND model = ? AND basis = ?", W, row.day, row.model, row.basis), row);
  const coverage = db.all("SELECT team_attributed_requests AS n, team_attributed_unpriced_requests AS unpriced FROM v2_spend_rollups WHERE requests = 1 ORDER BY day");
  assert.deepEqual(coverage.map((r) => [r.n, r.unpriced]), [[1, 0], [1, 1]]);
});

await test("budget team choices name exactly the reader's authorized teams, including an owner's non-member teams", async () => {
  assert.deepEqual(spend.budgetTeams(pp("member")).teams.map((t) => t.name), ["Build"]);
  assert.deepEqual(spend.budgetTeams(pp("viewer")).teams.map((t) => t.name), ["Build"]);
  assert.deepEqual(spend.budgetTeams(pp("other")).teams.map((t) => t.name), ["Other"]);
  assert.deepEqual(spend.budgetTeams(pp("owner")).teams.map((t) => t.name), ["Build", "Other"]);
});

await test("change stamps distinguish tied writes, allowance grants, decisions, expiry and removal without leaking other teams", async () => {
  const device = (who, grants = [W]) => ({ user: { id: who }, deviceId: "dv_spend", grants: new Set(grants) });
  assert.deepEqual(spend.deviceBudgetStamps(device("member")), []);
  assert.equal(spend.budgetStamp(W, T, "2030-01"), null);
  const first = await budget();
  const second = await budget({ amount_usd: 101, allowance_usd: 5 });
  assert.notEqual(first.budget_stamp, second.budget_stamp, "writes in the same millisecond must invalidate reuse");
  const allowance = await ask("member", { amount_usd: 5 });
  const granted = (await burn()).budget_stamp; assert.notEqual(granted, second.budget_stamp);
  const request = await ask();
  assert.equal((await burn()).budget_stamp, granted, "waiting requests do not change a budget");
  const expiry = new Date(now + 1000).toISOString();
  await act("owner", request, "approve", { amount_usd: 10, expires_at: expiry });
  const approved = (await burn()).budget_stamp; assert.notEqual(approved, granted);
  now += 1000;
  const expired = (await burn()).budget_stamp; assert.notEqual(expired, approved);
  assert.equal((await burn()).effective_budget_usd_micros, 106_000_000);
  const rows = spend.deviceBudgetStamps(device("member"));
  assert.deepEqual(Object.keys(rows[0]).sort(), ["month", "stamp", "team", "ws"]);
  assert.equal(rows[0].stamp, expired); assert.match(rows[0].stamp, /^[a-f0-9]{64}$/);
  assert.deepEqual(spend.deviceBudgetStamps(device("other")), []);
  assert.deepEqual(spend.deviceBudgetStamps(device("member", [])), []);
  await spend.writeBudget(pp("other"), T2, null, { amount_usd: 3 });
  assert.equal(spend.deviceBudgetStamps(device("member")).length, 1);
  assert.equal(spend.deviceBudgetStamps(device("owner")).length, 2);
  const removed = await budget(null); assert.notEqual(removed.budget_stamp, expired);
  assert.equal(removed.effective_budget_usd_micros, null);
  assert.equal(spend.getBudgetRequest(pp("member"), allowance.id).state, "granted");
});

await test("Home observes each threshold once for leads and owners, outside Needs, and removal hides rows", async () => {
  goal("g_budget_private", "private"); await usage(session(), "g_budget_private", 80_000_000);
  const needs = JSON.stringify(spend.homeBudgetRequests(pp("owner")));
  assert.deepEqual(spend.homeBudgetCrossings(pp("owner")), []);
  assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), []);
  const b = await budget(); assert.deepEqual(b.reached_thresholds, [80]);
  const first = spend.homeBudgetCrossings(pp("lead"));
  assert.equal(first.length, 1); assert.equal(first[0].threshold, 80);
  assert.equal(first[0].as_of, b.as_of); assert.equal(first[0].observed_at, new Date(now).toISOString());
  assert.deepEqual(spend.homeBudgetCrossings(pp("owner")), first);
  assert.deepEqual(spend.homeBudgetCrossings(pp("member")), []);
  assert.deepEqual(spend.homeBudgetCrossings(pp("other")), []);
  assert.ok(!JSON.stringify(first).includes("g_budget_private"));
  assert.ok(!JSON.stringify(first).includes("a".repeat(43)));
  now += 1000;
  await budget({ amount_usd: 80 });
  const both = spend.homeBudgetCrossings(pp("owner"));
  assert.deepEqual(both.map((c) => c.threshold), [100, 80]);
  assert.deepEqual(both.find((c) => c.threshold === 80), first[0]);
  assert.equal(JSON.stringify(spend.homeBudgetRequests(pp("owner"))), needs);
  const audit = db.all("SELECT * FROM v2_audit"); (await burn()); spend.homeBudgetCrossings(pp("owner"));
  assert.deepEqual(db.all("SELECT * FROM v2_audit"), audit);
  await budget(null); assert.deepEqual(spend.homeBudgetCrossings(pp("owner")), []);
  assert.equal(db.all("SELECT * FROM v2_budget_crossings").length, 2);
  await budget({ amount_usd: 100 });
  assert.equal(spend.homeBudgetCrossings(pp("owner")).find((c) => c.threshold === 80).observed_at, first[0].observed_at);
  await db.tx(() => purgeWorkspace(db.sql, W));
  assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), []);
});

await test("unknown totals and zero or absent budgets create no crossing; lower bounds may cross", async () => {
  await usage(session(), null, 80_000_000);
  assert.deepEqual((await burn()).reached_thresholds, []);
  await budget({ amount_usd: 0 }); assert.deepEqual((await burn()).reached_thresholds, []);
  await budget();
  db.run("UPDATE v2_usage SET est_list_usd_micros = NULL");
  assert.deepEqual((await burn()).reached_thresholds, []);
  await usage(session("b".repeat(43)), null, 80_000_000, "s".repeat(43));
  const lower = (await burn()); assert.equal(lower.spend_bound, "lower"); assert.deepEqual(lower.reached_thresholds, [80]);
  assert.equal((await currentSessionBudget(pp("member"), "a".repeat(43), true)).budget_stamp, lower.budget_stamp);
});

await test("migration 26 preserves filing sources and budget history and adds empty crossing records", async () => {
  const migrations = runInNewContext(/const MIGRATIONS: string\[\] = (\[[\s\S]*?\n\]);/.exec(readFileSync(path.join(ROOT, "lib/v2/db.ts"), "utf8"))[1]);
  const old = new DatabaseSync(":memory:");
  try {
    old.exec("PRAGMA foreign_keys = ON; CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY)");
    migrations.slice(0, 25).forEach((m) => old.exec(m));
    old.exec("INSERT INTO ba_user VALUES ('m'); INSERT INTO v2_workspaces (id,name,created_by,created_at) VALUES ('w','Workspace','m','x'); INSERT INTO v2_pods VALUES ('p','w','Team','x'); INSERT INTO v2_team_budgets VALUES ('w','p','2030-01',100,NULL,NULL,'m','x')");
    old.exec("INSERT INTO v2_team_budget_history (id,ws_id,pod_id,month,action,amount_usd_micros,actor_id,at) VALUES ('h','w','p','2030-01','set',100,'m','x'); INSERT INTO v2_budget_requests (id,ws_id,pod_id,month,requester_id,filed_from,state,amount_usd_micros,reason,created_at,updated_at,source_device_name) VALUES ('r','w','p','2030-01','m','terminal','waiting',100,'Finish','x','x','Recorded device')");
    const before = old.prepare("SELECT * FROM v2_team_budgets").all();
    const history = old.prepare("SELECT * FROM v2_team_budget_history").all();
    const requests = old.prepare("SELECT * FROM v2_budget_requests").all();
    old.exec(migrations[25]);
    assert.deepEqual(old.prepare("SELECT * FROM v2_team_budget_history").all(), history);
    assert.deepEqual(old.prepare("SELECT * FROM v2_budget_requests").all(), requests);
    assert.equal(old.prepare("SELECT revision FROM v2_budget_stamps WHERE ws_id = 'w' AND pod_id = 'p'").get().revision, 1);
    assert.deepEqual(old.prepare("SELECT * FROM v2_team_budgets").all(), before);
    assert.deepEqual(old.prepare("SELECT * FROM v2_budget_crossings").all(), []);
    assert.deepEqual(old.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { old.close(); }
});

await test("reads without a new current-month crossing never begin a write transaction under contention", async () => {
  await usage(session(), null, 120_000_000);
  const { domain, auth: lock } = db.openDb(), exec = domain.exec;
  let begins = 0;
  domain.exec = function (sql) { if (sql === "BEGIN IMMEDIATE") begins++; return exec.call(this, sql); };
  const read = async (month = null) => {
    begins = 0;
    lock.exec("BEGIN IMMEDIATE");
    try {
      const figures = await burn("owner", month);
      assert.equal(begins, 0);
      return figures;
    } finally { lock.exec("ROLLBACK"); }
  };
  try {
    assert.equal((await read()).budget, null);
    await budget({ amount_usd: 0 });
    assert.deepEqual((await read()).reached_thresholds, []);
    db.run("UPDATE v2_usage SET est_list_usd_micros = NULL");
    await budget();
    assert.deepEqual((await read()).reached_thresholds, []);
    db.run("UPDATE v2_usage SET est_list_usd_micros = 10_000_000");
    assert.deepEqual((await read()).reached_thresholds, []);
    db.run("UPDATE v2_usage SET est_list_usd_micros = 120000000, ts = '2029-12-10T00:00:00.000Z'");
    db.run("INSERT INTO v2_team_budgets SELECT ws_id, pod_id, '2029-12', amount_usd_micros, allowance_usd_micros, allowance_ceiling_usd_micros, updated_by, updated_at FROM v2_team_budgets");
    assert.deepEqual((await read("2029-12")).reached_thresholds, [80, 100]);
    assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), []);
    db.run("UPDATE v2_usage SET est_list_usd_micros = 80000000, ts = '2030-01-10T00:00:00.000Z'");
    await burn();
    assert.deepEqual((await read()).reached_thresholds, [80]);
    db.run("UPDATE v2_usage SET est_list_usd_micros = 120000000");
    await burn();
    assert.deepEqual((await read()).reached_thresholds, [80, 100]);
  } finally { domain.exec = exec; }
});

await test("a busy crossing write returns figures and a later read records it", async () => {
  await budget(); await usage(session(), null, 80_000_000);
  const priorStamp = spend.budgetStamp(W, T, "2030-01");
  const { domain, auth: lock } = db.openDb(), exec = domain.exec;
  let begins = 0;
  domain.exec = function (sql) { if (sql === "BEGIN IMMEDIATE") begins++; return exec.call(this, sql); };
  lock.exec("BEGIN IMMEDIATE");
  let figures;
  try {
    figures = await burn();
    assert.equal(begins, 101, "exhaust the existing busy start retry bound while the lock remains held");
    assert.equal(figures.priced_spend_usd_micros, 80_000_000);
    assert.deepEqual(figures.reached_thresholds, [80]);
    assert.equal(figures.budget_stamp, priorStamp);
    assert.equal(spend.budgetStamp(W, T, "2030-01"), priorStamp);
    assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), []);
  } finally { lock.exec("ROLLBACK"); domain.exec = exec; }
  now += 1000;
  const next = await burn();
  const rows = db.all("SELECT * FROM v2_budget_crossings");
  assert.equal(rows.length, 1); assert.equal(rows[0].threshold, 80);
  assert.equal(rows[0].as_of, next.as_of); assert.equal(rows[0].observed_at, new Date(now).toISOString());
  assert.notEqual(next.budget_stamp, priorStamp);
  assert.equal(next.budget_stamp, spend.budgetStamp(W, T, "2030-01"));
});

for (const change of ["budget", "grant", "spend"]) await test(`crossing retries recompute ${change} before recording`, async () => {
  await budget(); const request = await ask(); await usage(session(), null, 80_000_000);
  const lock = db.openDb().auth;
  lock.exec("BEGIN IMMEDIATE");
  try {
    if (change === "budget") lock.exec("UPDATE v2_team_budgets SET amount_usd_micros = 200000000");
    else if (change === "grant") lock.prepare("UPDATE v2_budget_requests SET state = 'granted', approved_usd_micros = 100000000, authority = 'approver', expires_at = ? WHERE id = ?").run(end, request.id);
    else lock.exec("UPDATE v2_usage SET est_list_usd_micros = 120000000");
    const pending = burn();
    setImmediate(() => lock.exec("COMMIT"));
    const figures = await pending;
    assert.equal(figures.effective_budget_usd_micros, change === "spend" ? 100_000_000 : 200_000_000);
    assert.equal(figures.priced_spend_usd_micros, change === "spend" ? 120_000_000 : 80_000_000);
    assert.deepEqual(figures.reached_thresholds, change === "spend" ? [80, 100] : []);
    const rows = db.all("SELECT * FROM v2_budget_crossings ORDER BY threshold");
    assert.deepEqual(rows.map((r) => r.threshold), figures.reached_thresholds);
    for (const row of rows) assert.equal(row.as_of, figures.as_of);
    assert.equal(figures.budget_stamp, spend.budgetStamp(W, T, "2030-01"));
  } finally { if (lock.isTransaction) lock.exec("ROLLBACK"); }
});

await test("concurrent budget reads record one crossing inside a retried transaction", async () => {
  await budget(); await usage(session(), null, 80_000_000);
  const before = db.all("SELECT * FROM v2_audit");
  const priorStamp = spend.budgetStamp(W, T, "2030-01");
  const lock = db.openDb().auth;
  lock.exec("BEGIN IMMEDIATE");
  let unlocked = false;
  const pending = Promise.all([burn(), burn()]);
  setImmediate(() => { lock.exec("COMMIT"); unlocked = true; });
  const reads = await pending;
  assert.equal(unlocked, true);
  assert.deepEqual(reads.map((b) => b.reached_thresholds), [[80], [80]]);
  const rows = db.all("SELECT * FROM v2_budget_crossings");
  assert.equal(rows.length, 1); assert.equal(rows[0].threshold, 80);
  const nextStamp = spend.budgetStamp(W, T, "2030-01");
  assert.notEqual(nextStamp, priorStamp);
  const processes = await race([{ kind: "read" }, { kind: "read" }]);
  assert.deepEqual(processes.map((r) => r.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), rows);
  assert.equal(spend.budgetStamp(W, T, "2030-01"), nextStamp);
  assert.deepEqual(db.all("SELECT * FROM v2_audit"), before);
  const stale = pp("member");
  db.run("UPDATE v2_usage SET est_list_usd_micros = 100000000");
  lock.exec("BEGIN IMMEDIATE");
  const refused = spend.budgetBurn(stale, T);
  setImmediate(() => {
    lock.prepare("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = 'member'").run(W, T);
    lock.exec("COMMIT");
  });
  await assert.rejects(refused, (error) => error.status === 404);
  assert.deepEqual(db.all("SELECT * FROM v2_budget_crossings"), rows);
});

await test("directive budget stamps use indexed revisions and expiry lookups without table scans", async () => {
  await budget();
  for (let n = 0; n < 50; n++) await budget({ amount_usd: 100 + n, allowance_usd: 5 });
  await ask("member", { amount_usd: 5 });
  spend.deviceBudgetStamps({ user: { id: "member" }, grants: new Set([W]) });
  const queries = [...db.openDb().stmts.keys()].filter((sql) => sql.startsWith("SELECT s.ws_id AS ws"));
  assert.equal(queries.length, 2, "explain the actual individual and directive queries used by the domain");
  for (const sql of queries) {
    assert.ok(!sql.includes("v2_team_budget_history"));
    const args = sql.includes("s.ws_id = ? AND s.pod_id = ?") ? [W, T, "2030-01"] : ["2030-01", W, "member"];
    const plan = db.all("EXPLAIN QUERY PLAN " + sql, new Date().toISOString(), ...args).map((row) => row.detail).join("; ");
    assert.doesNotMatch(plan, /\bSCAN\b/);
    assert.match(plan, /SEARCH s USING/); assert.match(plan, /SEARCH r USING COVERING INDEX v2_budget_requests_expiry/);
    console.log(`PLAN  budgets: ${plan}`);
  }
});

console.log(`test-budgets: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
