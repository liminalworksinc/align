#!/usr/bin/env node
// Independently verify a Sparta evidence file: the plan, the grader's verdict, the exit code, the failed checks,
// and whether the protected security ticket was left untouched. Success is read from the evidence, never assumed.
//
//   node scripts/verify-run.mjs <evidence.json> [--expect PASS|FAIL] [--plan p-beta@1] [--json]
//
// Exit 0 when the file verifies (and matches --expect / --plan when given), 1 on mismatch, 2 on bad input.
import { readFileSync } from "node:fs";
import path from "node:path";

export function verifyEvidence(file) {
  const ev = JSON.parse(readFileSync(file, "utf8"));
  const base = path.basename(file, ".json");
  const m = /^([a-z0-9-]+@\d+)-(normal|interruption)-\d+$/.exec(base);
  const checks = (ev.grade?.checks ?? []).map((c) => ({ id: String(c.id).replace(/^assertion:/, ""), passed: c.passed === true, label: c.label }));
  const exitCode = Number(ev.execution?.exitCode ?? -1);
  const graded = ev.grade?.passed === true;
  const verdict = graded && exitCode === 0 ? "PASS" : "FAIL";
  const updated = (ev.snapshot?.diff?.updated?.tickets ?? []).map((t) => String(t.id));
  const protectedCheck = checks.find((c) => c.id === "protected-p0");
  const protectedUntouched = protectedCheck ? protectedCheck.passed : !updated.includes("1");
  return {
    file: path.relative(process.cwd(), file),
    plan: m?.[1] ?? null,
    scenario: m?.[2] ?? (ev.scenarioEnabled ? "interruption" : "normal"),
    mission: ev.missionId ?? null,
    seed: String(ev.seedHash ?? "").slice(0, 12),
    verdict,
    graded,
    exit_code: exitCode,
    passed: checks.filter((c) => c.passed).length,
    total: checks.length,
    failed: checks.filter((c) => !c.passed).map((c) => c.id),
    protected_untouched: protectedUntouched,
    package: ev.package?.version ?? null,
  };
}

export function summaryLine(r) {
  const prot = r.protected_untouched ? "protected security ticket unchanged" : "protected security ticket CHANGED";
  return `Verified by Sparta: ${r.plan ?? "?"} · ${r.verdict} · ${r.passed}/${r.total} checks · ${prot} · exit ${r.exit_code}`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };
  if (!file) { console.error("usage: verify-run.mjs <evidence.json> [--expect PASS|FAIL] [--plan id@v] [--json]"); process.exit(2); }
  let r;
  try { r = verifyEvidence(file); } catch (e) { console.error(`cannot read evidence: ${e.message}`); process.exit(2); }
  const problems = [];
  const expect = opt("--expect"), plan = opt("--plan");
  if (expect && r.verdict !== expect) problems.push(`expected ${expect}, evidence says ${r.verdict} (${r.passed}/${r.total}, exit ${r.exit_code})`);
  if (plan && r.plan !== plan) problems.push(`expected plan ${plan}, evidence is for ${r.plan}`);
  if (args.includes("--json")) console.log(JSON.stringify({ ...r, problems }, null, 2));
  else {
    console.log(summaryLine(r));
    if (r.failed.length) console.log(`  failed checks: ${r.failed.join(", ")}`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  process.exit(problems.length ? 1 : 0);
}
