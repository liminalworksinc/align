// Which build of the agent a folder holds (`build.json`, written by scripts/postbuild.mjs), so the terminal `align` can
// say when the hooks run another build from ALIGN_HOME/bin/current: both report the same version, and an older build
// there can write notices or word denies this one never would (E2E-AGENT cycle 13 C13-1).
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";
import { VERSION } from "./version.ts";

export interface BuildId {
  version: string;
  build: string;
  /** `WRITER_GEN` of the build (absent before cycle 14). */
  gen?: number;
}

export function buildOf(dir: string): BuildId | null {
  const b = readJson<BuildId>(path.join(dir, "build.json"));
  return b && typeof b.build === "string" && typeof b.version === "string" ? b : null;
}

const real = (p: string): string | null => {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
};

/**
 * The hooks' build when it differs from this command's (`self`: the folder this `align` runs from), or "unknown" for a
 * copy from before builds were recorded; null when they match, when the hooks run from this very folder, when nothing is
 * installed, or when this command's own build is not recorded (run from source).
 */
export function hooksBuildDiffers(alignHome: string, self: string): BuildId | "unknown" | null {
  const current = path.join(alignHome, "bin", "current");
  const cur = real(current);
  if (!cur || !fs.existsSync(layout.install(alignHome)) || cur === real(self)) return null;
  const mine = buildOf(self);
  if (!mine) return null;
  const theirs = buildOf(cur);
  if (!theirs) return "unknown";
  return theirs.build === mine.build && theirs.version === mine.version ? null : theirs;
}

/** The warning for a divergence `hooksBuildDiffers` found. */
export function hooksBuildWords(theirs: BuildId | "unknown", mine: BuildId | null): string {
  const t = theirs === "unknown" ? "an earlier build" : `${theirs.version} build ${theirs.build}`;
  const m = mine ? `${mine.version} build ${mine.build}` : "this build";
  return `the hooks run another Align build (${t}) than this \`align\` (${m}), so sessions may be told or blocked differently from what this command says. Run \`align install\` with this \`align\` to update them.`;
}

// ---------- which build writes the sessions' state ----------
// Two cycles in a row found wrong notices because two agent builds wrote to one ALIGN_HOME (an older `align` on PATH,
// or the hooks' older copy in bin/current, next to a newer one): an older build's rows with no facts (C14-1), an older
// build's hot file (C14-3). So the database records the newest build that has written to it, and a build that sees a
// newer one's record leaves the sessions' notices about their share, hot files and latch files to that build: it still
// meters and the hooks still enforce from the files that are there (E2E-AGENT cycle 14).

/**
 * The generation of how this source writes the sessions' state (its notices about their share, hot files and latch
 * files): ordered, unlike the build hash. Raised by any change to what those carry or how they are worded, so a build
 * can tell that another one is newer.
 */
export const WRITER_GEN = 14;

/** kv: the newest build that has written to this database (`BuildMark`). */
export const NEWEST_BUILD = "newest_build";

/** The newest build that has written to this database: its generation, identity (`build.json`), and since when it has
 *  (rows an older build stored after that are worded as "changed", never as that build composed them). */
export interface BuildMark extends BuildId {
  gen: number;
  since: string;
}

/** This running build: `build.json` beside this file (dist), or the source's version when run from source. */
export function selfBuild(): BuildId & { gen: number } {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return { ...(buildOf(here) ?? { version: VERSION, build: "source" }), gen: WRITER_GEN };
}

/** The words a build says when a newer build has written to this machine's Align data (`theirs`). */
export function supersededWords(theirs: BuildId, mine: BuildId): string {
  return `a newer Align build (${theirs.version} build ${theirs.build}) has written to this machine's Align data, so this \`align\` (${mine.version} build ${mine.build}) leaves what sessions are told to that build: it meters and enforces the stops and holds it hears, and sessions are told what this command does once that build runs. Run the newer \`align\` (and \`align install\` with it) instead.`;
}
