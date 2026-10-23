// Background sync started from a hook. The hook itself stays offline: it only spawns `cli.js sync --hook` detached,
// which makes one pass and exits. Throttled per event; child_process is loaded only when a spawn is due.
import fs from "node:fs";
import path from "node:path";
import { layout } from "../shared/layout.ts";

/**
 * Minimum time between hook-started syncs, by event. SessionStart syncs unless one was just spawned. Stop always syncs:
 * it is the last hook of a turn, so it carries that turn's usage up even if the session then sits idle.
 */
const SYNC_EVERY_MS: Record<string, number> = { SessionStart: 0, Stop: 0, UserPromptSubmit: 10_000, PreToolUse: 30_000 };
const STOP_SETTLE_MS = 1_500;
const SPAWN_GAP_MS = 3_000;

function ageMs(file: string): number {
  try {
    return Date.now() - fs.statSync(file).mtimeMs;
  } catch {
    return Infinity;
  }
}

export async function kickSync(home: string, hookScript: string, env: NodeJS.ProcessEnv, event: string): Promise<void> {
  if (env.ALIGN_NO_AUTOSTART === "1") return;
  const every = SYNC_EVERY_MS[event] ?? 30_000;
  // Stop always spawns (its pass waits for a running one); other events respect the interval and the spawn gap.
  if (event !== "Stop" && (ageMs(layout.lastSync(home)) < every || ageMs(layout.spawnLock(home)) < Math.max(SPAWN_GAP_MS, every))) return;
  const cli = path.join(path.dirname(hookScript), "cli.js");
  if (!fs.existsSync(cli)) return;
  try {
    fs.writeFileSync(layout.spawnLock(home), String(Date.now()), { mode: 0o600 });
  } catch {
    return;
  }
  const { spawn } = await import("node:child_process");
  let logFd: number | "ignore" = "ignore";
  try {
    logFd = fs.openSync(path.join(layout.logs(home), "sync.log"), "a", 0o600);
  } catch {
    /* no log */
  }
  const args = [cli, "sync", "--hook", ...(event === "Stop" ? ["--settle", String(STOP_SETTLE_MS)] : [])];
  spawn(process.execPath, args, { detached: true, cwd: home, stdio: ["ignore", logFd, logFd], env: { ...env, ALIGN_HOME: home } }).unref();
}
