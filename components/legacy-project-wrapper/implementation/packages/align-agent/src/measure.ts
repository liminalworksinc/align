import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { apiOk, bindDevice, HttpError, loadCredentials, NetworkError } from "./api.ts";
import type { Ctx } from "./context.ts";
import { decimalText } from "./shared/decimal.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";

const HANDOFF_TIMEOUT = 10_000;
const OUTPUT_LIMIT = 4096;
const ID = /^[a-z]{1,4}_[A-Za-z0-9_-]{8,64}$/;
type Consent = { executable: string; args: string[]; resolved: string; directory: string };
type Result = { value: string | null; exit_status: number | null };

function ordinaryUser() {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (!uid || process.geteuid?.() !== uid || process.getegid?.() !== gid || process.env.SUDO_UID || process.env.SUDO_USER)
    throw new Error("Run this command from your normal account without elevated rights.");
}

function executableAt(file: string) {
  if (!path.posix.isAbsolute(file)) throw new Error("Use an absolute executable path.");
  try {
    const resolved = realpathSync(file);
    const info = statSync(resolved);
    if (info.isFile() && (info.mode & 0o111) && !(info.mode & 0o6000)) return resolved;
  } catch {
    // Report the same message without the path or filesystem details.
  }
  throw new Error("Choose an executable that runs with your normal account rights.");
}

function runLocal(consent: Consent): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(consent.resolved, consent.args, {
      cwd: consent.directory,
      env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
      detached: true,
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (child.pid) {
        // Stop the whole process group so a child holding stdout open cannot keep Align waiting.
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
      child.stdout.destroy();
    };
    const timer = setTimeout(stop, HANDOFF_TIMEOUT);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > OUTPUT_LIMIT) stop();
      else chunks.push(chunk);
    });
    child.once("error", stop);
    child.once("close", (status) => {
      clearTimeout(timer);
      const value = stopped || status !== 0 ? "" : Buffer.concat(chunks).toString("utf8").trim();
      const parsed = value.length <= 80 ? decimalText(value) : null;
      resolve({ value: parsed && parsed.length > 80 ? value : parsed, exit_status: status });
    });
  });
}

export async function measureCommand(ctx: Ctx, argv: string[]): Promise<string> {
  const [action, ws, goal, measure, dash, executable, ...args] = argv;
  const credentials = loadCredentials(ctx.home);
  if (!credentials?.device_id || credentials.signed_out) throw new Error("Sign in with align login first.");
  if (action === "device" && argv.length === 1) return credentials.device_id;

  if (![ws, goal, measure].every((id) => id && ID.test(id))) throw new Error("Enter the workspace, goal and measure IDs.");
  if (!["allow", "revoke", "run"].includes(action) || (action !== "allow" && argv.length !== 4))
    throw new Error("Choose measure allow, revoke or run. See align measure --help.");
  const origin = new URL(ctx.config.server_url).href;
  if (new URL(credentials.server_url).href !== origin) throw new Error("This device is signed in to a different server.");
  const key = createHash("sha256").update(JSON.stringify([origin, credentials.device_id, ws, goal, measure])).digest("hex");
  const file = path.join(ctx.home, `measure-${key}.json`);

  if (action === "revoke") {
    rmSync(file, { force: true });
    return "Removed permission on this machine.";
  }
  if (action === "allow") {
    ordinaryUser();
    if (dash !== "--" || !executable) throw new Error("Put -- before the executable and its arguments.");
    const resolved = executableAt(executable);
    writeJsonAtomic(file, { executable, args, resolved, directory: process.cwd() } satisfies Consent, 0o600);
    return "Allowed this exact command on this machine.";
  }

  const consent = readJson<Consent>(file);
  if (!consent) throw new Error("Allow this exact command on this machine before running it.");
  ordinaryUser();
  const target = `/api/v2/workspaces/${ws}/goals/${goal}/measures/${measure}/command-reading`;
  const pairedOrigin = new URL(credentials.server_url).origin;
  const unbind = bindDevice(ctx, credentials.device_id);
  try {
    const source = await apiOk(ctx, "GET", target, { pairedOrigin });
    if (source?.executable !== consent.executable || JSON.stringify(source?.args) !== JSON.stringify(consent.args)
        || executableAt(consent.executable) !== consent.resolved || JSON.stringify(readJson<Consent>(file)) !== JSON.stringify(consent))
      throw new Error("The command has changed or permission was removed. Review it and allow the exact command again.");
    const result = await runLocal(consent);
    const body = { goal_version: source.goal_version, run_id: randomUUID(), ...result };
    const submit = async () => {
      if (JSON.stringify(readJson<Consent>(file)) !== JSON.stringify(consent))
        throw new Error("Permission was removed before the reading could be sent.");
      const reply = await apiOk(ctx, "POST", target, { pairedOrigin, body });
      if (typeof reply?.id !== "string" || !reply.id) throw new NetworkError("The reading confirmation did not arrive.");
    };
    try {
      await submit();
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      await submit();
    }
    return result.value === null ? "Recorded an unknown reading." : `Recorded reading ${result.value}.`;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404)
      throw new Error("This machine cannot submit this reading. Check the IDs and ask the goal owner to choose this machine.");
    if (error instanceof HttpError && error.code === "stale_version")
      throw new Error("The goal changed before the reading arrived. Review the command and run it again.");
    throw error;
  } finally {
    unbind();
  }
}
