import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { consumePermission, issuePermission, memoryPermissionStore, PERMISSION_TTL_MS } from "../src/consent.ts";
import { computeNumbers, normalizeRuns, parsePaste } from "../src/index.ts";
import { draftPayload } from "../src/prompt.ts";

const sign = (p: string) => createHmac("sha256", "test-secret").update(p).digest("base64url");
const TEXT = "the exact text shown in the preview";

test("a permission works once for the exact text it was issued for", async () => {
  const store = memoryPermissionStore();
  const { permission } = await issuePermission(TEXT, sign, store);
  assert.deepEqual(await consumePermission(permission, TEXT, sign, store), { ok: true });
  assert.deepEqual(await consumePermission(permission, TEXT, sign, store), { ok: false, reason: "used" });
});

test("no send without a permission, and junk is refused", async () => {
  const store = memoryPermissionStore();
  for (const p of [undefined, null, "", "alaud.", "alaud.x.y.z", "other.abc.def", 42]) {
    const r = await consumePermission(p, TEXT, sign, store);
    assert.equal(r.ok, false);
  }
});

test("changed text, a forged signature, and an expired permission are refused without consuming it", async () => {
  const store = memoryPermissionStore();
  const now = Date.now();
  const { permission } = await issuePermission(TEXT, sign, store, now);
  assert.deepEqual(await consumePermission(permission, TEXT + " and more", sign, store, now), { ok: false, reason: "text_changed" });
  const forged = permission.slice(0, -3) + (permission.endsWith("AAA") ? "BBB" : "AAA");
  assert.deepEqual(await consumePermission(forged, TEXT, sign, store, now), { ok: false, reason: "bad_signature" });
  assert.deepEqual(await consumePermission(permission, TEXT, sign, store, now + PERMISSION_TTL_MS + 1), { ok: false, reason: "expired" });
  // None of the refusals above used it up.
  assert.deepEqual(await consumePermission(permission, TEXT, sign, store, now), { ok: true });
});

test("after a restart (a fresh store) an issued permission is unknown and refused: fail closed, no replay", async () => {
  const before = memoryPermissionStore();
  const { permission } = await issuePermission(TEXT, sign, before);
  const after = memoryPermissionStore();
  assert.deepEqual(await consumePermission(permission, TEXT, sign, after), { ok: false, reason: "unknown" });
});

test("the drafting payload is stable byte for byte, so the preview and the send match", () => {
  const md = readFileSync(new URL("./fixtures/fixture-1-content-agent.md", import.meta.url), "utf8");
  const a = parsePaste(md);
  const b = parsePaste(md);
  const ra = normalizeRuns(a.runs);
  const rb = normalizeRuns(b.runs);
  const pa = draftPayload(ra, computeNumbers(ra), a.context);
  assert.equal(pa, draftPayload(rb, computeNumbers(rb), b.context));
  const j = JSON.parse(pa);
  assert.equal(j.runs.length, 10);
  assert.ok(j.placeholders.includes("top_count"));
  assert.doesNotMatch(pa, /"count"/); // the model is given no counts to copy
});
