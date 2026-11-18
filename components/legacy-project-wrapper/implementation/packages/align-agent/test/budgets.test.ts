// No listeners: persistent threshold delivery, the real prompt hook, and terminal selection/amount rules.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { budgetNotes, observedCrossings, BUDGET_FRESH_MS, type BudgetSnapshot } from "../src/shared/budget-notes.ts";
import { refreshSessionBudgets, requestAmount, budgetTeam } from "../src/budgets.ts";
import { writeJsonAtomic } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import type { HotState } from "../src/shared/types.ts";
import { saveCredentials } from "../src/api.ts";
import { ctxFor, makeEnv, shareSession } from "./helpers.ts";
import { userPromptSubmit } from "../src/hooks/handlers.ts";

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
    assert.ok(!fs.existsSync(layout.latch(f.home, f.lid))); assert.ok(!fs.existsSync(layout.hold(f.home, f.lid)));
    fs.rmSync(layout.injected(f.home, f.lid), { force: true });
    const second = userPromptSubmit(f.home, "claude-code", { session_id: f.sid, prompt: "Continue", prompt_id: "turn2" });
    assert.ok(!JSON.stringify(second).includes("80%"));
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

test("sync bounds attribution reads, rotates sessions, reads each team/month once and erases refused caches", async () => {
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
    await refreshSessionBudgets(ctx);
    assert.equal(calls.filter((p) => p.includes("/sessions/")).length, 100);
    assert.equal(calls.filter((p) => p.includes("/teams/")).length, 1);
    assert.ok(fs.existsSync(layout.budgetCache(t.home, rows[0].local_id)));
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, rows[100].local_id)));
    calls.length = 0; await refreshSessionBudgets(ctx);
    assert.equal(calls.length, 1); assert.ok(fs.existsSync(layout.budgetCache(t.home, rows[100].local_id)));
    calls.length = 0; await refreshSessionBudgets(ctx); assert.equal(calls.length, 0);
    fs.rmSync(path.join(t.home, "budgets-cache", "teams.json"));
    calls.length = 0; refused = true; await refreshSessionBudgets(ctx);
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
  let reads = 0;
  globalThis.fetch = async () => { reads++; return Response.json(null); };
  try {
    for (const name of ["no-team", "unbound", "unreadable", "closed"]) shareSession(ctx, "claude-code", name);
    await refreshSessionBudgets(ctx); assert.equal(reads, 4);
    await refreshSessionBudgets(ctx); assert.equal(reads, 4);
    const lid = (ctx.db.prepare("SELECT local_id FROM shares LIMIT 1").get() as any).local_id;
    writeJsonAtomic(layout.budgetCache(t.home, lid), { private: "remove" });
    const { stopSharing } = await import("../src/share.ts"); stopSharing(ctx, lid);
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, lid)));
    assert.ok(!fs.existsSync(path.join(t.home, "budget-attribution", `${lid}.json`)));
    writeJsonAtomic(layout.budgetShown(t.home, lid, "2000-01", 80), {});
    ctx.db.prepare("DELETE FROM shares").run(); await refreshSessionBudgets(ctx);
    assert.ok(!fs.existsSync(layout.budgetShown(t.home, lid, "2000-01", 80)));
    assert.ok(!fs.existsSync(path.join(t.home, "budgets-cache", "cursor.json")));
    assert.equal(fs.readdirSync(path.join(t.home, "budget-attribution")).length, 0);
    const { markSignedOut } = await import("../src/api.ts");
    writeJsonAtomic(layout.budgetCache(t.home, lid), {}); markSignedOut(t.home, "logout");
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, lid)));
  } finally { globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
});

test("budget passes stop at the total read and time bounds and rotate beyond unfinished sessions", async () => {
  const t = makeEnv(), ctx = ctxFor(t), fetchBefore = globalThis.fetch, realNow = Date.now;
  const { BUDGET_READS_MAX, BUDGET_PASS_MS } = await import("../src/budgets.ts");
  saveCredentials(t.home, { server_url: "http://127.0.0.1:3100", device_id: "dv_budget", access_token: "unit-token", access_expires_at: new Date(Date.now() + 3600000).toISOString(), refresh_token: "unit-refresh", user: null });
  for (let n = 0; n < 101; n++) shareSession(ctx, "claude-code", `bounded-${n}`);
  let reads = 0, clock = realNow(), slow = false;
  const at = new Date(clock).toISOString();
  globalThis.fetch = async (url) => {
    reads++; if (slow) clock += BUDGET_PASS_MS;
    const team = { id: `pod_${String(url).split("/sessions/")[1]?.split("/")[0] ?? reads}`, name: "Current team" };
    return String(url).includes("/sessions/") ? Response.json({ epoch_id: "ep_1", team, month: at.slice(0, 7) }) : Response.json(null, { status: 404 });
  };
  try {
    Date.now = () => clock;
    await refreshSessionBudgets(ctx); assert.equal(reads, BUDGET_READS_MAX);
    const first = fs.readFileSync(path.join(t.home, "budgets-cache", "cursor.json"), "utf8");
    reads = 0; await refreshSessionBudgets(ctx); assert.ok(reads > 0 && reads <= BUDGET_READS_MAX);
    assert.notEqual(fs.readFileSync(path.join(t.home, "budgets-cache", "cursor.json"), "utf8"), first);
    fs.rmSync(path.join(t.home, "budget-attribution"), { recursive: true, force: true });
    slow = true; reads = 0; await refreshSessionBudgets(ctx); assert.equal(reads, 1);
  } finally { Date.now = realNow; globalThis.fetch = fetchBefore; ctx.db.close(); t.cleanup(); }
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
