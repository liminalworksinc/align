#!/usr/bin/env node
// Preserve the direct Node command in a cold checkout, with no repository writes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "align-operator-"));
const runtime = path.join(temporary, "runtime");
const cleanup = () => fs.rmSync(temporary, {recursive:true, force:true});
const signals = new Map();
let active = null;
let requestedSignal = null;

function forward(signal) {
  if (!active?.pid) return;
  try { process.kill(-active.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

function invoke(script, args, preparing = false) {
  const child = spawn(process.execPath, [script, ...args], {
    detached:true,
    stdio:preparing ? ["ignore", "ignore", "inherit"] : "inherit",
    env:preparing ? {...process.env, TMPDIR:temporary} : process.env,
  });
  active = child;
  if (requestedSignal) forward(requestedSignal);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (active === child) active = null;
      resolve({code, signal});
    });
  });
}

process.once("exit", cleanup);
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
  const handler = () => {
    requestedSignal ??= signal;
    forward(signal);
  };
  signals.set(signal, handler);
  process.once(signal, handler);
}
let result;
try {
  result = await invoke(path.join(implementation, "scripts/prepare-operator.mjs"), [runtime], true);
  if (!requestedSignal && result.code === 0 && !result.signal) {
    result = await invoke(path.join(runtime, "scripts/align-admin.mjs"), process.argv.slice(2));
  }
  process.exitCode = result.code ?? 1;
} finally {
  for (const [signal,handler] of signals) process.removeListener(signal, handler);
  process.removeListener("exit", cleanup);
  cleanup();
}
const terminalSignal = requestedSignal ?? result.signal;
if (terminalSignal) process.kill(process.pid, terminalSignal);
