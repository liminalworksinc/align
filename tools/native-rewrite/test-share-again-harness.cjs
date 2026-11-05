const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./share-again-harness.cjs");

test("share-again matrix covers all device states, optional arguments and opaque names", () => {
  assert.equal(h.countVectors("words"), 976);
  assert.equal(h.countVectors("text"), 91);
  assert.equal(h.countVectors("stopped"), 96);
  const words = [...h.vectors("words")];
  for (const a of [false, true]) for (const b of [false, true]) {
    assert(words.some(([d, who]) => d?.signed_out === a && d?.has_workspace === b && who === null));
  }
  assert(words.some(([d, who]) => d?.name === "__proto__" && who === ""));
  assert.deepEqual([...h.vectors("stopped")].slice(0, 6), [[null], [null, undefined], [null, {}], [null, {deleted: undefined}], [null, {deleted: false}], [null, {deleted: true}]]);
});
test("share-again observations detect input mutation and exceptions", () => {
  const clean = (...args) => args.length;
  const mutate = (...args) => { if (args[0]) args[0].name = "changed"; return args.length; };
  assert.notDeepEqual(h.runBatch(clean, "words", 1, 2), h.runBatch(mutate, "words", 1, 2));
  assert.throws(() => h.runBatch(mutate, "words", 1, 2, true), /mutates/);
  assert.throws(() => h.runBatch(() => {throw new Error("failed");}, "text", 0, 1, true), /throws/);
  assert.notDeepEqual(h.runBatch(() => "failed", "text", 0, 1), h.runBatch(() => {throw new Error("failed");}, "text", 0, 1));
  assert.notDeepEqual(h.encode({}), h.encode({extra: undefined}));
  assert.notDeepEqual(h.encode(undefined), h.encode(null));
  assert.throws(() => h.runBatch(d => {d.extra = undefined; return "same";}, "words", 1, 1, true), /mutates/);
  assert.throws(() => h.runBatch(parts => {parts.extra = undefined; return "same";}, "text", 0, 1, true), /mutates/);
});
test("share-again batches reject empty, unknown and out-of-range requests", () => {
  for (const [op, start, limit] of [["text", 0, 0], ["text", -1, 1], ["__proto__", 0, 1], ["stopped", 96, 1]]) {
    assert.throws(() => h.runBatch(() => "", op, start, limit));
  }
});
