// Session outcomes over a throwaway git repo (no network: origin/main is set with update-ref).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalRepoRoot, sessionOutcome } from "../src/local/outcomes.ts";

const H = 3600_000;
const T0 = Date.parse("2026-11-20T10:00:00Z");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "audit-git-"));
  const g = (args: string[], at?: number) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", ...(at ? { GIT_AUTHOR_DATE: `@${at / 1000} +0000`, GIT_COMMITTER_DATE: `@${at / 1000} +0000` } : {}) },
    }).trim();
  g(["init", "-q", "-b", "main"]);
  const commit = (subject: string, at: number, body = "") => {
    writeFileSync(join(dir, `f${at}`), subject);
    g(["add", "-A"]);
    g(["commit", "-q", "-m", body ? `${subject}\n\n${body}` : subject], at);
    return g(["rev-parse", "HEAD"]);
  };
  const base = commit("base", T0 - 48 * H);
  return { dir, g, commit, base };
}

test("no working folder or no repo: unknown", () => {
  assert.equal(sessionOutcome(null, T0, T0 + H).outcome, "unknown");
  const plain = mkdtempSync(join(tmpdir(), "audit-plain-"));
  try { assert.equal(sessionOutcome(plain, T0, T0 + H).outcome, "unknown"); } finally { rmSync(plain, { recursive: true, force: true }); }
});

test("nothing committed during the session: nothing landed", () => {
  const r = repo();
  try {
    r.g(["update-ref", "refs/remotes/origin/main", r.base]);
    assert.equal(sessionOutcome(r.dir, T0, T0 + H).outcome, "nothing_landed");
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("committed on a branch, not on main: committed; then on main: merged", () => {
  const r = repo();
  try {
    r.g(["update-ref", "refs/remotes/origin/main", r.base]);
    const sha = r.commit("Add the audit page", T0 + 0.5 * H);
    assert.equal(sessionOutcome(r.dir, T0, T0 + H).outcome, "committed");
    r.g(["update-ref", "refs/remotes/origin/main", sha]);
    assert.equal(sessionOutcome(r.dir, T0, T0 + H).outcome, "merged");
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("a commit reverted within 14 days: reverted", () => {
  const r = repo();
  try {
    r.g(["update-ref", "refs/remotes/origin/main", r.base]);
    const sha = r.commit("Add the audit page", T0 + 0.5 * H);
    r.commit('Revert "Add the audit page"', T0 + 30 * H, `This reverts commit ${sha}.`);
    assert.equal(sessionOutcome(r.dir, T0, T0 + H).outcome, "reverted");
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("a worktree resolves to its main repository", () => {
  const r = repo();
  const wt = join(tmpdir(), `audit-wt-${Date.now()}`);
  try {
    r.g(["worktree", "add", "-q", wt, "-b", "side"]);
    assert.equal(canonicalRepoRoot(wt), canonicalRepoRoot(r.dir));
  } finally {
    rmSync(wt, { recursive: true, force: true });
    rmSync(r.dir, { recursive: true, force: true });
  }
});
