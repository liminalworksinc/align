// Liminal local audit: the one command an outside person runs (spec 2.10; founder ruling Nov 24, wave 1 offers the
// local report to people who use a coding agent). No Align account, no network call, read-only.
//
//   node liminal-audit.mjs            (the bundled single file; build with scripts/bundle-local-audit.mjs)
//   node liminal-audit.mjs --days 14  (default 30)
//
// It reads the coding-agent session logs on this machine (~/.claude/projects, ~/.codex/sessions), and git, read-only,
// in the repositories those sessions worked in. It writes ONE file holding exactly what would leave this machine if the
// person chose to share it: counts and labels the code wrote, never their own words. Before writing, it checks the file
// for any free text from the person and refuses to write if it finds any. Nothing is sent by this command.

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FAMILIES, discoverRules } from "../src/local/discover.ts";
import { corrections, measure } from "../src/local/measures.ts";
import { sessionOutcomeAcross } from "../src/local/outcomes.ts";
import { DISCOVERY_CAVEAT, allowedStrings, freeTextFindings, pickTarget, reportLines, sharePayload } from "../src/local/payload.ts";
import { readSessions } from "../src/local/read.ts";
import { RULE_LABELS } from "../src/local/rules.ts";
import { standingFor } from "../src/local/standing.ts";

const argv = process.argv.slice(2);
const days = Number(argv[argv.indexOf("--days") + 1]) || 30;
const outDir = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : homedir();

const { sessions, diagnostics } = readSessions({ days });
if (!sessions.length) {
  console.log(`No coding-agent sessions found in the last ${days} days (looked in ~/.claude/projects and ~/.codex/sessions). Nothing written.`);
  process.exit(0);
}
const reposRead = new Set<string>();
const m = measure(sessions, (s) => {
  const o = sessionOutcomeAcross(s.cwd, s.touched, s.turns[0].at, s.activity.at(-1) ?? s.turns.at(-1)!.at, s.ownCommits);
  for (const r of (o.repo ?? "").split(", ").filter(Boolean)) reposRead.add(r);
  return o.outcome;
});

// What this run read and skipped, so the person can see it stayed on their machine.
const skipped = Object.entries(diagnostics.skipped).filter(([, n]) => n > 0).map(([why, n]) => `${n} ${why.replace(/_/g, " ")}`);
console.log(`\nWhat this read (on this computer only; no network connection was made):`);
console.log(`- Session logs in ~/.claude/projects and ~/.codex/sessions from the last ${days} days: ${diagnostics.filesSeen} files looked at, ${diagnostics.sessionsRead} sessions read.`);
console.log(`- Skipped: ${skipped.length ? skipped.join(", ") : "none"}.${diagnostics.malformedLines ? ` ${diagnostics.malformedLines} unreadable lines ignored.` : ""}`);
console.log(`- Git history, read-only, in ${reposRead.size} ${reposRead.size === 1 ? "repository" : "repositories"} those sessions worked in. Nothing was changed or fetched.`);
console.log(`- Your agent instruction files (CLAUDE.md, AGENTS.md), only to count whether a rule is already written there.`);
const corr = new Set<string>();
for (const s of sessions) for (const c of corrections(s)) corr.add(`${s.id}:${c.index}`);
const discovered = discoverRules(sessions, (id, i) => corr.has(`${id}:${i}`));
const target = pickTarget(discovered, m.rules);

// What the person sees on their own screen: the full local report, their own words included (it never leaves).
console.log(`\nYour last ${days} days: ${diagnostics.sessionsRead} sessions read.\n`);
for (const l of reportLines(m, discovered, target)) console.log(`- ${l}`);

if (!target) {
  console.log(`\nNo rule stands out, so there is nothing to recommend and nothing to share. Nothing written.\n${DISCOVERY_CAVEAT}`);
  process.exit(0);
}

const payload = JSON.parse(sharePayload(m, discovered, target, standingFor(target, sessions)));
const file = {
  format: "liminal-local-audit/1",
  what_this_is: "Counts and labels from your coding-agent sessions, computed on your machine. Your own words are not in this file. If you send it, this is everything that is sent.",
  payload,
};
const serialized = JSON.stringify(file, null, 2);

// The check: fail the run rather than write a file that carries the person's words.
const allowed = allowedStrings([...Object.values(RULE_LABELS), ...FAMILIES.map((f) => f.label)]);
const findings = freeTextFindings(JSON.stringify(payload), allowed, {
  discoveredLabels: discovered.filter((r) => !r.known).map((r) => r.label),
  turnTexts: sessions.flatMap((s) => s.turns.map((t) => t.text)),
});
const headerFindings = freeTextFindings(serialized, () => true, {
  discoveredLabels: discovered.filter((r) => !r.known).map((r) => r.label),
  turnTexts: sessions.flatMap((s) => s.turns.map((t) => t.text)),
});
if (findings.length || headerFindings.length) {
  console.error("\nStopped: the shareable file would contain text from you. Nothing was written.");
  for (const f of [...findings, ...headerFindings]) console.error(`- ${f}`);
  process.exit(2);
}

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // local date, as the person sees it
const path = join(outDir, `liminal-audit-${stamp}.json`);
writeFileSync(path, serialized + "\n");
console.log(`\n${DISCOVERY_CAVEAT}`);
console.log(`\nWrote ${path}`);
console.log("It holds only counts and labels the code wrote. Open it to see everything that would be shared. Nothing has been sent.");
console.log(`To delete it: rm "${path}"`);
