// No listeners: persistent threshold delivery, the real prompt hook, and terminal selection/amount rules.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { budgetNotes, observedCrossings, BUDGET_FRESH_MS, type BudgetSnapshot } from "../src/shared/budget-notes.ts";
import { BUDGET_PASS_MS, cacheBudgetRead, receiveBudgetStamps, budgetFailure, budgetMonthLabel, budgetReadLabel, cacheTeamBudget, refreshSessionBudgets, requestAmount, budgetTeam } from "../src/budgets.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { CLOCK_TOLERANCE_MS } from "../src/shared/clock.ts";
import { saveCredentials } from "../src/api.ts";
import { pollDirectives } from "../src/directives.ts";
import { ctxFor, makeEnv, SHARE_GOAL, shareSession } from "./helpers.ts";
import { preToolUse, userPromptSubmit } from "../src/hooks/handlers.ts";

function fixture() {
  const home = fs.mkdtempSync(path.join(process.cwd(), ".spending-test-")), sid = "spending-session", lid = localId("claude-code", sid);
  const now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const hot: HotState = { v: 1, local_id: lid, harness: "claude-code", native_session_id: sid, cwd: null,
    share: { workspace_id: "ws_one", workspace_name: "Build workspace", session_key: "key_one", state: "shared" },
    goal: null, binding: { epoch_id: "ep_one", goal_id: null }, pending_binding: null, pending_directives: [], notices: [], epochs_seen: ["ep_one"] };
  const snapshot: BudgetSnapshot = { workspace_id: "ws_one", session_key: "key_one", epoch_id: "ep_one", fetched_at: new Date(now).toISOString(), as_of: new Date(now).toISOString(),
    month, team: { id: "pod_build", name: "Build" }, effective_budget_usd_micros: 100_000_000, estimated_spend_usd_micros: 80_000_000, spend_bound: "exact", unpriced_requests: 0 };
  const save = () => writeJsonAtomic(layout.budgetCache(home, lid), snapshot);
  save();
  return { home, sid, lid, now, hot, snapshot, save, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}

test("80 then 100 are each delivered once per session/month, across restarts, budget and team changes", () => {
  const f = fixture();
  try {
    const first = budgetNotes(f.home, f.lid, f.hot, f.now);
    assert.equal(first.length, 1); assert.match(first[0], /80%/); assert.match(first[0], /estimated at list price/);
    assert.match(first[0], /\[Align\]/); assert.match(first[0], /Work continues/); assert.match(first[0], /grants no authority/);
    assert.deepEqual(budgetNotes(f.home, f.lid, structuredClone(f.hot), f.now), []);
    f.snapshot.estimated_spend_usd_micros = 100_000_000; f.save();
    assert.match(budgetNotes(f.home, f.lid, f.hot, f.now).join(""), /100%/);
    f.snapshot.effective_budget_usd_micros = 50_000_000; f.snapshot.team.id = "pod_other"; f.save();
    assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, f.now), []);
    const next = new Date(`${f.snapshot.month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    f.snapshot.month = next.toISOString().slice(0, 7); f.snapshot.fetched_at = f.snapshot.as_of = next.toISOString(); f.save();
    assert.equal(budgetNotes(f.home, f.lid, f.hot, next.getTime()).length, 2);
  } finally { f.cleanup(); }
});

test("a leap past both thresholds delivers two notes; an unknown, stale or mismatched observation delivers none", () => {
  const cases: Partial<BudgetSnapshot>[] = [
    { spend_bound: "unknown", unpriced_requests: 1 }, { spend_bound: "unknown", unpriced_requests: null }, { estimated_spend_usd_micros: null }, { effective_budget_usd_micros: null },
    { effective_budget_usd_micros: 0 }, { epoch_id: "ep_old" }, { workspace_id: "ws_other" }, { session_key: "key_other" }, { month: "2000-01" },
    { as_of: new Date(Date.now() - BUDGET_FRESH_MS - 1000).toISOString() }, { fetched_at: new Date(Date.now() + 10000).toISOString() },
    { as_of: "invalid" }, { team: { id: "not-a-team", name: "Hidden" } },
  ];
  for (const patch of cases) {
    const f = fixture();
    try {
      const good = structuredClone(f.snapshot); Object.assign(f.snapshot, patch); f.save();
      assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, f.now), [], JSON.stringify(patch));
      Object.assign(f.snapshot, good, { estimated_spend_usd_micros: 120_000_000 }); f.save();
      assert.equal(budgetNotes(f.home, f.lid, f.hot, f.now).length, 2); // Refused observations never consume dedupe.
    } finally { f.cleanup(); }
  }
});

test("private, stopped, suspended and pending-bind sessions receive no threshold claim", () => {
  const f = fixture();
  try {
    assert.deepEqual(budgetNotes(f.home, f.lid, null, f.now), []);
    for (const state of ["stopped", "suspended"] as const) {
      const hot = structuredClone(f.hot); hot.share!.state = state;
      assert.deepEqual(budgetNotes(f.home, f.lid, hot, f.now), []);
    }
    const privateHot = structuredClone(f.hot); privateHot.share = null;
    assert.deepEqual(budgetNotes(f.home, f.lid, privateHot, f.now), []);
    const pending = structuredClone(f.hot); pending.pending_binding = { id: "pending", goal_id: null, goal: null, cause: "manual", directive_id: null };
    assert.deepEqual(budgetNotes(f.home, f.lid, pending, f.now), []);
    assert.equal(budgetNotes(f.home, f.lid, f.hot, f.now).length, 1);
  } finally { f.cleanup(); }
});

test("the real next-turn hook delivers information without blocking or writing authority, and context reset preserves dedupe", () => {
  const f = fixture();
  try {
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    const result = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "turn1" }) as Record<string, any>;
    assert.match(result.hookSpecificOutput.additionalContext, /80%/); assert.notEqual(result.decision, "block");
    assert.match(result.systemMessage, /80%/, "the claimed person-only message is returned even with no goal or other notice");
    assert.match(result.systemMessage, /Your work continues.*Spend tab.*align budget request/);
    assert.doesNotMatch(result.hookSpecificOutput.additionalContext, /align budget request/);
    assert.notEqual(result.systemMessage, result.hookSpecificOutput.additionalContext);
    assert.doesNotMatch(result.systemMessage, /\b\d{4}-\d{2}\b/);
    assert.ok(!fs.existsSync(layout.latch(f.home, f.lid))); assert.ok(!fs.existsSync(layout.hold(f.home, f.lid)));
    fs.rmSync(layout.injected(f.home, f.lid), { force: true });
    const second = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "turn2" });
    assert.ok(!JSON.stringify(second).includes("80%"));
  } finally { f.cleanup(); }
});

test("one prompt delivers suggestion, analysis and budget notices together, then keeps all silent on retry", () => {
  const f = fixture();
  try {
    f.hot.cwd = f.home;
    f.hot.goal = structuredClone(SHARE_GOAL);
    f.hot.binding!.goal_id = SHARE_GOAL.id;
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    writeJsonAtomic(layout.analysis(f.home, f.lid), [{
      id: "finding_one", root: "completed_turn", version: SHARE_GOAL.version, title: SHARE_GOAL.title,
      limit: { id: "limit_one", type: "must_not", text: "Change archived files" }, digest: "digest_one", evidence: "tool",
    }]);
    writeJsonAtomic(layout.feed(f.home, "ws_one"), {
      workspace_id: "ws_one", goals: [{ ...SHARE_GOAL, id: "g_next", title: "Finish the release", bindable: true }],
    });
    writeJsonAtomic(layout.suggestion(f.home, f.lid), {
      stage: "move", workspace: "ws_one", candidates: ["g_next"], origin: "suggested_rule",
      binding: SHARE_GOAL.id, folder: f.home,
    });
    const result = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "next_turn" }) as Record<string, any>;
    assert.match(result.systemMessage, /looks like work toward "Finish the release"/);
    assert.match(result.systemMessage, /work may have crossed a limit/);
    assert.match(result.systemMessage, /80%/);
    assert.match(result.hookSpecificOutput.additionalContext, /80%/);
    assert.doesNotMatch(result.hookSpecificOutput.additionalContext, /looks like work|Finish the release|work may have crossed a limit|A tool confirmed/);
    assert.notEqual(result.decision, "block");
    const retry = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "later_turn" });
    assert.doesNotMatch(JSON.stringify(retry), /80%|looks like work|work may have crossed a limit/);
  } finally { f.cleanup(); }
});

test("terminal team selection follows explicit choice, goal team or sole membership; ambiguity and bad amounts fail", () => {
  assert.equal(budgetTeam({ team: { id: "pod_goal", name: "Build" } }, undefined, [{ id: "pod_member" }]), "pod_goal");
  assert.equal(budgetTeam(null, "pod_explicit", []), "pod_explicit"); assert.equal(budgetTeam(null, undefined, [{ id: "pod_one" }]), "pod_one");
  for (const teams of [[], [{ id: "pod_one" }, { id: "pod_two" }]]) assert.throws(() => budgetTeam(null, undefined, teams), /Pass --team/);
  assert.throws(() => budgetTeam(null, "bad/id", []));
  for (const v of [undefined, "", "0", "-1", "1.001", "NaN", "1e3", "1000001"]) assert.throws(() => requestAmount(v));
  assert.equal(budgetTeam(null, "Build", [{ id: "pod_build", name: "Build" }, { id: "pod_support", name: "Support" }]), "pod_build");
  assert.equal(budgetTeam(null, "build", [{ id: "pod_build", name: "Build" }]), "pod_build");
  assert.throws(() => budgetTeam(null, "Build", [{ id: "pod_a", name: "Build" }, { id: "pod_b", name: "Build" }]), /Several teams/);
  assert.equal(requestAmount("0.29"), 0.29); assert.equal(requestAmount("1000000"), 1_000_000);
});

test("terminal budget help describes reads and creation, without any decision command", () => {
  for (const command of ["budget", "budget request"]) {
    const r = spawnSync(process.execPath, ["dist/cli.js", ...command.split(" "), "--help"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, new RegExp(`align ${command}`));
    assert.match(r.stdout, /monthly team budget/); assert.doesNotMatch(r.stdout, /envelope/);
    assert.doesNotMatch(r.stdout, /align budget request (approve|decline|withdraw|second-look)/);
  }
});

test("priced lower bounds cross thresholds while an unpriced request alone does not", () => {
  const f = fixture();
  try {
    f.snapshot.spend_bound = "lower"; f.snapshot.unpriced_requests = 1; f.snapshot.estimated_spend_usd_micros = 0; f.save();
    assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, f.now), []);
    f.snapshot.estimated_spend_usd_micros = 100_000_000; f.save();
    const notes = budgetNotes(f.home, f.lid, f.hot, f.now);
    assert.equal(notes.length, 2); assert.ok(notes.every((n) => n.startsWith("[Align] ")));
    assert.ok(notes.every((n) => !n.includes("--") && !n.includes("align budget") && n.includes("The person can ask for more in Align.")));
  } finally { f.cleanup(); }
});

test("sync bounds attribution reads, rotates sessions, reads each team/month once and clears not-found caches", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
  const calls: string[] = [], at = new Date().toISOString();
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  for (let n = 0; n < 101; n++) shareSession(ctx, "claude-code", `budget-${n}`);
  const rows = ctx.db.prepare("SELECT local_id FROM shares ORDER BY local_id").all() as { local_id: string }[];
  let refused = false;
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes("/sessions/")) return Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month: at.slice(0, 7) });
    if (url.includes("/teams/pod_build/budget")) return refused ? Response.json({ error: "not_found" }, { status: 404 }) : Response.json({ team: { id: "pod_build", name: "Build" }, month: at.slice(0, 7), as_of: at, effective_budget_usd_micros: 100000000, estimated_spend_usd_micros: 80000000, spend_bound: "lower", unpriced_requests: 1 });
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    await refreshSessionBudgets(ctx, () => Date.parse(at));
    assert.equal(calls.filter((p) => p.includes("/sessions/")).length, 100);
    assert.equal(calls.filter((p) => p.includes("/teams/")).length, 1);
    assert.ok(fs.existsSync(layout.budgetCache(t.home, rows[0].local_id)));
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, rows[100].local_id)));
    calls.length = 0; await refreshSessionBudgets(ctx, () => Date.parse(at));
    assert.equal(calls.length, 1); assert.ok(fs.existsSync(layout.budgetCache(t.home, rows[100].local_id)));
    calls.length = 0; await refreshSessionBudgets(ctx, () => Date.parse(at)); assert.equal(calls.length, 0);
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"));
    calls.length = 0; refused = true; await refreshSessionBudgets(ctx, () => Date.parse(at));
    assert.equal(calls.filter((p) => p.includes("/sessions/")).length, 0);
    assert.equal(calls.filter((p) => p.includes("/teams/")).length, 1);
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, rows[0].local_id)));
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});


test("an observed crossing survives a long pause and a later budget change, with the read time in the next prompt", () => {
  const f = fixture();
  try {
    const at = new Date().toISOString().slice(0, 7) + "-02T10:00:00.000Z";
    const observed = Date.parse(at), next = observed + 2 * 24 * 3600_000;
    f.snapshot.as_of = f.snapshot.fetched_at = at;
    f.snapshot.crossings = observedCrossings(f.snapshot, null, observed);
    const previous = structuredClone(f.snapshot);
    f.snapshot.effective_budget_usd_micros *= 2;
    f.snapshot.as_of = f.snapshot.fetched_at = new Date(observed + 60_000).toISOString();
    f.snapshot.epoch_id = "ep_new"; // A sync confirmed a different period in the same team.
    f.snapshot.crossings = observedCrossings(f.snapshot, previous, observed + 60_000);
    f.hot.binding!.epoch_id = "ep_new";
    f.save();
    const notes = budgetNotes(f.home, f.lid, f.hot, next);
    assert.equal(notes.length, 1); assert.match(notes[0], /80%/);
    assert.match(notes[0], /estimate was read on .*2, .*10:00.*UTC/);
    assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, next), []);
    fs.rmSync(layout.budgetShown(f.home, f.lid, f.snapshot.month, 80));
    f.snapshot.epoch_id = "ep_changed"; f.save();
    assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, next), []);
    f.snapshot.epoch_id = "ep_new"; f.snapshot.crossings[0].as_of = new Date(next + 1000).toISOString(); f.save();
    assert.deepEqual(budgetNotes(f.home, f.lid, f.hot, next), []);
  } finally { f.cleanup(); }
});


test("nothing-to-report answers are reused, ended shares are cleaned, old markers pruned and empty passes write no cursor", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch;
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  const now = Date.now();
  let reads = 0;
  globalThis.fetch = async () => { reads++; return Response.json(null); };
  try {
    for (const name of ["no-team", "unbound", "unreadable", "closed"]) shareSession(ctx, "claude-code", name);
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 4);
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 4);
    const lid = (ctx.db.prepare("SELECT local_id FROM shares LIMIT 1").get() as any).local_id;
    writeJsonAtomic(layout.budgetCache(t.home, lid), { private: "remove" });
    const month = new Date().toISOString().slice(0, 7);
    writeJsonAtomic(layout.budgetShown(t.home, lid, month, 80), {});
    const { stopSharing } = await import("../src/share.ts"); stopSharing(ctx, lid);
    assert.ok(fs.existsSync(layout.budgetShown(t.home, lid, month, 80)), "stop-sharing retains delivery markers");
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, lid)));
    assert.ok(!fs.existsSync(path.join(t.home, "budget-attribution", `${lid}.json`)));
    writeJsonAtomic(layout.budgetShown(t.home, lid, "2000-01", 80), {});
    ctx.db.prepare("DELETE FROM shares").run(); await refreshSessionBudgets(ctx, () => now);
    assert.ok(!fs.existsSync(layout.budgetShown(t.home, lid, "2000-01", 80)));
    assert.ok(!fs.existsSync(path.join(t.home, "budgets-cache", "cursor.json")));
    assert.equal(fs.readdirSync(path.join(t.home, "budget-attribution")).length, 0);
    const { markSignedOut } = await import("../src/api.ts");
    writeJsonAtomic(layout.budgetCache(t.home, lid), {}); markSignedOut(t.home, "logout");
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, lid)));
    assert.ok(!fs.existsSync(path.join(t.home, "budget-shown")), "sign-out removes markers");
  } finally { globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});

test("budget passes stop at the total read and time bounds and rotate beyond unfinished sessions", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch;
  const { BUDGET_READS_MAX, BUDGET_PASS_MS } = await import("../src/budgets.ts");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  for (let n = 0; n < 101; n++) shareSession(ctx, "claude-code", `bounded-${n}`);
  let reads = 0, clock = Date.now(), slow = false;
  const at = new Date(clock).toISOString();
  globalThis.fetch = async (url) => {
    reads++; if (slow) clock += BUDGET_PASS_MS;
    const team = { id: `pod_${String(url).split("/sessions/")[1]?.split("/")[0] ?? reads}`, name: "Current team" };
    return String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team, month: at.slice(0, 7) }) : Response.json(null, { status: 404 });
  };
  try {
    await refreshSessionBudgets(ctx, () => clock); assert.equal(reads, BUDGET_READS_MAX);
    const first = fs.readFileSync(path.join(t.home, "budgets-cache", "cursor.json"), "utf8");
    reads = 0; await refreshSessionBudgets(ctx, () => clock); assert.ok(reads > 0 && reads <= BUDGET_READS_MAX);
    assert.notEqual(fs.readFileSync(path.join(t.home, "budgets-cache", "cursor.json"), "utf8"), first);
    fs.rmSync(path.join(t.home, "budget-attribution"), { recursive: true, force: true });
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"));
    slow = true; reads = 0; await refreshSessionBudgets(ctx, () => clock); assert.equal(reads, 1);
    const paused = JSON.parse(fs.readFileSync(path.join(t.home, "budgets-cache", "cursor.json"), "utf8")).local_id;
    const ordered = ctx.db.prepare("SELECT local_id FROM shares ORDER BY local_id").all() as { local_id: string }[];
    const expectedNext = ordered.find((r) => r.local_id > paused)?.local_id ?? ordered[0].local_id;
    assert.ok(fs.existsSync(path.join(t.home, "budget-attribution", `${expectedNext}.json`)), "the unfinished session's attribution was saved");
    slow = false; reads = 0; await refreshSessionBudgets(ctx, () => clock);
    assert.ok(reads > 0 && reads <= BUDGET_READS_MAX);
    assert.ok(fs.existsSync(path.join(t.home, "budgets-cache", "teams.json")), "completed team reads survive the capped pass");
  } finally { globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});


test("a sync-observed crossing reaches the real next prompt after two days in the same month", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, nowBefore = Date.now;
  const at = new Date().toISOString().slice(0, 7) + "-02T10:00:00.000Z";
  let clock = Date.parse(at);
  const sid = "long-pause", lid = shareSession(ctx, "claude-code", sid);
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(clock + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month: at.slice(0, 7) }) : Response.json({ team: { id: "pod_build", name: "Build" }, month: at.slice(0, 7), as_of: at, effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
  try {
    Date.now = () => clock;
    await refreshSessionBudgets(ctx);
    assert.ok(fs.existsSync(layout.budgetCache(t.home, lid)));
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"));
    globalThis.fetch = async () => { throw new Error("Temporarily unavailable"); };
    await refreshSessionBudgets(ctx);
    assert.ok(fs.existsSync(layout.budgetCache(t.home, lid)), "a failed refresh preserves a due crossing");
    clock += 2 * 24 * 3600000;
    const result = userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: "Continue", prompt_id: "after-pause" });
    assert.match(JSON.stringify(result), /80%/); assert.match(JSON.stringify(result), /estimate was read on/);
    assert.doesNotMatch(JSON.stringify(userPromptSubmit(t.home, "claude-code", { session_id: sid, prompt: "Continue", prompt_id: "again" })), /80%/);
  } finally { Date.now = nowBefore; globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});


test("a matching older snapshot read fresh at the time retains its crossing after a long pause", () => {
  const f = fixture();
  try {
    const at = f.snapshot.month + "-02T10:00:00.000Z";
    f.snapshot.as_of = f.snapshot.fetched_at = at; f.save();
    const next = Date.parse(at) + 2 * 24 * 3600000;
    assert.equal(budgetNotes(f.home, f.lid, f.hot, next).length, 1);
    fs.rmSync(layout.budgetShown(f.home, f.lid, f.snapshot.month, 80));
    const newer = { ...f.snapshot, effective_budget_usd_micros: 200_000_000, fetched_at: new Date(next).toISOString(), as_of: new Date(next).toISOString() };
    assert.equal(observedCrossings(newer, f.snapshot, next)[0].threshold, 80);
  } finally { f.cleanup(); }
});


test("budget snapshots use the saved server offset with strict device timestamps, including a month boundary", () => {
  for (const offset of [5_000, 4 * 60_000, -4 * 60_000]) {
    const f = fixture();
    try {
      f.snapshot.clock_offset_ms = offset;
      f.snapshot.as_of = new Date(f.now + offset).toISOString(); f.save();
      assert.equal(budgetNotes(f.home, f.lid, f.hot, f.now).length, 1);
    } finally { f.cleanup(); }
  }
  const f = fixture();
  try {
    const now = Date.parse("2026-10-31T23:59:58Z");
    Object.assign(f.snapshot, { clock_offset_ms: 5_000, month: "2026-11", as_of: "2026-11-01T00:00:03Z", fetched_at: new Date(now).toISOString() });
    f.snapshot.crossings = observedCrossings(f.snapshot, null, now); f.save();
    assert.equal(f.snapshot.crossings.length, 1);
    assert.equal(budgetNotes(f.home, f.lid, f.hot, now).length, 1);
  } finally { f.cleanup(); }
});

test("a rejected server figure preserves the snapshot and pending crossing through the next sync", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
  const now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const lid = shareSession(ctx, "claude-code", "clock-offset");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null, clock_offset_ms: 240000 });
  let future = false;
  globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month }) : Response.json({ team: { id: "pod_build", name: "Build" }, month, as_of: new Date(now + (future ? 3600000 : 240000)).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
  try {
    await refreshSessionBudgets(ctx, () => now);
    const before = fs.readFileSync(layout.budgetCache(t.home, lid), "utf8");
    assert.equal(JSON.parse(before).clock_offset_ms, 240000);
    assert.equal(JSON.parse(before).crossings.length, 1);
    assert.equal(Object.values(JSON.parse(fs.readFileSync(path.join(t.home, "budgets-cache", "teams.json"), "utf8")))[0].budget.clock_offset_ms, 240000);
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json")); future = true;
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"), before);
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});


test("terminal reads replace team cache and snapshots after an effective change or removal", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
  const now = Date.now(), month = new Date(now).toISOString().slice(0, 7), lid = shareSession(ctx, "claude-code", "cache-update");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
  const b = { team: { id: "pod_build", name: "Build" }, month, as_of: new Date(now).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 };
  globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: b.team, month }) : Response.json(b);
  try {
    await refreshSessionBudgets(ctx, () => now);
    const before = JSON.parse(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"));
    assert.equal(before.crossings.length, 1);
    cacheTeamBudget(ctx, before.workspace_id, b.team.id, { ...b, effective_budget_usd_micros: 200 }, now);
    let next = JSON.parse(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"));
    assert.equal(next.effective_budget_usd_micros, 200); assert.deepEqual(next.crossings, []);
    await refreshSessionBudgets(ctx, () => now);
    next = JSON.parse(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"));
    assert.equal(next.effective_budget_usd_micros, 200); assert.deepEqual(next.crossings, []);
    cacheTeamBudget(ctx, before.workspace_id, b.team.id, { ...b, effective_budget_usd_micros: null }, now);
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(readJson(layout.budgetCache(t.home, lid)), null);
    assert.deepEqual(budgetNotes(t.home, lid, readJson(layout.hot(t.home, lid)), now), []);
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});


test("temporary route refusals preserve pending snapshots and are remembered briefly", async () => {
  for (const status of [401, 403, 405, 429, 500]) for (const route of ["attribution", "team"]) {
    const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
    const now = Date.now(), month = new Date(now).toISOString().slice(0, 7), lid = shareSession(ctx, "claude-code", "refusal");
    saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
    let refusal = false, calls = 0;
    const b = { team: { id: "pod_build", name: "Build", unnecessary: "drop-me" }, month, as_of: new Date(now).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0, history: ["drop-me"], can: { manage: true } };
    globalThis.fetch = async (url) => {
      calls++; const attribution = String(url).includes("/sessions/");
      if (refusal && attribution === (route === "attribution")) return Response.json({ message: "Temporary refusal" }, { status });
      return attribution ? Response.json({ epoch_id: "ep_1", team: b.team, month }) : Response.json(b);
    };
    try {
      await refreshSessionBudgets(ctx, () => now);
      const before = fs.readFileSync(layout.budgetCache(t.home, lid), "utf8");
      assert.doesNotMatch(before, /drop-me|history|manage/);
      assert.doesNotMatch(fs.readFileSync(path.join(t.home, "budgets-cache", "teams.json"), "utf8"), /drop-me|history|manage/);
      refusal = true; calls = 0;
      await refreshSessionBudgets(ctx, () => now + BUDGET_FRESH_MS);
      assert.ok(calls > 0); assert.equal(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"), before);
      calls = 0; await refreshSessionBudgets(ctx, () => now + BUDGET_FRESH_MS + 1);
      assert.equal(calls, 0); assert.equal(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"), before);
      await refreshSessionBudgets(ctx, () => now + BUDGET_FRESH_MS + 30001); assert.ok(calls > 0);
    } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
  }
});

test("marker cleanup isolates unreadable and concurrently populated directories", async () => {
  const t = makeEnv(), ctx = ctxFor(t), readdir = fs.readdirSync, rmdir = fs.rmdirSync, originalFetch = globalThis.fetch;
  const bad = path.join(t.home, "budget-shown", "unreadable"), race = path.join(t.home, "budget-shown", "race");
  fs.mkdirSync(bad, { recursive: true }); fs.mkdirSync(race);
  const now = Date.now(); let reads = 0;
  shareSession(ctx, "claude-code", "cleanup");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
  globalThis.fetch = async () => { reads++; return Response.json(null); };
  try {
    fs.readdirSync = ((dir: any, ...args: any[]) => { if (String(dir) === bad) throw new Error("Unreadable"); return (readdir as any)(dir, ...args); }) as typeof fs.readdirSync;
    fs.rmdirSync = ((dir: any, ...args: any[]) => { if (String(dir) === race) { fs.writeFileSync(path.join(race, "new"), ""); throw new Error("Not empty"); } return (rmdir as any)(dir, ...args); }) as typeof fs.rmdirSync;
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 1);
  } finally { fs.readdirSync = readdir; fs.rmdirSync = rmdir; globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});

test("invisible Unicode in server names is stripped before hook markers are neutralized", async () => {
  const { clean } = await import("../src/shared/envelope.ts");
  assert.equal(clean("B\u200bui\u202eld\u{e0061} [Al\u200bign", 100), "Build (Align");
  const f = fixture();
  try {
    f.snapshot.team.name = "B\u200bui\u202eld\u{e0061}"; f.save();
    const note = budgetNotes(f.home, f.lid, f.hot, f.now)[0];
    assert.match(note, /"Build"/); assert.doesNotMatch(note, /\p{Default_Ignorable_Code_Point}/u);
  } finally { f.cleanup(); }
});


test("terminal budget failures and dates use fixed plain copy", () => {
  assert.match(budgetFailure(400, "bad_request"), /amount.*reason/);
  assert.doesNotMatch(budgetFailure(500, "amount_usd_micros"), /amount_usd_micros|500/);
  assert.match(budgetFailure(401), /Sign in/);
  assert.equal(budgetMonthLabel("2026-11"), "November 2026");
  assert.match(budgetReadLabel("2026-11-18T04:45:00Z"), /November 18, 2026.*4:45.*UTC/);
});


test("sync uses the server month and preserves a pending crossing when a later month read disagrees", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
  let now = Date.parse("2030-01-31T23:59:58Z"), disagree = false;
  const lid = shareSession(ctx, "claude-code", "month-boundary");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null, clock_offset_ms: 5000 });
  globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month: disagree ? "2030-01" : "2030-02" }) : Response.json({ team: { id: "pod_build", name: "Build" }, month: "2030-02", as_of: "2030-02-01T00:00:03Z", effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact" });
  try {
    await refreshSessionBudgets(ctx, () => now);
    const before = fs.readFileSync(layout.budgetCache(t.home, lid), "utf8");
    assert.equal(JSON.parse(before).crossings.length, 1);
    now += BUDGET_FRESH_MS + 1; disagree = true;
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"), before);
    const hot = JSON.parse(fs.readFileSync(layout.hot(t.home, lid), "utf8"));
    assert.equal(budgetNotes(t.home, lid, hot, now).length, 1);
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});

test("the tolerance accepts a server seconds ahead without reading credentials or scanning directories in the hook", () => {
  const f = fixture(), read = fs.readFileSync, scan = fs.readdirSync;
  let credentialReads = 0, scans = 0;
  try {
    f.snapshot.clock_offset_ms = 0; f.snapshot.as_of = new Date(f.now + 5000).toISOString(); f.save();
    fs.readFileSync = ((file: any, ...args: any[]) => { if (String(file).endsWith("credentials.json")) { credentialReads++; throw new Error("Credential read"); } return (read as any)(file, ...args); }) as typeof fs.readFileSync;
    fs.readdirSync = (() => { scans++; throw new Error("Directory scan"); }) as typeof fs.readdirSync;
    assert.equal(budgetNotes(f.home, f.lid, f.hot, f.now).length, 1);
    assert.equal(credentialReads, 0); assert.equal(scans, 0);
  } finally { fs.readFileSync = read; fs.readdirSync = scan; f.cleanup(); }
});

test("the sync pass finishes directive, activity and steering work before budget reads", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
  const now = Date.now(), lid = shareSession(ctx, "claude-code", "budget-order"), calls: string[] = [];
  // No repository is involved in this test or in sync's edit detection.
  ctx.db.prepare("UPDATE sessions SET cwd=NULL WHERE local_id=?").run(lid);
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
  writeJsonAtomic(path.join(layout.steeringDir(t.home), "queued.json"), { local_id: lid, workspace_id: "ws_1", goal_id: "g_one", suggested_goal_id: "g_two", share: 80, target: 20, at: new Date(now).toISOString() });
  globalThis.fetch = async (url) => {
    const route = new URL(String(url)).pathname; calls.push(route);
    if (route === "/api/v2/me") return Response.json({ user: { id: "u_one", name: "Person", email: "person@example.test" }, device: { id: "dv_budget", name: "Device" }, workspaces: [{ id: "ws_1", name: "Workspace", role: "member", teams: [] }] });
    if (route === "/api/v2/directives") return Response.json({ directives: [], workspaces: ["ws_1"], next_cursor: 0 });
    if (route.endsWith("/goals")) return Response.json({ goals: [], version: "1" });
    if (route.endsWith("/asks")) return Response.json({ asks: [], version: "1" });
    if (route.endsWith("/activity")) return Response.json({ items: [], cursor: 0 });
    if (route.endsWith("/steering")) return Response.json({ accepted: 1 });
    if (route.endsWith("/budget")) return Response.json(null);
    throw new Error(`Unexpected route ${route}`);
  };
  try {
    const { syncOnce } = await import("../src/sync.ts");
    await syncOnce(ctx, { tailBudgetMs: 0, refreshFeeds: true });
    const budget = calls.findIndex((p) => p.endsWith("/budget"));
    assert.ok(budget >= 0);
    for (const suffix of ["/directives", "/activity", "/steering"]) {
      const index = calls.findIndex((p) => p.endsWith(suffix));
      assert.ok(index >= 0 && index < budget, `${suffix} is completed before budgets`);
    }
    assert.equal(budget, calls.length - 1);
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});

test("a budget pass stops after two reads when its injected clock passes the time cap", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, start = Date.now();
  let clock = start, reads = 0;
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(start + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  for (let n = 0; n < 3; n++) shareSession(ctx, "claude-code", `time-cap-${n}`);
  const rows = ctx.db.prepare("SELECT local_id FROM shares ORDER BY local_id").all() as { local_id: string }[];
  globalThis.fetch = async () => {
    reads++;
    // One read finishes just before the deadline; the next finishes just after it.
    clock = start + (reads === 1 ? BUDGET_PASS_MS - 1 : BUDGET_PASS_MS + 1);
    return Response.json(null);
  };
  try {
    await refreshSessionBudgets(ctx, () => clock);
    assert.equal(reads, 2);
    assert.deepEqual(readJson(path.join(t.home, "budgets-cache", "cursor.json")), { local_id: rows[1].local_id });
    for (const [i, row] of rows.entries()) {
      assert.equal(fs.existsSync(path.join(t.home, "budget-attribution", `${row.local_id}.json`)), i < 2);
    }
    await refreshSessionBudgets(ctx, () => clock);
    assert.equal(reads, 3, "the next pass resumes with the unfinished session");
  } finally { globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});

test("tool warnings stay user-only, skip subagents and a busy lock, and share durable delivery limits with prompts", () => {
  const f = fixture();
  try {
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    const input = { session_id: f.sid, tool_name: "Read", tool_input: {} };
    assert.equal(preToolUse(f.home, "claude-code", { ...input, agent_id: "child" }), null);
    const lock = layout.injected(f.home, f.lid) + ".lock";
    fs.mkdirSync(lock, { recursive: true });
    assert.equal(preToolUse(f.home, "claude-code", input), null);
    fs.rmdirSync(lock);
    const warned = preToolUse(f.home, "claude-code", input) as any;
    assert.match(warned.systemMessage, /80%/);
    assert.equal(warned.hookSpecificOutput, undefined, "a budget crossing adds zero model context mid-turn");
    assert.equal(preToolUse(f.home, "claude-code", input), null);
    const prompt = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "next" }) as any;
    assert.match(prompt.hookSpecificOutput.additionalContext, /80%/);
    assert.ok(!prompt.systemMessage?.includes("80%"));
    fs.rmSync(layout.injected(f.home, f.lid), { force: true });
    assert.doesNotMatch(JSON.stringify(userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "restart" })), /80%/);
    assert.equal(preToolUse(f.home, "claude-code", input), null);
  } finally { f.cleanup(); }
});

test("a prompt-first crossing consumes the user warning too; unsupported harness tool calls consume neither marker", () => {
  const f = fixture();
  try {
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    // Use Codex's actual local id and hot file; no user-only tool message has been verified for it.
    const codex = localId("codex", f.sid), hot = { ...f.hot, local_id: codex, harness: "codex" as const };
    writeJsonAtomic(layout.hot(f.home, codex), hot);
    writeJsonAtomic(layout.budgetCache(f.home, codex), f.snapshot);
    assert.equal(preToolUse(f.home, "codex", { session_id: f.sid, tool_name: "shell" }), null);
    assert.equal(fs.existsSync(layout.budgetShown(f.home, codex, f.snapshot.month, 80)), false);
    const prompt = userPromptSubmit(f.home, "codex", { session_id: f.sid, prompt: "Continue", turn_id: "first" }) as any;
    assert.match(prompt.hookSpecificOutput.additionalContext, /80%/);
    assert.match(prompt.systemMessage, /80%/);
    assert.equal(preToolUse(f.home, "codex", { session_id: f.sid, tool_name: "shell" }), null);
  } finally { f.cleanup(); }
});

test("directive stamps invalidate only changed team reads, including removal, without extra attribution or unchanged-pass reads", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now();
  const lid = shareSession(ctx, "claude-code", "stamp-session"), at = new Date(now).toISOString(), month = at.slice(0, 7);
  const calls: string[] = [];
  let amount: number | null = 100, stamp = "a".repeat(64);
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes("/directives?")) return Response.json({ directives: [], next_cursor: "0", budget_stamps: [{ ws: "ws_1", team: "pod_build", month, stamp }], unknown_future_field: true });
    if (url.includes("/sessions/")) return Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month, budget_stamp: stamp });
    return Response.json({ team: { id: "pod_build", name: "Build" }, month, as_of: at, budget_stamp: stamp,
      effective_budget_usd_micros: amount, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
  };
  try {
    const pass = async () => { await pollDirectives(ctx, () => undefined); await refreshSessionBudgets(ctx, () => now); };
    await pass(); assert.equal(calls.length, 3);
    calls.length = 0; await pass(); assert.equal(calls.length, 1); assert.match(calls[0], /directives\?/);
    for (const [nextStamp, nextAmount] of [["b", 200], ["c", 50], ["d", null], ["e", 100]] as const) {
      stamp = nextStamp.repeat(64); amount = nextAmount; calls.length = 0; await pass();
      assert.equal(calls.length, 2); assert.equal(calls.filter((u) => u.includes("/teams/")).length, 1);
      assert.equal(calls.filter((u) => u.includes("/sessions/")).length, 0);
      const cached = readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid));
      if (amount === null) assert.equal(cached, null, "removal erases even an observed undelivered crossing");
      else assert.equal(cached?.effective_budget_usd_micros, amount);
      calls.length = 0; await pass(); assert.equal(calls.length, 1);
    }
    receiveBudgetStamps(ctx, undefined); calls.length = 0; await refreshSessionBudgets(ctx, () => now); assert.equal(calls.length, 0);
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("terminal and sync cache updates share figure validation and match only confirmed session attribution", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now();
  const lid = shareSession(ctx, "claude-code", "terminal-read"), at = new Date(now).toISOString(), month = at.slice(0, 7);
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  const figure = { team: { id: "pod_build", name: "Build" }, month, as_of: at, effective_budget_usd_micros: 100, estimated_spend_usd_micros: 10, spend_bound: "exact", unpriced_requests: 0 };
  globalThis.fetch = async (input) => String(input).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: figure.team, month }) : Response.json(figure);
  try {
    await refreshSessionBudgets(ctx, () => now);
    globalThis.fetch = async () => { throw new Error("no network expected"); };
    cacheBudgetRead(ctx, "ws_1", "pod_build", { ...figure, estimated_spend_usd_micros: 80 }, now);
    assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.estimated_spend_usd_micros, 80);
    for (const patch of [{ month: "2000-01" }, { as_of: "invalid" }, { as_of: new Date(now + CLOCK_TOLERANCE_MS + 1000).toISOString() }, { team: { id: "pod_other", name: "Other" } }, { estimated_spend_usd_micros: "100" }]) {
      cacheBudgetRead(ctx, "ws_1", "pod_build", { ...figure, ...patch }, now);
      assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.estimated_spend_usd_micros, 80);
    }
    cacheBudgetRead(ctx, "ws_1", "pod_build", { ...figure, effective_budget_usd_micros: null }, now);
    assert.equal(readJson(layout.budgetCache(t.home, lid)), null);
    assert.deepEqual(budgetNotes(t.home, lid, readJson(layout.hot(t.home, lid))), []);
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("404 budget routes and unknown additive stamp fields never stop a pass or create a note", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now();
  const lid = shareSession(ctx, "claude-code", "old-server");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  let reads = 0;
  globalThis.fetch = async () => { reads++; return Response.json({ error: "not_found", future: true }, { status: 404 }); };
  try {
    receiveBudgetStamps(ctx, { future: true });
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 1);
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 1);
    assert.equal(readJson(layout.budgetCache(t.home, lid)), null);
    assert.deepEqual(budgetNotes(t.home, lid, readJson(layout.hot(t.home, lid))), []);
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("the committed base agent's directive intake ignores budget stamps and still applies a stop", async () => {
  const { budgetBaseIntake } = await import("./fixtures/budget-base-intake.mjs");
  const { handleDirective, cursor } = await import("../src/directives.ts");
  const { kvSet } = await import("../src/db.ts");
  const { api, HttpError } = await import("../src/api.ts");
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch;
  const lid = shareSession(ctx, "claude-code", "old-intake"), share = ctx.db.prepare("SELECT session_key FROM shares WHERE local_id=?").get(lid) as any;
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  globalThis.fetch = async () => Response.json({ directives: [{ id: "dir_legacy_stop", seq: 1, ws: "ws_1", kind: "stop", session_keys: [share.session_key], goal: null, binding: null, created_at: new Date().toISOString() }], next_cursor: "1", workspaces: ["ws_1"], budget_stamps: [{ ws: "ws_1", team: "pod_build", month: new Date().toISOString().slice(0, 7), stamp: "a".repeat(64) }] });
  try {
    const legacy = budgetBaseIntake({ api, HttpError, cursor, handleDirective,
      advanceCursor: (c: typeof ctx, n: number) => kvSet(c.db, "directive_cursor", String(n)),
      endSharesEndedOnServer: () => { throw new Error("not exercised"); }, validEnded: () => false, endedRead: () => undefined });
    assert.equal(await legacy(ctx, () => undefined), 1);
    assert.equal(cursor(ctx), 1); assert.ok(fs.existsSync(layout.latch(t.home, lid)));
    assert.equal(ctx.budgetStamps, undefined, "the base intake has no budget stamp support");
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("a figure computed after the pass began is accepted, and sync confirms stale attribution within base caps", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, realNow = Date.now;
  const lid = shareSession(ctx, "claude-code", "during-read");
  let clock = realNow(); const month = new Date(clock).toISOString().slice(0, 7);
  let reads = 0;
  const figure = () => ({ team: { id: "pod_build", name: "Build" }, month, as_of: new Date(clock).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact", unpriced_requests: 0 });
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(clock + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  globalThis.fetch = async (input) => {
    reads++; clock += 10;
    return String(input).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month }) : Response.json(figure());
  };
  try {
    Date.now = () => clock;
    await refreshSessionBudgets(ctx, () => clock);
    assert.equal(reads, 2); assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.estimated_spend_usd_micros, 80);
    clock += BUDGET_FRESH_MS + 1000;
    reads = 0;
    cacheBudgetRead(ctx, "ws_1", "pod_build", { ...figure(), estimated_spend_usd_micros: 100 });
    await refreshSessionBudgets(ctx, () => clock); // Sync confirms stale attribution with no repeated team read.
    assert.equal(reads, 1);
    assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.estimated_spend_usd_micros, 100);
  } finally { Date.now = realNow; globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("a legacy cached absent budget gets no new read, snapshot, context or message when stamps are empty", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now();
  const lid = shareSession(ctx, "claude-code", "absent-budget"), at = new Date(now).toISOString(), month = at.slice(0, 7);
  userPromptSubmit(t.home, "claude-code", { session_id: "absent-budget", prompt: "Start", prompt_id: "baseline" });
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  let reads = 0;
  globalThis.fetch = async (input) => {
    reads++;
    return String(input).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month }) : Response.json({ team: { id: "pod_build", name: "Build" }, month, as_of: at, effective_budget_usd_micros: null, estimated_spend_usd_micros: 100, spend_bound: "exact", unpriced_requests: 0 });
  };
  try {
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 2);
    const file = path.join(t.home, "budgets-cache", "teams.json"), teams = readJson<Record<string, any>>(file)!;
    delete teams[`ws_1:pod_build:${month}`].stamp; writeJsonAtomic(file, teams); // The exact cache shape before stamps.
    receiveBudgetStamps(ctx, []);
    reads = 0; await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 0);
    assert.equal(readJson(layout.budgetCache(t.home, lid)), null);
    const input = { session_id: "absent-budget", tool_name: "Read" };
    assert.equal(preToolUse(t.home, "claude-code", input), null);
    assert.equal(userPromptSubmit(t.home, "claude-code", { session_id: "absent-budget", prompt: "Continue", prompt_id: "nothing-new" }), null);
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("a confirmed removal clears due notes even outside the rotating session batch, with one team read", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now(), at = new Date(now).toISOString(), month = at.slice(0, 7);
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  const lids = Array.from({ length: 101 }, (_, n) => shareSession(ctx, "claude-code", `remove-batch-${n}`));
  let removed = false, reads = 0;
  globalThis.fetch = async (input) => {
    reads++;
    return String(input).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month }) : Response.json({ team: { id: "pod_build", name: "Build" }, month, as_of: at, budget_stamp: (removed ? "b" : "a").repeat(64), effective_budget_usd_micros: removed ? null : 100, estimated_spend_usd_micros: 100, spend_bound: "exact", unpriced_requests: 0 });
  };
  try {
    await refreshSessionBudgets(ctx, () => now); await refreshSessionBudgets(ctx, () => now);
    assert.equal(lids.filter((lid) => fs.existsSync(layout.budgetCache(t.home, lid))).length, 101);
    removed = true; reads = 0;
    receiveBudgetStamps(ctx, [{ ws: "ws_1", team: "pod_build", month, stamp: "b".repeat(64) }]);
    await refreshSessionBudgets(ctx, () => now); assert.equal(reads, 1);
    for (const lid of lids) {
      assert.equal(fs.existsSync(layout.budgetCache(t.home, lid)), false);
      assert.deepEqual(budgetNotes(t.home, lid, readJson(layout.hot(t.home, lid))), []);
    }
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("hook and shared modules never import the network client or name the credential file", () => {
  const roots = [new URL("../src/hooks/", import.meta.url), new URL("../src/shared/", import.meta.url)];
  const visit = (dir: URL) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      const source = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(source, /credentials\.json/, file.pathname);
      assert.doesNotMatch(source, /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)["'][^"']*\/api\.ts["']/, file.pathname);
    }
  };
  roots.forEach(visit);
});

test("mid-turn budget messages wait for the locally opened epoch to be confirmed", () => {
  const f = fixture();
  try {
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    const input = { session_id: f.sid, tool_name: "Read", tool_input: {} };
    writeJsonAtomic(layout.injected(f.home, f.lid), { opened_epoch: { epoch_id: "ep_next", goal: null, at: new Date(f.now).toISOString() } });
    assert.equal(preToolUse(f.home, "claude-code", input), null);
    assert.equal(fs.existsSync(layout.budgetShown(f.home, f.lid, f.snapshot.month, 80) + "-message"), false);
    f.hot.binding!.epoch_id = "ep_next";
    writeJsonAtomic(layout.hot(f.home, f.lid), f.hot);
    assert.equal(preToolUse(f.home, "claude-code", input), null, "a prior-period snapshot cannot enter a newly confirmed period");
    f.snapshot.epoch_id = "ep_next"; f.save();
    const delivered = preToolUse(f.home, "claude-code", input) as any;
    assert.match(delivered.systemMessage, /Your work continues.*align budget request/);
    assert.equal(delivered.hookSpecificOutput, undefined);
    assert.equal(preToolUse(f.home, "claude-code", input), null);
  } finally { f.cleanup(); }
});

test("an explicit null budget read clears a pending observation without claiming a marker", async () => {
  const t = makeEnv(), ctx = ctxFor(t), before = globalThis.fetch, now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const lid = shareSession(ctx, "claude-code", "null-budget");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
  let removed = false;
  globalThis.fetch = async (url) => String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team: { id: "pod_build", name: "Build" }, month }) : Response.json(removed ? null : { team: { id: "pod_build", name: "Build" }, month, as_of: new Date(now).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact" });
  try {
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.crossings?.length, 1);
    removed = true;
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"));
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(readJson(layout.budgetCache(t.home, lid)), null);
    assert.equal(fs.existsSync(layout.budgetShown(t.home, lid, month, 80)), false);
  } finally { globalThis.fetch = before; ctx.db.close(); t.cleanup(); }
});

test("invalid or empty success bodies preserve pending snapshots and retry instead of acting as null", async () => {
  for (const route of ["attribution", "team"]) {
    const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch;
    const now = Date.now(), month = new Date(now).toISOString().slice(0, 7), lid = shareSession(ctx, "claude-code", "invalid-body");
    saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
    let bad: string | undefined;
    const budget = { team: { id: "pod_build", name: "Build" }, month, as_of: new Date(now).toISOString(), effective_budget_usd_micros: 100, estimated_spend_usd_micros: 80, spend_bound: "exact" };
    globalThis.fetch = async (url) => {
      const attribution = String(url).includes("/sessions/");
      if (bad !== undefined && attribution === (route === "attribution")) return new Response(bad, { status: 200 });
      return Response.json(attribution ? { epoch_id: "ep_1", team: budget.team, month } : budget);
    };
    try {
      await refreshSessionBudgets(ctx, () => now);
      const before = fs.readFileSync(layout.budgetCache(t.home, lid), "utf8");
      for (bad of ["not json", ""]) {
        fs.rmSync(path.join(t.home, "budget-attribution", `${lid}.json`), { force: true });
        fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"), { force: true });
        await refreshSessionBudgets(ctx, () => now);
        assert.equal(fs.readFileSync(layout.budgetCache(t.home, lid), "utf8"), before);
      }
      bad = undefined;
      await refreshSessionBudgets(ctx, () => now);
      assert.equal(readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.crossings?.length, 1);
    } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
  }
});

test("an accepted effective amount invalidates older snapshots outside the rotating batch and stale terminal attribution", async () => {
  const t = makeEnv(), ctx = ctxFor(t), originalFetch = globalThis.fetch, now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const lids = Array.from({ length: 101 }, (_, n) => shareSession(ctx, "claude-code", `changed-batch-${n}`));
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "token", access_expires_at: new Date(now + 3600000).toISOString(), refresh_token: "refresh", user: null });
  let amount = 100, stamp = "a".repeat(64);
  const figure = () => ({ team: { id: "pod_build", name: "Build" }, month, as_of: new Date(now).toISOString(), effective_budget_usd_micros: amount, estimated_spend_usd_micros: 80, spend_bound: "exact", budget_stamp: stamp });
  globalThis.fetch = async (url) => Response.json(String(url).includes("/sessions/") ? { epoch_id: "ep_1", team: figure().team, month } : figure());
  try {
    await refreshSessionBudgets(ctx, () => now); await refreshSessionBudgets(ctx, () => now);
    assert.equal(lids.filter((lid) => readJson<BudgetSnapshot>(layout.budgetCache(t.home, lid))?.crossings?.length === 1).length, 101);
    amount = 200; stamp = "b".repeat(64);
    receiveBudgetStamps(ctx, [{ ws: "ws_1", team: "pod_build", month, stamp }]);
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(lids.filter((lid) => fs.existsSync(layout.budgetCache(t.home, lid))).length, 100);
    for (const lid of lids) assert.deepEqual(budgetNotes(t.home, lid, readJson(layout.hot(t.home, lid)), now), []);
    await refreshSessionBudgets(ctx, () => now);
    assert.equal(lids.filter((lid) => fs.existsSync(layout.budgetCache(t.home, lid))).length, 101);
    const file = layout.budgetCache(t.home, lids[0]);
    writeJsonAtomic(file, { ...readJson<BudgetSnapshot>(file), effective_budget_usd_micros: 100, crossings: [{ threshold: 80, as_of: figure().as_of }] });
    fs.rmSync(path.join(t.home, "budget-attribution", `${lids[0]}.json`));
    cacheBudgetRead(ctx, "ws_1", "pod_build", figure(), now);
    assert.equal(readJson(file), null, "a stale attribution cannot retain a note from the replaced amount");
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});
