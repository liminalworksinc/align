// Listener-free regressions for server clock differences and best-effort terminal caching.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { CLOCK_TOLERANCE_MS, saveCredentials } from "../src/api.ts";
import { cacheBudgetRead, cacheTerminalBudget, refreshSessionBudgets } from "../src/budgets.ts";
import { budgetNotes, BUDGET_FRESH_MS, observedCrossings, type BudgetSnapshot } from "../src/shared/budget-notes.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { CLI, PKG, ctxFor, makeEnv, shareSession } from "./helpers.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z"), month = "2026-11";
const team = { id: "pod_build", name: "Build" };
const figure = (asOf = NOW) => ({ team, month, as_of: new Date(asOf).toISOString(), budget_stamp: "a".repeat(64),
  effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
function credentials(home: string, offset = 0) {
  saveCredentials(home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token",
    access_expires_at: new Date(NOW + 3600000).toISOString(), refresh_token: "unit-refresh", user: null, clock_offset_ms: offset });
}
const attrFile = (home: string, lid: string) => path.join(home, "budget-attribution", `${lid}.json`);
function attribution(home: string, lid: string, sid: string, at = NOW, assignedTeam = team) {
  writeJsonAtomic(attrFile(home, lid), { workspace_id: "ws_1", session_key: `key-${sid}`, epoch_id: "ep_1", month, at, team: assignedTeam });
}

for (const [ahead, offset] of [[5_000, 0], [3 * 60_000, 3 * 60_000], [-3 * 60_000, -3 * 60_000]]) {
  test(`budget computations with server difference ${ahead} ms survive caching, later reads and hook delivery`, async () => {
    const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, realNow = Date.now;
    const sid = "clock-session", lid = shareSession(ctx, "claude-code", sid), value = figure(NOW + ahead);
    try {
      Date.now = () => NOW; credentials(t.home, offset);
      globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team, month }) : Response.json(value);
      await refreshSessionBudgets(ctx, () => NOW);
      const file = layout.budgetCache(t.home, lid), first = readJson<BudgetSnapshot>(file)!;
      assert.deepEqual(first.crossings, [{ threshold: 80, as_of: value.as_of }]);
      const hot = readJson<HotState>(layout.hot(t.home, lid));
      assert.match(budgetNotes(t.home, lid, hot, NOW, "message").join(""), /80%/);
      assert.deepEqual(budgetNotes(t.home, lid, hot, NOW, "message"), []);
      cacheBudgetRead(ctx, "ws_1", team.id, { ...value, estimated_spend_usd_micros: 10 }, NOW);
      assert.deepEqual(readJson<BudgetSnapshot>(file)?.crossings, first.crossings, "later figures preserve server-dated pending crossings");
      assert.match(budgetNotes(t.home, lid, hot, NOW + 2 * 24 * 3600000).join(""), /80%/);
      assert.deepEqual(budgetNotes(t.home, lid, hot, NOW + 2 * 24 * 3600000), []);
      // Snapshots predating explicit crossings use the same clock rules when reconstructing a crossing.
      fs.rmSync(path.join(t.home, "budget-shown"), { recursive: true });
      const legacy = { ...first }; delete legacy.crossings; writeJsonAtomic(file, legacy);
      assert.equal(budgetNotes(t.home, lid, hot, NOW).length, 1);
      assert.deepEqual(observedCrossings({ ...first, estimated_spend_usd_micros: 10 }, legacy, NOW, offset), first.crossings);
    } finally { Date.now = realNow; globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
  });
}

test("server-time freshness uses the offset; local fetch and attribution times stay strict", () => {
  const t = makeEnv(), ctx = ctxFor(t), realNow = Date.now, offset = 10 * 60_000;
  const lid = shareSession(ctx, "claude-code", "strict-times");
  try {
    Date.now = () => NOW; credentials(t.home, offset);
    attribution(t.home, lid, "strict-times");
    const file = layout.budgetCache(t.home, lid), hot = readJson<HotState>(layout.hot(t.home, lid));
    cacheBudgetRead(ctx, "ws_1", team.id, figure(NOW + offset - BUDGET_FRESH_MS - 1), NOW);
    assert.deepEqual(readJson<BudgetSnapshot>(file)?.crossings, [], "future relative to device time can still be stale on server time");
    assert.deepEqual(budgetNotes(t.home, lid, hot, NOW), []);
    cacheBudgetRead(ctx, "ws_1", team.id, figure(NOW + offset), NOW);
    const good = readJson<BudgetSnapshot>(file)!;
    for (const field of ["fetched_at", "attribution_at"] as const) {
      writeJsonAtomic(file, { ...good, [field]: new Date(NOW + 1).toISOString() });
      assert.deepEqual(budgetNotes(t.home, lid, hot, NOW), [], field);
    }
    assert.deepEqual(observedCrossings({ ...good, fetched_at: new Date(NOW + 1).toISOString() }, null, NOW, offset), []);
    attribution(t.home, lid, "strict-times", NOW + 1);
    const untouched = fs.readFileSync(file, "utf8");
    cacheBudgetRead(ctx, "ws_1", team.id, { ...figure(NOW + offset), estimated_spend_usd_micros: 100 }, NOW);
    assert.equal(fs.readFileSync(file, "utf8"), untouched, "future local attribution is never reused");
    writeJsonAtomic(file, { ...good, as_of: new Date(NOW + offset + CLOCK_TOLERANCE_MS + 1).toISOString() });
    assert.deepEqual(budgetNotes(t.home, lid, hot, NOW), []);
    writeJsonAtomic(file, { ...good, crossings: [{ threshold: 80, as_of: new Date(NOW + offset + CLOCK_TOLERANCE_MS + 1).toISOString() }] });
    assert.deepEqual(budgetNotes(t.home, lid, hot, NOW), []);
    assert.deepEqual(observedCrossings({ ...good, estimated_spend_usd_micros: 10 }, readJson<BudgetSnapshot>(file), NOW, offset), []);
    writeJsonAtomic(file, good);
    assert.equal(budgetNotes(t.home, lid, hot, NOW).length, 1, "invalid timestamps consume no delivery marker");
  } finally { Date.now = realNow; ctx.db.close(); t.cleanup(); }
});

test("rejected figures preserve every snapshot and pending crossing, and retry next pass", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, realNow = Date.now, offset = 3 * 60_000;
  try {
    Date.now = () => NOW; credentials(t.home, offset);
    const lids = Array.from({ length: 101 }, (_, n) => shareSession(ctx, "claude-code", `reject-${n}`));
    let value: unknown = figure(NOW + offset), reads = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/sessions/")) return Response.json({ epoch_id: "ep_1", team, month });
      reads++; return Response.json(value);
    };
    await refreshSessionBudgets(ctx, () => NOW); await refreshSessionBudgets(ctx, () => NOW);
    const snapshots = lids.map((lid) => fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"));
    const teamsFile = path.join(t.home, "budgets-cache", "teams.json"), cachedTeams = fs.readFileSync(teamsFile, "utf8");
    ctx.budgetStamps = new Map([[`ws_1:${team.id}:${month}`, "b".repeat(64)]]);
    const patches = [null, { ...figure(NOW + offset + CLOCK_TOLERANCE_MS + 1) }, { ...figure(), as_of: "invalid" },
      { ...figure(), month: "2000-01" }, { ...figure(), team: { id: "pod_other", name: "Other" } }, { ...figure(), estimated_spend_usd_micros: "80" }];
    for (value of patches) {
      reads = 0; await refreshSessionBudgets(ctx, () => NOW);
      assert.equal(reads, 1, "a rejected team figure is read once per pass");
      assert.deepEqual(lids.map((lid) => fs.readFileSync(layout.budgetCache(t.home, lid), "utf8")), snapshots);
      assert.equal(fs.readFileSync(teamsFile, "utf8"), cachedTeams);
      cacheBudgetRead(ctx, "ws_1", team.id, value, NOW);
      assert.deepEqual(lids.map((lid) => fs.readFileSync(layout.budgetCache(t.home, lid), "utf8")), snapshots);
      assert.equal(fs.readFileSync(teamsFile, "utf8"), cachedTeams);
    }
    value = { ...figure(NOW + offset), estimated_spend_usd_micros: 100, budget_stamp: "b".repeat(64) };
    reads = 0; await refreshSessionBudgets(ctx, () => NOW); assert.equal(reads, 1, "a valid next pass can retry");
    await refreshSessionBudgets(ctx, () => NOW); assert.equal(reads, 1, "the valid figure is reused for the remaining session");
    assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lids[0]))?.crossings?.length, 2);
    assert.equal(budgetNotes(t.home, lids[0], readJson(layout.hot(t.home, lids[0])), NOW).length, 2);
  } finally { Date.now = realNow; globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});

test("terminal caching updates one team and its confirmed sessions with at most one current-folder read under the sync lock", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, realNow = Date.now;
  try {
    Date.now = () => NOW; credentials(t.home);
    const current = shareSession(ctx, "claude-code", "current"), known = shareSession(ctx, "claude-code", "known"),
      stale = shareSession(ctx, "claude-code", "stale"), other = shareSession(ctx, "claude-code", "other");
    ctx.db.prepare("UPDATE sessions SET cwd=? WHERE local_id=?").run(PKG, current);
    attribution(t.home, known, "known"); attribution(t.home, stale, "stale", NOW - BUDGET_FRESH_MS - 1);
    attribution(t.home, other, "other", NOW, { id: "pod_other", name: "Other" });
    const teamsFile = path.join(t.home, "budgets-cache", "teams.json"), otherRead = { at: NOW, budget: { ...figure(), team: { id: "pod_other", name: "Other" } } };
    writeJsonAtomic(teamsFile, { [`ws_1:pod_other:${month}`]: otherRead });
    writeJsonAtomic(layout.budgetCache(t.home, other), { keep: "other snapshot" });
    const calls: string[] = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url)); assert.equal(fs.readFileSync(path.join(t.home, "sync.lock"), "utf8"), String(process.pid));
      return Response.json({ epoch_id: "ep_1", team, month });
    };
    await cacheTerminalBudget(ctx, "ws_1", team.id, figure(), PKG);
    assert.equal(calls.length, 1); assert.match(calls[0], /sessions\/key-current\/budget\?attribution=1$/);
    for (const lid of [current, known]) assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.crossings?.[0].threshold, 80);
    assert.equal(readJson(layout.budgetCache(t.home, stale)), null, "other stale sessions cause no reads or snapshot writes");
    assert.deepEqual(readJson(layout.budgetCache(t.home, other)), { keep: "other snapshot" });
    assert.deepEqual(readJson<Record<string, unknown>>(teamsFile)?.[`ws_1:pod_other:${month}`], otherRead);
    assert.equal(fs.existsSync(path.join(t.home, "sync.lock")), false);
    await cacheTerminalBudget(ctx, "ws_1", team.id, { ...figure(), estimated_spend_usd_micros: 100 }, PKG);
    assert.equal(calls.length, 1, "fresh current-folder attribution needs no read");
    assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, current))?.crossings?.length, 2);
  } finally { Date.now = realNow; globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});

test("terminal local database, credential and attribution failures never throw or retain the sync lock", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, realNow = Date.now;
  const lock = path.join(t.home, "sync.lock");
  try {
    Date.now = () => NOW; credentials(t.home);
    const lid = shareSession(ctx, "claude-code", "current"); ctx.db.prepare("UPDATE sessions SET cwd=? WHERE local_id=?").run(PKG, lid);
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.doesNotReject(cacheTerminalBudget(ctx, "ws_1", team.id, figure(), PKG)); assert.equal(fs.existsSync(lock), false);
    fs.writeFileSync(layout.credentials(t.home), "invalid credentials");
    await assert.doesNotReject(cacheTerminalBudget(ctx, "ws_1", team.id, figure(), PKG)); assert.equal(fs.existsSync(lock), false);
    credentials(t.home); ctx.db.close();
    await assert.doesNotReject(cacheTerminalBudget(ctx, "ws_1", team.id, figure(), PKG)); assert.equal(fs.existsSync(lock), false);
  } finally { Date.now = realNow; globalThis.fetch = fetchBefore; t.cleanup(); }
});

for (const blocked of ["unwritable", "locked", "available"] as const) {
  test(`the real budget command prints figures and succeeds with ${blocked} local caching`, () => {
    const t = makeEnv(), ctx = ctxFor(t), now = Date.now(), currentMonth = new Date(now).toISOString().slice(0, 7);
    const lid = shareSession(ctx, "claude-code", "cli-current"), cacheDir = path.join(t.home, "budgets-cache"), lock = path.join(t.home, "sync.lock");
    const calls = path.join(t.root, "calls.jsonl"), preload = path.join(t.root, "budget-fetch.mjs");
    try {
      credentials(t.home); // Use an unexpired local token for this real-time subprocess.
      saveCredentials(t.home, { ...readJson<any>(layout.credentials(t.home)), access_expires_at: new Date(now + 3600000).toISOString() });
      ctx.db.prepare("UPDATE sessions SET cwd=? WHERE local_id=?").run(PKG, lid);
      writeJsonAtomic(layout.budgetCache(t.home, lid), { keep: "pending crossing" });
      const budget = { ...figure(now), month: currentMonth, budget: { amount_usd_micros: 100_000_000 },
        effective_budget_usd_micros: 100_000_000, estimated_spend_usd_micros: 80_000_000, remaining_usd_micros: 20_000_000,
        forecast_usd_micros: 90_000_000, allowance_remaining_usd_micros: null, pricing_note: "Estimates at list price." };
      fs.writeFileSync(preload, `import fs from 'node:fs';
        let printed = ''; const write = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk, ...args) => { printed += chunk; return write(chunk, ...args); };
        globalThis.fetch = async (input) => {
          const url = new URL(String(input)); fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(url.pathname + url.search) + '\\n');
          if (url.pathname === '/api/v2/me') return Response.json({ device: { id: 'dv_budget' }, workspaces: [{ id: 'ws_1', name: 'Acme' }] });
          if (url.pathname.endsWith('/goals')) return Response.json({ version: '1', goals: [] });
          if (url.pathname.endsWith('/spend/teams')) return Response.json({ teams: [${JSON.stringify(team)}] });
          if (url.pathname.includes('/sessions/')) {
            if (!printed.includes('Spend:')) throw new Error('Local update ran before figures were printed');
            return Response.json({ epoch_id: 'ep_1', team: ${JSON.stringify(team)}, month: ${JSON.stringify(currentMonth)} });
          }
          if (url.pathname.endsWith('/teams/pod_build/budget')) return Response.json(${JSON.stringify(budget)});
          throw new Error('Unexpected request ' + url.pathname);
        };`);
      if (blocked === "unwritable") fs.chmodSync(cacheDir, 0o500);
      else if (blocked === "locked") fs.writeFileSync(lock, "running-sync");
      const before = fs.statSync(layout.budgetCache(t.home, lid));
      ctx.db.close();
      const r = spawnSync(process.execPath, ["--import", preload, CLI, "budget", "--workspace", "ws_1", "--team", "Build"], { env: t.env, cwd: PKG, encoding: "utf8", timeout: 10000 });
      assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Build, .* UTC/);
      assert.match(r.stdout, /Base budget: \$100\.00/); assert.match(r.stdout, /Spend: \$80\.00\. Remaining: \$20\.00\. Month-end forecast: \$90\.00/);
      assert.match(r.stdout, /Remaining monthly allowance: no allowance/); assert.match(r.stdout, /Estimates at list price/);
      const expected = ["/api/v2/me", "/api/v2/workspaces/ws_1/goals", "/api/v2/workspaces/ws_1/spend/teams", "/api/v2/workspaces/ws_1/teams/pod_build/budget"];
      if (blocked === "available") expected.push("/api/v2/workspaces/ws_1/sessions/key-cli-current/budget?attribution=1");
      assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n").map((v) => JSON.parse(v)), expected);
      if (blocked === "available") {
        assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.crossings?.[0].threshold, 80);
        assert.ok(fs.existsSync(path.join(cacheDir, "teams.json")));
        assert.ok(fs.existsSync(attrFile(t.home, lid)));
        assert.equal(fs.existsSync(lock), false);
        return;
      }
      assert.deepEqual(readJson(layout.budgetCache(t.home, lid)), { keep: "pending crossing" });
      assert.equal(fs.statSync(layout.budgetCache(t.home, lid)).mtimeMs, before.mtimeMs);
      assert.deepEqual(fs.readdirSync(cacheDir), [`${lid}.json`]);
      assert.equal(fs.existsSync(path.join(t.home, "budget-attribution")), false);
      if (blocked === "locked") assert.equal(fs.readFileSync(lock, "utf8"), "running-sync");
      else assert.equal(fs.existsSync(lock), false);
    } finally { fs.chmodSync(cacheDir, 0o700); try { ctx.db.close(); } catch { /* already closed */ } t.cleanup(); }
  });
}
