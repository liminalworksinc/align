// Outcome per session for the local audit (release B, spec 2.9): did the work land? Read-only git, never a fetch,
// never a network call: "main" is origin/main as this machine last saw it.
//
// PORTED FROM liminal-desktop crates/operator-intel/src/git_activity.rs at commit 41af8850 (Rust to TypeScript,
// same logic): git_binary (find git without triggering the macOS Command Line Tools install prompt),
// canonical_repo_root (a worktree resolves to its main repo) and is_on_main. The per-session outcome below is new:
// the desktop module reports activity per repo, not per session.
//
// Local only: not exported from src/index.ts.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";

export type Outcome = "merged" | "committed" | "reverted" | "nothing_landed" | "unknown";

const isFile = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };

function macosDeveloperToolsAvailable(): boolean {
  if (process.platform !== "darwin") return true;
  try { execFileSync("/usr/bin/xcode-select", ["-p"], { stdio: "ignore", timeout: 5000 }); return true; } catch { return false; }
}

let cachedGit: string | null | undefined;
/** git_binary: LIMINAL_GIT_BIN, then known installs, then PATH (skipping /usr/bin/git when the developer tools are
 *  missing, which would open the install prompt). */
export function gitBinary(): string | null {
  if (cachedGit !== undefined) return cachedGit;
  const env = process.env.LIMINAL_GIT_BIN?.trim();
  if (env) return (cachedGit = env);
  const home = process.env.HOME ?? "";
  for (const p of [`${home}/.local/bin/git`, "/opt/homebrew/bin/git", "/usr/local/bin/git"]) if (isFile(p)) return (cachedGit = p);
  const tools = macosDeveloperToolsAvailable();
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const p = join(dir, "git");
    if (process.platform === "darwin" && p === "/usr/bin/git" && !tools) continue;
    if (isFile(p)) return (cachedGit = p);
  }
  return (cachedGit = tools ? "git" : null);
}

/** git: trimmed stdout, "" on any failure; stderr swallowed. Read-only callers only. */
export function git(repo: string, args: string[]): string {
  const bin = gitBinary();
  if (!bin) return "";
  try {
    return execFileSync(bin, ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

/** canonical_repo_root: the main repo of a worktree (its common .git dir's parent), else the toplevel. */
export function canonicalRepoRoot(anyPath: string): string | null {
  if (!existsSync(anyPath)) return null;
  const common = git(anyPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common && basename(common) === ".git") return dirname(common);
  const top = git(anyPath, ["rev-parse", "--show-toplevel"]);
  return top || null;
}

/** is_on_main: sha is an ancestor of origin/main. */
export function isOnMain(repo: string, sha: string): boolean {
  const bin = gitBinary();
  if (!bin) return false;
  try { execFileSync(bin, ["-C", repo, "merge-base", "--is-ancestor", sha, "origin/main"], { stdio: "ignore", timeout: 15_000 }); return true; } catch { return false; }
}

interface Commit { sha: string; at: number; subject: string; body: string }

function commitsBetween(repo: string, from: number, to: number, ref: string[]): Commit[] {
  const out = git(repo, ["log", ...ref, `--since=@${Math.floor(from / 1000)}`, `--until=@${Math.ceil(to / 1000)}`, "--no-merges", "--pretty=format:%H%x1f%ct%x1f%s%x1f%b%x1e"]);
  return out.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, ct, subject, body = ""] = r.split("\x1f");
    return { sha, at: Number(ct) * 1000, subject, body };
  });
}

/** How long after a session's last activity a commit still counts as its work. */
export const LAND_GRACE_MS = 2 * 3600_000;
/** How long after the session a revert, or a squash-merge onto main, is looked for. */
export const FOLLOW_UP_MS = 14 * 86_400_000;

export interface SessionOutcome { outcome: Outcome; repo: string | null; commits: number; note: string }

/** The outcome of one session from its cwd and time span. Commits by anyone in the repo during the session (plus a
 *  short grace) count as its work, so two sessions in one repo at once share commits: an estimate, said so. */
export function sessionOutcome(cwd: string | null, start: number, end: number): SessionOutcome {
  if (!cwd) return { outcome: "unknown", repo: null, commits: 0, note: "The session log records no working folder." };
  const repo = canonicalRepoRoot(cwd);
  if (!repo) return { outcome: "unknown", repo: null, commits: 0, note: "The session ran outside a git repository." };
  const mine = commitsBetween(repo, start, end + LAND_GRACE_MS, ["--all"]);
  if (!mine.length) return { outcome: "nothing_landed", repo: basename(repo), commits: 0, note: "No commit in this repository during the session or within two hours after it." };
  const later = commitsBetween(repo, start, end + FOLLOW_UP_MS, ["--all"]);
  const reverted = mine.some((c) => later.some((l) => l.sha !== c.sha && (l.body.includes(`This reverts commit ${c.sha}`) || l.subject === `Revert "${c.subject}"`)));
  if (reverted) return { outcome: "reverted", repo: basename(repo), commits: mine.length, note: "At least one commit from the session was reverted within 14 days." };
  // On main directly, or squash-merged: a commit on origin/main within 14 days whose subject starts with one of ours.
  const main = commitsBetween(repo, start, end + FOLLOW_UP_MS, ["origin/main"]);
  const merged = mine.some((c) => isOnMain(repo, c.sha) || main.some((m) => c.subject.length > 8 && m.subject.startsWith(c.subject)));
  return merged
    ? { outcome: "merged", repo: basename(repo), commits: mine.length, note: "Work from the session reached main (as this machine last fetched it)." }
    : { outcome: "committed", repo: basename(repo), commits: mine.length, note: "Committed, but not on main as this machine last fetched it." };
}
