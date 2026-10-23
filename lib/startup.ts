import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertStartupConfig, config, testServerClosed } from "./config";

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

/** An atomic write's temp file: <file>.<random hex or uuid>.tmp, written then renamed over <file> (lib/store.ts,
 *  bumpAgentEpoch's auth.json, the used-invites list). A crash between the write and the rename leaves it behind. */
const TEMP_FILE = /^[\w.-]+\.json\.[0-9a-f-]{8,}\.tmp$/;

/** A crash mid-create leaves .tmp-<id> (state and passcode hashes) and a crash mid-delete leaves .deleting-<id>
 *  (the whole workspace). Neither is a live workspace; at startup, with this server holding the pid file and no
 *  request in flight, they are removed so tester data never outlives a delete (review M10). So are atomic-write temp
 *  files, in the workspaces root and in each workspace (auth.json.<hex>.tmp holds passcode hashes; Sean's #6 review). */
function sweepLeftovers() {
  const root = config().workspacesRoot;
  if (!existsSync(root)) return;
  for (const n of readdirSync(root)) {
    if (/^\.(tmp|deleting)-w_[a-z2-7]{12}$/.test(n)) rmSync(path.join(root, n), { recursive: true, force: true });
    else if (TEMP_FILE.test(n)) rmSync(path.join(root, n), { force: true });
    else if (/^w_[a-z2-7]{12}$/.test(n))
      for (const f of readdirSync(path.join(root, n))) if (TEMP_FILE.test(f)) rmSync(path.join(root, n, f), { force: true });
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
  sweepLeftovers();
  if (config().hosted && testServerClosed(config().deleteBy)) {
    // Closed mode: up only so the operator can purge (proxy.ts answers 410 to everything).
    console.error(`ALIGN_DELETE_BY (${config().deleteBy}) has passed: closed, every request gets 410. Purge with ws-admin delete --all --yes, then stop the machine.`);
  }
  process.once("exit", () => {
    try {
      if (readFileSync(PID_FILE, "utf8").trim() === String(process.pid)) unlinkSync(PID_FILE);
    } catch {}
  });
}
