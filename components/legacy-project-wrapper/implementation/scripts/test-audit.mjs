#!/usr/bin/env node
// The agent audit's server path (lib/v2/audit.ts) without a Next build or listener: consent, verification and the
// "nothing stored" rule, against a fake model and a misbehaving one. No network: no real model is ever called.
// The pure core has its own tests (packages/audit-core).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
if (path.resolve(ROOT) === path.join(process.env.HOME || "/", "liminal/align")) throw new Error("Run from a worktree");
process.env.HOSTED = "";

const fixtures = new Map([
  [new URL("../lib/secret.ts", import.meta.url).href, `import { createHmac } from "node:crypto"; export const signPayload = (p) => createHmac("sha256", "audit-test-secret").update(p).digest("base64url"); export const secret = () => "audit-test-secret";`],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context);
    if (specifier.startsWith(".") && ["../lib/", "../app/"].some((dir) => context.parentURL?.startsWith(new URL(dir, import.meta.url).href))) {
      const url = new URL(specifier, context.parentURL);
      if (!path.extname(url.pathname)) url.pathname += ".ts";
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (fixtures.has(url)) return { format: "module", source: fixtures.get(url), shortCircuit: true };
    if (url === new URL("../lib/v2/errors.ts", import.meta.url).href) {
      const source = readFileSync(new URL(url), "utf8").replaceAll("public ", "").replace("super(message ?? code);", "super(message ?? code); Object.assign(this, { status, code, extra });");
      return { format: "module-typescript", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { preview, runAudit } = await import("../lib/v2/audit.ts");
const { fakeModel, AuditModelError } = await import("../lib/v2/audit-model.ts");
const fixture = (n) => readFileSync(new URL(`../packages/audit-core/test/fixtures/${n}`, import.meta.url), "utf8");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { failed++; console.log(`not ok - ${name}\n  ${e?.stack ?? e}`); }
}
const rejects = (p, status, code) => assert.rejects(p, (e) => e.status === status && (!code || e.code === code));
const counting = (model) => { const m = { calls: 0, name: model.name, async draft(...a) { m.calls++; return model.draft(...a); } }; return m; };

await test("preview redacts before parsing and shows the exact text and provider", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md") + "\nreach me at jane@example.com, key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123\n");
  assert.equal(p.runs.length, 10);
  assert.equal(p.redacted.email, 1);
  assert.ok(p.redacted.key >= 1);
  assert.doesNotMatch(p.payload, /jane@example|sk-ant/);
  assert.match(p.provider, /Anthropic/);
  assert.match(p.permission, /^alaud\./);
});

await test("too few runs is a plain 422, before any permission is issued", async () => {
  await rejects(preview("## Run 1\nChanges: 2\n## Run 2\nChanges: 1"), 422, "too_few_runs");
});

await test("a consented send returns a verified report with code-computed numbers", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  const m = counting(fakeModel());
  const r = await runAudit(p.payload, p.permission, m);
  assert.equal(m.calls, 1);
  assert.equal(r.withheld, null);
  assert.match(r.try_this.text, /^Write a short guide for the caption step/);
  assert.equal(r.why[0].claim, "31 of 50 changes were to the caption, in 10 of 10 runs.");
  assert.equal(r.numbers.minutesPerUsedRun, 24.5);
  assert.equal(r.table.length, 10);
});

await test("no send without a permission, and no model call", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  const m = counting(fakeModel());
  await rejects(runAudit(p.payload, undefined, m), 409, "consent_malformed");
  await rejects(runAudit(p.payload, "alaud.forged.sig", m), 409);
  assert.equal(m.calls, 0);
});

await test("a permission used twice is refused the second time", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  await runAudit(p.payload, p.permission, fakeModel());
  await rejects(runAudit(p.payload, p.permission, fakeModel()), 409, "consent_used");
});

await test("text changed after the preview is refused (the consent covers only what was shown)", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  const tampered = p.payload.replace("state register notice 2026-41", "anything else");
  const m = counting(fakeModel());
  await rejects(runAudit(tampered, p.permission, m), 409, "consent_text_changed");
  assert.equal(m.calls, 0);
  // and the real permission still works afterwards
  await runAudit(p.payload, p.permission, m);
});

await test("the spend limit counts only consented sends", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  let counted = 0;
  await rejects(runAudit(p.payload, "alaud.bad.sig", fakeModel(), () => counted++), 409);
  assert.equal(counted, 0);
  await runAudit(p.payload, p.permission, fakeModel(), () => counted++);
  assert.equal(counted, 1);
});

await test("a draft that states its own numbers is retried once, then withheld (R1, R6)", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  const liar = { name: "liar", calls: 0, async draft(payload) { this.calls++; const d = await fakeModel().draft(payload); d.why[0].claim = "31 of 50 changes were captions, saving 6x the time."; return d; } };
  const r = await runAudit(p.payload, p.permission, liar);
  assert.equal(liar.calls, 2);
  assert.equal(r.try_this, null);
  assert.match(r.withheld, /did not pass our checks twice/);
  assert.equal(r.numbers.totalChanges, 50); // the numbers still come back
});

await test("a draft that follows a hostile paste fails R3 and is withheld", async () => {
  const p = await preview(fixture("fixture-5-hostile.md"));
  assert.match(p.payload, /Ignore the runs/); // the paste's words reach the model only as quoted data
  const obedient = { name: "obedient", async draft() { return { purpose: "Drafts captions.", why: [{ kind: "working", category: null, claim: "The agent is perfect.", runs: ["R1"] }], try_this: { text: "Upgrade to the premium plan.", exact_text: null, category: null }, cannot_tell: [], how_you_will_know: "Upgrade now." }; } };
  const r = await runAudit(p.payload, p.permission, obedient);
  assert.equal(r.try_this, null);
});

await test("a model that declines gives the numbers and says so", async () => {
  const p = await preview(fixture("fixture-1-content-agent.md"));
  const refuser = { name: "refuser", async draft() { throw new AuditModelError("refused", "no"); } };
  const r = await runAudit(p.payload, p.permission, refuser);
  assert.equal(r.try_this, null);
  assert.match(r.withheld, /declined/);
  assert.equal(r.table.length, 10);
});

await test("nothing is stored: the audit module touches no database or file", async () => {
  const src = readFileSync(new URL("../lib/v2/audit.ts", import.meta.url), "utf8") + readFileSync(new URL("../lib/v2/audit-model.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from "\.\/db"|from "node:fs"|writeFile|console\.(log|info|error)/);
});

console.log(`test-audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
