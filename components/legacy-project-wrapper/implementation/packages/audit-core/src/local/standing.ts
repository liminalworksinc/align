// Whether the target rule is already written in the instruction files the person's agents load (read locally; only
// counts are ever shared). The global Claude Code file plus CLAUDE.md / AGENTS.md / meta/SHARED_CONTEXT.md at the root
// of each repository the sessions worked in.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { canonicalRepoRoot } from "./outcomes.ts";
import { standingMentions, type Standing, type Target } from "./payload.ts";
import type { Session } from "./read.ts";

export function standingFor(target: Target, sessions: Session[], home = homedir()): Standing {
  const files = new Set<string>([`${home}/.claude/CLAUDE.md`]);
  for (const s of sessions) for (const p of [s.cwd, ...s.touched]) {
    if (!p) continue;
    const root = canonicalRepoRoot(p) ?? p;
    for (const f of ["CLAUDE.md", "AGENTS.md", "meta/SHARED_CONTEXT.md"]) files.add(`${root}/${f}`);
  }
  const out: Standing = { files: 0, mentions: 0 };
  for (const f of files) {
    if (!existsSync(f)) continue;
    let text = "";
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    const n = standingMentions(target, text);
    if (n) { out.files++; out.mentions += n; }
  }
  return out;
}
