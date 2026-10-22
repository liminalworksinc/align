import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertStartupConfig, config } from "./config";

// State locks live in this process's memory, so two servers on one data directory would corrupt it.
// A pid file records the live server; a second one refuses to start. Mode L keeps it next to Northstar's state
// (./data); hosted keeps it on the volume (ALIGN_DATA_DIR), since the app folder there is the image's, not shared.
const pidFile = () => path.join(config().hosted ? config().dataDir : path.join(process.cwd(), "data"), ".pid");

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function startup() {
  assertStartupConfig();
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const PID_FILE = pidFile();
  const held = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, "utf8").trim()) : 0;
  if (held && held !== process.pid && alive(held)) {
    throw new Error(`Another Align server (pid ${held}) is using ${path.dirname(PID_FILE)}. Stop it first.`);
  }
  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 });
  chmodSync(PID_FILE, 0o600); // the mode above applies only when the file is new
  process.once("exit", () => {
    try {
      if (readFileSync(PID_FILE, "utf8").trim() === String(process.pid)) unlinkSync(PID_FILE);
    } catch {}
  });
}
