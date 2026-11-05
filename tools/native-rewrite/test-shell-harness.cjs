const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./shell-harness.cjs");
test("shell observations cover syntax combinations, heredocs, malformed input and wrapper words", () => {
  assert(h.countVectors("parse") > 7000);
  assert(h.countVectors("words") > 1600);
  for (const op of h.REDIRS) assert(h.PARSE.some(s => s.includes(op)));
  for (const value of ["'two words'", '"unterminated', "__proto__", "echo $(echo) tail"]) {
    assert(h.PARSE.includes(value));
  }
  assert(h.PARSE.includes("cat <<A <<B; echo before\none\nA\ntwo\nB\necho after"));
  assert(h.PARSE.includes("> <<;"));
  assert(h.PARSE.includes("echo &>> <<-E target\nbody\nE\n"));
  assert(h.WORDS.some(a => a.join(" ") === "sudo env -- echo"));
});
test("shell observations detect mutation and exceptions without contaminating later batches", () => {
  const clean = words => words.length;
  const before = h.runBatch(clean, "words", 1, 5);
  const mutate = words => {const n = words.length; words.extra = undefined; return n;};
  assert.notDeepEqual(h.runBatch(mutate, "words", 1, 5), before);
  assert.deepEqual(h.runBatch(clean, "words", 1, 5), before);
  assert.throws(() => h.runBatch(mutate, "words", 1, 1, true), /mutates/);
  assert.throws(() => h.runBatch(() => {throw new Error("bad");}, "parse", 0, 1, true), /throws/);
  assert.notDeepEqual(h.runBatch(() => null, "parse", 0, 1), h.runBatch(() => undefined, "parse", 0, 1));
});
test("shell observations reject invalid, empty, unknown and excessive ranges", () => {
  for (const [op, start, limit] of [["parse", -1, 1], ["parse", 0, 0], ["words", 0.5, 1], ["__proto__", 0, 1], ["words", h.countVectors("words"), 1]]) {
    assert.throws(() => h.runBatch(() => [], op, start, limit));
  }
});
