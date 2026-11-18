import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { assertPortable, runParity } from "./fixtures/context-parity.mjs";

test("hook and budget cases return exactly the golden text and preserve its state writes", async (t) => {
  const file = new URL("./fixtures/context-parity.json", import.meta.url);
  assert.ok(fs.existsSync(file), "Missing hook parity golden: test/fixtures/context-parity.json. Regenerate using the command in test/fixtures/generate-context-parity.mjs and include the fixture with the test.");
  const golden = JSON.parse(fs.readFileSync(file, "utf8"));
  assertPortable(golden);
  assert.deepEqual(Object.keys(golden).sort(), ["cases", "sourceCommit", "timezone"]);
  assert.equal(golden.timezone, "UTC");
  for (const item of golden.cases) assert.deepEqual(Object.keys(item).sort(), ["error", "id", "name", "output", "states"]);
  const cases = await runParity(golden);
  t.diagnostic(`${cases.length} hook returns matched golden from ${golden.sourceCommit}`);
});

test("parity fixtures reject absolute paths and accept only named placeholders", () => {
  for (const value of ["/", "//host/share/file", "file:///etc/passwd", "\\Windows\\System32", "/etc/passwd", "notice: /home/someone/project", "C:\\Users\\someone", "\\\\host\\share", "<OTHER>/private/file"]) {
    assert.throws(() => assertPortable({ output: value }), /absolute path/);
  }
  assert.doesNotThrow(() => assertPortable({ output: '<CASE>/work and <ALIGN_HOME>/file; see https://example.test/help' }));
});
