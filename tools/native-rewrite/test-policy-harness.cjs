const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./policy-harness.cjs");

test("policy observations distinguish undefined properties, thrown errors and returned error-shaped data", () => {
  assert.notDeepEqual(h.encode({ok: undefined}), h.encode({}));
  assert.notDeepEqual(h.observeCall(() => {throw new TypeError();}, []), h.observeCall(() => ({error: "TypeError"}), []));
  assert.deepEqual(h.encode({b: true, a: false}), h.encode({a: false, b: true}));
});
test("policy observations retain Map entries, order, hostile keys and shared references", () => {
  const a = new Map([["__proto__", "lead"], ["constructor", "member"]]);
  assert.notDeepEqual(h.encode(a), h.encode(new Map([...a].reverse())));
  assert.deepEqual(h.encode({a, b: a}), h.encode({a: new Map(a), b: new Map(a)}));
});
test("policy batches detect argument mutations and use fresh inputs for each observation", () => {
  const unchanged = h.runBatch(() => ({ok: true}), "authorize", 0, 50);
  const mutated = h.runBatch(p => {p.pods.set("injected", "lead"); return {ok: true};}, "authorize", 0, 50);
  assert.notDeepEqual(mutated, unchanged);
  assert.deepEqual(h.runBatch(() => ({ok: true}), "authorize", 0, 50), unchanged);
});
test("policy matrix covers every supported action, object kind, workspace role and team lead viewer", () => {
  const actions = new Set(), kinds = new Set(), roles = new Set(), workspaces = new Set();
  let viewerLead = 0, count = 0;
  for (const [p, action, obj] of h.vectors("authorize")) {
    actions.add(action); kinds.add(obj.kind); roles.add(p.wsRole); workspaces.add(p.wsId); count++;
    if (p.wsRole === "viewer" && p.pods.some(([id, role]) => id === "team1" && role === "lead") && action === "pod.manage_members" && obj.kind === "pod" && obj.podId === "team1") viewerLead++;
  }
  assert.deepEqual([...actions].sort(), h.ACTIONS.slice().sort());
  assert.deepEqual([...kinds].sort(), ["alignment", "bind", "goal", "goal_draft", "pod", "session", "workspace"]);
  assert.deepEqual([...roles], [null, "owner", "member", "viewer"]);
  assert.ok(viewerLead > 0); assert.equal(count, 312928); assert.equal(workspaces.size, 5);
  assert.equal(h.countVectors("read"), 6336); assert.equal(h.countVectors("bind"), 12672); assert.equal(h.countVectors("data"), 1);
});
test("policy batches reject empty ranges and invalid indices", () => {
  assert.throws(() => [...h.vectors("__proto__")], /unknown policy/);
  assert.throws(() => h.runBatch(() => true, "read", 0, 0), /invalid/);
  assert.throws(() => h.runBatch(() => true, "read", -1, 1), /invalid/);
  assert.throws(() => h.runBatch(() => true, "data", 1, 1), /empty/);
});
test("policy baseline capture refuses a throwing or mutating reference implementation", () => {
  assert.throws(() => h.runBatch(() => {throw new Error();}, "read", 0, 2, true), /baseline throws/);
  assert.throws(() => h.runBatch(p => {p.wsRole = "member"; return false;}, "read", 0, 2, true), /baseline mutates/);
  assert.doesNotThrow(() => h.runBatch(() => false, "read", 0, 2, true));
});
