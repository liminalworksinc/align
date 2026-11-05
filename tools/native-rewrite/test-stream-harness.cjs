const test = require("node:test"), assert = require("node:assert/strict");
const {encode, evaluate} = require("./stream-harness.cjs");

test("observations distinguish JavaScript values that JSON normally conflates", () => {
  const values = [null, undefined, NaN, 0, -0, Infinity, -Infinity, "NaN",
    {$number: "NaN"}, ["number", "NaN"], {}, {missing: undefined}, []];
  const observations = values.map(v => JSON.stringify(encode(v)));
  assert.equal(new Set(observations).size, values.length);
});

test("object key order is immaterial while array order remains observable", () => {
  assert.deepEqual(encode({a: 1, b: 2}), encode({b: 2, a: 1}));
  assert.notDeepEqual(encode([1, 2]), encode([2, 1]));
});

test("trace snapshots survive later mutation and reload state after each line", () => {
  const references = new Set();
  const trace = evaluate(["claude_trace", "file", ["one", "two", "three"]], {
    init_claude_state: () => ({n: 0}),
    parse_claude_line: (line, state) => {
      assert.ok(!references.has(state));
      references.add(state);
      return [{n: ++state.n}];
    },
  });
  assert.equal(trace.initial.n, 0);
  assert.deepEqual(trace.steps.map(s => s.state.n), [1, 2, 3]);
  assert.deepEqual(trace.steps.map(s => s.events[0].n), [1, 2, 3]);
});

test("equal event arrays cannot hide a missing state mutation", () => {
  const args = ["parse_codex_line", "line", {has_tur: false}];
  const good = evaluate(structuredClone(args), {parse_codex_line: (_, st) => {st.has_tur = true; return [];}});
  const bad = evaluate(structuredClone(args), {parse_codex_line: () => []});
  assert.notDeepEqual(encode(good), encode(bad));
});
