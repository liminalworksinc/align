// No listeners: persistent threshold delivery, the real prompt hook, and terminal selection/amount rules.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { budgetNotes, BUDGET_FRESH_MS, type BudgetSnapshot } from "../src/shared/budget-notes.ts";
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
  assert.equal(requestAmount("0.29"), 0.29); assert.equal(requestAmount("1000000"), 1_000_000);
});

test("terminal spending help describes reads and creation, without any decision command", () => {
  for (const command of ["budget", "budget request"]) {
    const r = spawnSync(process.execPath, ["dist/cli.js", ...command.split(" "), "--help"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, new RegExp(`align ${command}`));
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
    assert.equal(calls.length, 2); assert.ok(fs.existsSync(layout.budgetCache(t.home, rows[100].local_id)));
    calls.length = 0; refused = true; await refreshSessionBudgets(ctx);
    assert.equal(calls.filter((p) => p.includes("/sessions/")).length, 0);
    assert.equal(calls.filter((p) => p.includes("/teams/")).length, 1);
    assert.ok(!fs.existsSync(layout.budgetCache(t.home, rows[0].local_id)));
  } finally { globalThis.fetch = originalFetch; ctx.db.close(); t.cleanup(); }
});
