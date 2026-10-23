// Local-only goal anchor matching. Repo and branch never leave the machine. Hook-safe: reads .git with node:fs only.
import fs from "node:fs";
import path from "node:path";
import type { Goal } from "./types.ts";

export interface GitInfo {
  toplevel: string;
  name: string;
  branch: string | null;
  remotes: string[]; // "owner/name" forms parsed from remote URLs
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Walk up from cwd to the first directory holding .git (dir or worktree file). No git binary. */
export function gitInfo(cwd: string, maxDepth = 40): GitInfo | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < maxDepth; i++) {
    const dotgit = path.join(dir, ".git");
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(dotgit);
    } catch {
      st = null;
    }
    if (st) {
      let gitDir = dotgit;
      if (st.isFile()) {
        const m = /^gitdir:\s*(.+)\s*$/m.exec(readText(dotgit) || "");
        if (!m) return null;
        gitDir = path.resolve(dir, m[1].trim());
      }
      const head = readText(path.join(gitDir, "HEAD")) || "";
      const ref = /^ref:\s*refs\/heads\/(.+)\s*$/m.exec(head);
      // Worktrees keep config in the common dir.
      const common = readText(path.join(gitDir, "commondir"));
      const commonDir = common ? path.resolve(gitDir, common.trim()) : gitDir;
      const config = readText(path.join(commonDir, "config")) || "";
      const remotes: string[] = [];
      for (const m of config.matchAll(/^\s*url\s*=\s*(.+)$/gm)) {
        const slug = repoSlug(m[1].trim());
        if (slug) remotes.push(slug);
      }
      return { toplevel: dir, name: path.basename(dir), branch: ref ? ref[1].trim() : null, remotes };
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function repoSlug(url: string): string | null {
  const m = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
  return new RegExp(`^${esc.replace(/\u0000/g, ".*")}$`);
}

export function repoMatches(anchor: string, info: GitInfo): boolean {
  const a = anchor.trim().toLowerCase().replace(/\.git$/, "");
  if (!a) return false;
  const slug = repoSlug(a) || a;
  if (info.remotes.includes(slug)) return true;
  if (!a.includes("/") && info.name.toLowerCase() === a) return true;
  return info.remotes.some((r) => r.endsWith(`/${a}`));
}

export function branchMatches(pattern: string, branch: string | null): boolean {
  if (!branch || !pattern) return false;
  try {
    return globToRegex(pattern.trim()).test(branch);
  } catch {
    return false;
  }
}

/** Goals whose anchors match this repo (and branch pattern when the goal has any). Bindable goals only. */
export function matchAnchors(goals: Goal[], info: GitInfo): Goal[] {
  return goals.filter((g) => {
    if (!g.bindable || g.status !== "active") return false;
    const repos = g.anchors?.repos || [];
    const branches = g.anchors?.branch_patterns || [];
    const repoOk = repos.length ? repos.some((r) => repoMatches(r, info)) : false;
    const branchOk = branches.length ? branches.some((p) => branchMatches(p, info.branch)) : false;
    if (repos.length && branches.length) return repoOk && branchOk;
    return repoOk || branchOk;
  });
}
