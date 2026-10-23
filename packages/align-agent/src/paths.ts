import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultAlignHome, layout } from "./shared/layout.ts";
import { ensureDir } from "./shared/fsx.ts";

export interface Paths {
  home: string;
  alignHome: string;
  claudeDir: string;
  claudeJson: string;
  codexHome: string;
  launchAgents: string;
}

/** Every location is overridable so tests and dry runs never touch the user's real config. */
export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.HOME || os.homedir();
  const henv = { ...env, HOME: home };
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  return {
    home,
    alignHome: env.ALIGN_HOME || defaultAlignHome(henv),
    claudeDir,
    claudeJson: env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, ".claude.json") : path.join(home, ".claude.json"),
    codexHome: env.CODEX_HOME || path.join(home, ".codex"),
    launchAgents: env.ALIGN_LAUNCH_AGENTS_DIR || path.join(home, "Library", "LaunchAgents"),
  };
}

export class HomeError extends Error {}

/** Create ALIGN_HOME 0700 and refuse to use one owned by someone else. */
export function ensureHome(alignHome: string): void {
  if (!fs.existsSync(alignHome)) fs.mkdirSync(alignHome, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(alignHome);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new HomeError(`${alignHome} is not a directory`);
  if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
    throw new HomeError(`${alignHome} is not owned by the current user; refusing to use it`);
  }
  if ((st.mode & 0o077) !== 0) fs.chmodSync(alignHome, 0o700);
  for (const d of [layout.hotDir(alignHome), layout.injectedDir(alignHome), layout.latchDir(alignHome), layout.spool(alignHome), layout.feeds(alignHome), layout.logs(alignHome)]) {
    ensureDir(d);
  }
}
