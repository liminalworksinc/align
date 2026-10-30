// Folder share rules: "every session started under this folder is shared to this workspace and goal".
// Local only: the folder path never leaves the machine (the server sees the keyed repo hash, as for any share).
// Hook-safe: node:fs and node:path only.
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "./fsx.ts";

export interface FolderRule {
  dir: string; // realpath
  workspace_id: string;
  workspace_name: string;
  goal_id: string | null;
  goal_title: string | null;
  /** Share work signals (repo-relative paths, commit subjects, task labels) with people who can read the goal. */
  signals?: boolean;
  created_at: string;
}

interface RulesFile {
  v: 1;
  rules: FolderRule[];
}

export const rulesPath = (home: string): string => path.join(home, "rules.json");

export function realDir(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

export function readRules(home: string): FolderRule[] {
  const f = readJson<RulesFile>(rulesPath(home));
  return f && Array.isArray(f.rules) ? f.rules : [];
}

function writeRules(home: string, rules: FolderRule[]): void {
  writeJsonAtomic(rulesPath(home), { v: 1, rules } satisfies RulesFile);
}

/** Add or replace the rule for `dir`. Returns the stored rule. */
export function setRule(home: string, rule: Omit<FolderRule, "dir" | "created_at"> & { dir: string }): FolderRule {
  const dir = realDir(rule.dir);
  const stored: FolderRule = { ...rule, dir, created_at: new Date().toISOString() };
  writeRules(home, [...readRules(home).filter((r) => r.dir !== dir), stored]);
  return stored;
}

/** Remove the rule that governs `dir` (the exact folder or its nearest ancestor). Returns the removed rule. */
export function removeRule(home: string, dir: string): FolderRule | null {
  const hit = matchRule(readRules(home), dir);
  if (!hit) return null;
  writeRules(home, readRules(home).filter((r) => r.dir !== hit.dir));
  return hit;
}

/** The most specific rule whose folder is `cwd` or an ancestor of it. */
export function matchRule(rules: FolderRule[], cwd: string | null): FolderRule | null {
  if (!cwd || !rules.length) return null;
  const want = realDir(cwd);
  let best: FolderRule | null = null;
  for (const r of rules) {
    if (want === r.dir || want.startsWith(r.dir.endsWith(path.sep) ? r.dir : r.dir + path.sep)) {
      if (!best || r.dir.length > best.dir.length) best = r;
    }
  }
  return best;
}
