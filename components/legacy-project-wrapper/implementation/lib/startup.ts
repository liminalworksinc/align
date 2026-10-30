import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertStartupConfig, config, testServerClosed } from "./config";
import { dcrDir } from "./oauth/clients";

// Some state lives in this process's memory (locks, rate limits, authorization codes), so two servers on one data
// directory would disagree. A pid file, <data>/.pid, records the live server; a second one refuses to start.
const pidFile = () => path.join(config().dataDir, ".pid");

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** An atomic write's temp file: _oauth_clients.json.<hex>.tmp, written then renamed over the client list
 *  (lib/oauth/clients.ts). A crash between the write and the rename leaves it behind; startup removes it. */
const TEMP_FILE = /^_oauth_clients\.json\.[0-9a-f]{8,}\.tmp$/;
function sweepLeftovers() {
  const dir = dcrDir();
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) if (TEMP_FILE.test(n)) rmSync(path.join(dir, n), { force: true });
}

export function startup() {
  assertStartupConfig();
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const PID_FILE = pidFile();
  const held = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, "utf8").trim()) : 0;
  if (held && held !== process.pid && alive(held)) {
    throw new Error(`Another Align server (pid ${held}) is using ${path.dirname(PID_FILE)}. Stop it first.`);
  }
  mkdirSync(path.dirname(PID_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 });
  chmodSync(PID_FILE, 0o600); // the mode above applies only when the file is new
  sweepLeftovers();
  if (config().hosted && testServerClosed(config().deleteBy)) {
    // Closed: up only so the operator can reach the volume (proxy.ts answers 410 to everything).
    console.error(`ALIGN_DELETE_BY (${config().deleteBy}) has passed: closed, every request gets 410.`);
  }
  process.once("exit", () => {
    try {
      if (readFileSync(PID_FILE, "utf8").trim() === String(process.pid)) unlinkSync(PID_FILE);
    } catch {}
  });
}
