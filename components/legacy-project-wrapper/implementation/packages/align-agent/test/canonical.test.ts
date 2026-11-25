// RFC 8785 canonical JSON and the transfer digest (specs/align/transfer-authorization.md).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { CanonicalError, canonicalize, transferDigest } from "../src/canonical.ts";

test("RFC 8785 section 3.2.4 example canonicalizes exactly", () => {
  const input = JSON.parse(
    '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],' +
      '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}',
  );
  assert.equal(
    canonicalize(input),
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
  );
});

test("members sort by UTF-16 code units, not locale (RFC 8785 section 3.2.3 example)", () => {
  const input = JSON.parse('{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}');
  // Read the order off the canonical string itself: JSON.parse would move the integer-like key "1" to the front.
  const out = canonicalize(input);
  const expected = ["\r", "1", "\u0080", "ö", "€", "😀", "דּ"].map((k) => JSON.stringify(k) + ":");
  const positions = expected.map((k) => out.indexOf(k));
  assert.ok(positions.every((p) => p >= 0), out);
  assert.deepEqual(positions, [...positions].sort((x, y) => x - y));
});

test("key order and whitespace in the input never change the digest", () => {
  const a = { readers: ["u2", "u1"], text: "hello", hours: 24, purpose: "review" };
  const b = JSON.parse('{ "purpose": "review", "hours": 24.0, "text": "hello", "readers": ["u2","u1"] }');
  assert.equal(transferDigest(a), transferDigest(b));
  assert.equal(transferDigest(a), createHash("sha256").update(canonicalize(a)).digest("hex"));
  assert.match(transferDigest(a), /^[0-9a-f]{64}$/);
});

test("any change to what is sent changes the digest", () => {
  const base = { text: "hello", hours: 24 };
  assert.notEqual(transferDigest(base), transferDigest({ ...base, text: "hello " }));
  assert.notEqual(transferDigest(base), transferDigest({ ...base, hours: 25 }));
  assert.notEqual(transferDigest({ readers: ["a", "b"] }), transferDigest({ readers: ["b", "a"] })); // array order matters
});

test("values JSON cannot carry exactly are refused, not silently dropped", () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined, () => 1, 1n, Symbol("x")]) assert.throws(() => canonicalize(bad), CanonicalError);
  assert.throws(() => canonicalize({ a: undefined }), CanonicalError);
  assert.throws(() => canonicalize(new Date(0)), CanonicalError);
  assert.equal(canonicalize(-0), "0");
});
