// Rule discovery from the person's own words (spec 2.9, coordinator note Nov 24), and exact commit attribution.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { directives, discoverRules } from "../src/local/discover.ts";
import { ownCommitsOutcome } from "../src/local/outcomes.ts";
import type { Session } from "../src/local/read.ts";

const T0 = Date.parse("2026-11-20T10:00:00Z");
const turn = (m: number, text: string) => ({ text, detectText: text, ts: "", long: false, at: T0 + m * 60_000 });
const s = (id: string, ...texts: string[]): Session => ({ id, tool: "claude", project: "p", cwd: null, touched: [], ownCommits: [], turns: texts.map((t, i) => turn(Number(id.slice(1)) * 100 + i, t)), activity: [], usage: [] });

test("a recurring task is not a rule; a recurring prohibition is", () => {
  assert.equal(directives("check my emails please").length, 0);
  assert.equal(directives("Don't edit the lockfile by hand.").length, 1);
});

test("a rule phrased differently about different objects is found as one habit (verify before relying on it)", () => {
  const sessions = [
    s("s1", "start", "Verify that head at GitHub."),
    s("s2", "start", "verify whats unverified in the report"),
    s("s3", "start", "Before anything: verify the release on Fly."),
  ];
  const rules = discoverRules(sessions, () => false);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].label, "verify before relying on it");
  assert.equal(rules[0].sessions, 3);
});

test("near-identical rules group across sessions; fewer than three sessions is not a restated rule", () => {
  const three = [s("s1", "go", "Never use git stash in this repo."), s("s2", "go", "never use git stash here"), s("s3", "go", "Don't use git stash, ever.")];
  const r = discoverRules(three, () => false);
  assert.equal(r.length, 1);
  assert.equal(r[0].sessions, 3);
  assert.equal(discoverRules(three.slice(0, 2), () => false).length, 0);
});

test("a later correction that touches the rule is a break, counted separately from statements", () => {
  const sessions = [
    s("s1", "go", "Verify the numbers in the deck."),
    s("s2", "go", "Verify the release first."),
    s("s3", "go", "verify the PR head at GitHub", "did u check that? its unverified"),
  ];
  const rules = discoverRules(sessions, (id, i) => id === "s3" && i === 2);
  assert.equal(rules[0].statements, 3);
  assert.equal(rules[0].laterBreaks, 1);
  assert.deepEqual(rules[0].breakSessions, ["s3"]);
});

test("exact attribution: a commit the session printed is found and classified", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-own-"));
  try {
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env }).trim();
    g(["init", "-q", "-b", "main"]);
    writeFileSync(join(dir, "a"), "a");
    g(["add", "-A"]);
    g(["commit", "-q", "-m", "Add the audit page"]);
    const sha = g(["rev-parse", "HEAD"]);
    g(["update-ref", "refs/remotes/origin/main", sha]);
    const o = ownCommitsOutcome([sha.slice(0, 8)], [dir], Date.now() - 3600_000, Date.now());
    assert.equal(o?.outcome, "merged");
    assert.match(o?.note ?? "", /exact/);
    assert.equal(ownCommitsOutcome(["deadbeef"], [dir], 0, Date.now()), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
