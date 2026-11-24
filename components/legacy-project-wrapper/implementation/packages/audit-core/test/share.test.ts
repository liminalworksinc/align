// The shareable local-audit file (spec 2.10): only code labels leave, a file carrying the person's words is refused,
// and the bundled single file builds.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FAMILIES, type DiscoveredRule } from "../src/local/discover.ts";
import type { Measures } from "../src/local/measures.ts";
import { SHARED_AIM, allowedStrings, freeTextFindings, pickTarget, sharePayload } from "../src/local/payload.ts";
import { RULE_LABELS } from "../src/local/rules.ts";
import { readShared, routeHosted } from "../../../scripts/local-audit-report.mts";

const verify: DiscoveredRule = { label: "verify before relying on it", known: true, statements: 30, sessions: 14, laterBreaks: 1, breakSessions: [] };
const mine: DiscoveredRule = { label: "Don't edit .literate or", known: false, statements: 4, sessions: 4, laterBreaks: 0, breakSessions: [] };
const m = {
  sessions: 3, corrections: 4, byCategory: { style: 0, facts: 1, redo: 2, scope: 1, other: 0 }, cost: { minutes: 9, correctionsCounted: 4 },
  rules: [], byWeek: [], outcomes: [{ outcome: "merged", sessions: 3, corrections: 4, perSession: 1.3 }],
  byProject: [{ project: "acme-secret-merger", sessions: 3, corrections: 4, perSession: 1.3 }],
} as unknown as Measures;
const allowed = allowedStrings([...Object.values(RULE_LABELS), ...FAMILIES.map((f) => f.label)]);

test("the shareable payload carries a fixed aim and no project folder names", () => {
  const p = sharePayload(m, [verify, mine], pickTarget([verify, mine], [])!, { files: 1, mentions: 2 });
  assert.ok(!p.includes("acme"));
  assert.equal(JSON.parse(p).aim, SHARED_AIM);
  assert.deepEqual(freeTextFindings(p, allowed, { discoveredLabels: [mine.label], turnTexts: ["Don't edit .literate or the receipts, ever."] }), []);
});

test("free text is caught three ways: an unknown string, a discovered rule's wording, a sentence of a prompt", () => {
  const p = JSON.parse(sharePayload(m, [verify], pickTarget([verify], [])!, { files: 0, mentions: 0 }));
  p.target.rule = "Don't edit .literate or";
  const f = freeTextFindings(JSON.stringify(p), allowed, { discoveredLabels: [mine.label], turnTexts: [] });
  assert.ok(f.some((x) => /not a code label/.test(x)));
  assert.ok(f.some((x) => /own words/.test(x)));
  const q = JSON.parse(sharePayload(m, [verify], pickTarget([verify], [])!, { files: 0, mentions: 0 }));
  q.note = "please ship the merger deck to the board tonight";
  assert.ok(freeTextFindings(JSON.stringify(q), () => true, { discoveredLabels: [], turnTexts: ["Please ship the merger deck to the board tonight."] }).some((x) => /prompts/.test(x)));
});

test("route (a) refuses a tampered file; route (b) refuses until the hosted decisions are made", () => {
  const good = { format: "liminal-local-audit/1", payload: JSON.parse(sharePayload(m, [verify], pickTarget([verify], [])!, { files: 0, mentions: 0 })) };
  assert.ok("payload" in readShared(JSON.stringify(good)));
  const bad = structuredClone(good);
  bad.payload.aim = "my secret plan for the acquisition";
  assert.ok("refused" in readShared(JSON.stringify(bad)));
  assert.ok("refused" in readShared('{"format":"other"}'));
  assert.throws(() => routeHosted(), /not enabled/);
});

test("the single-file bundle builds and imports no network module", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-bundle-"));
  try {
    const out = join(dir, "liminal-audit.mjs");
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/bundle-local-audit.mjs", import.meta.url)), out], { stdio: "ignore" });
    const imports = readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("import "));
    assert.deepEqual(imports.map((l) => l.match(/"([^"]+)"/)![1]).sort(), ["node:child_process", "node:crypto", "node:fs", "node:os", "node:path"]);
    execFileSync(process.execPath, ["--check", out]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
