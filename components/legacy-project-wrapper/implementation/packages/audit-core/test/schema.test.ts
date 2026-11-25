// The structured-output schema must be one the API accepts. On Nov 24 an enum on a nullable type list
// (type: ["string", "null"] with enum) was refused with a 400 at the first real call, after every local test passed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_JSON_SCHEMA } from "../src/prompt.ts";

function walk(node: unknown, path: string, out: string[]) {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.type) && Array.isArray(n.enum)) out.push(path);
  if (n.type === "object" && n.additionalProperties !== false) out.push(`${path} (object without additionalProperties: false)`);
  for (const [k, v] of Object.entries(n)) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${k}[${i}]`, out));
    else walk(v, `${path}.${k}`, out);
  }
}

test("no enum on a type list, and every object is closed", () => {
  const bad: string[] = [];
  walk(DRAFT_JSON_SCHEMA, "schema", bad);
  assert.deepEqual(bad, []);
});
