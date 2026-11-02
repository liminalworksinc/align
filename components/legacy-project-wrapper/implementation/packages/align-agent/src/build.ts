// Which build of the agent a folder holds (`build.json`, written by scripts/postbuild.mjs), so the terminal `align` can
// say when the hooks run another build from ALIGN_HOME/bin/current: both report the same version, and an older build
// there can write notices or word denies this one never would (E2E-AGENT cycle 13 C13-1).
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";

export interface BuildId {
  version: string;
  build: string;
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
