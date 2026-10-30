#!/usr/bin/env node
// Align session capture hook. Sends a small, redacted summary of agent activity to Align.
//
// Claude Code (default): hook JSON on stdin. Configured in .claude/settings.json.
// Codex: add to ~/.codex/config.toml
//   notify = ["node", "/abs/path/to/scripts/align-capture.mjs", "--codex"]
// Codex appends the notify JSON payload as the last argv element.
//
// Contract: always exits 0, never writes to stdout (UserPromptSubmit/SessionStart stdout becomes model context),
// never sends tool outputs or file contents -- only prompts, paths, commands, and the final assistant message.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HARD_DEADLINE_MS = 1300;
const MAX_TEXT = 1000;

const done = () => process.exit(0);
process.on("uncaughtException", done);
process.on("unhandledRejection", done);
// Whatever happens (stdin never closes, DNS stalls), exit 0 well inside the hook budget.
setTimeout(done, HARD_DEADLINE_MS).unref();

// ---------- redaction ----------
const PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "[redacted]"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]"],
  [/\bvck_[A-Za-z0-9]{8,}/g, "[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{12,}/g, "[redacted]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, "[redacted]"],
  [/\b[0-9a-fA-F]{32,}\b/g, "[redacted]"],
];

// Base64-ish runs: long, mixed case + digits, and not path-shaped (no short slash-separated segments).
function redactBase64(text) {
  return text.replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, (run) => {
    if (!/[0-9]/.test(run) || !/[A-Z]/.test(run) || !/[a-z]/.test(run)) return run;
    const longest = Math.max(...run.split("/").map((s) => s.length));
    return longest >= 20 ? "[redacted]" : run;
  });
}

function redact(text) {
  if (typeof text !== "string" || !text) return undefined;
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  out = redactBase64(out);
  return out.length > MAX_TEXT ? `${out.slice(0, MAX_TEXT)}…` : out;
}

// ---------- git / repo ----------
function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      timeout: 300,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function optedIn(dir) {
  try {
    const file = path.join(dir, ".claude", "settings.json");
    return existsSync(file) && readFileSync(file, "utf8").includes("align-capture");
  } catch {
    return false;
  }
}

/** Project dir that opted in via .claude/settings.json, or null. Walks up from cwd to the git toplevel; never checks $HOME itself. */
function optInRoot(cwd, toplevel) {
  const home = homedir();
  let dir = path.resolve(cwd);
  for (;;) {
    if (dir !== home && optedIn(dir)) return dir;
    if (toplevel && dir === path.resolve(toplevel)) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function relativePath(file, root) {
  if (typeof file !== "string" || !file) return undefined;
  if (!path.isAbsolute(file) || !root) return file;
  const rel = path.relative(root, file);
  // Outside the repo: keep only the file name, never a home-directory path.
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : path.basename(file);
}

// ---------- input ----------
async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 4 * 1024 * 1024) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parse(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const str = (v) => (typeof v === "string" && v ? v : undefined);

function fromClaudeHook(p, harness) {
  const input = p.tool_input && typeof p.tool_input === "object" ? p.tool_input : {};
  return {
    harness,
    session_id: str(p.session_id),
    hook_event: str(p.hook_event_name) || "unknown",
    cwd: str(p.cwd) || process.cwd(),
    prompt: str(p.prompt),
    tool_name: str(p.tool_name),
    file_path: str(input.file_path) || str(input.notebook_path),
    command: str(input.command),
    // Stop carries last_assistant_message; never read tool_response.
    last_message: str(p.last_assistant_message),
    reason: str(p.reason) || str(p.source),
  };
}

function fromCodexNotify(p) {
  const inputs = Array.isArray(p["input-messages"]) ? p["input-messages"].filter((m) => typeof m === "string") : [];
  const type = str(p.type) || "unknown";
  return {
    harness: "codex",
    session_id: str(p["thread-id"]) || str(p.thread_id),
    // agent-turn-complete is the end of a turn: same meaning as Claude Code's Stop.
    hook_event: type === "agent-turn-complete" ? "Stop" : type,
    cwd: str(p.cwd) || process.cwd(),
    prompt: inputs.length ? inputs.join("\n") : undefined,
    last_message: str(p["last-assistant-message"]),
    reason: type,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const codexAt = argv.indexOf("--codex");
  let ev;
  if (codexAt >= 0) {
    const rest = argv.slice(codexAt + 1);
    const payload = rest.length ? parse(rest[rest.length - 1]) : null;
    if (payload) ev = fromCodexNotify(payload);
    else {
      // Codex hooks.json uses the Claude Code hook dialect on stdin.
      const p = parse(await readStdin());
      if (p) ev = fromClaudeHook(p, "codex");
    }
  } else {
    const p = parse(await readStdin());
    if (p) ev = fromClaudeHook(p, "claude-code");
  }
  if (!ev || !ev.session_id) return;

  const toplevel = git(ev.cwd, ["rev-parse", "--show-toplevel"]);
  const optRoot = optInRoot(ev.cwd, toplevel);
  if (process.env.ALIGN_CAPTURE !== "1" && !optRoot) return;

  // File paths are made relative to the repo root so no home-directory paths leave the machine.
  const root = toplevel || optRoot || ev.cwd;
  const event = {
    harness: ev.harness,
    session_id: ev.session_id,
    hook_event: ev.hook_event,
    cwd: ev.cwd,
    prompt: redact(ev.prompt),
    tool_name: ev.tool_name,
    file_path: redact(relativePath(ev.file_path, root)),
    command: redact(ev.command),
    last_message: redact(ev.last_message),
    reason: ev.reason,
    branch: git(ev.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    repo: path.basename(toplevel || ev.cwd),
  };

  const base = (process.env.ALIGN_URL || "http://localhost:3100").replace(/\/$/, "");
  // ALIGN_AGENT_TOKEN (a workspace's agent token, Mode L) sends the event to that workspace instead of the default store.
  const auth = process.env.ALIGN_AGENT_TOKEN ? { authorization: `Bearer ${process.env.ALIGN_AGENT_TOKEN}` } : {};
  await fetch(`${base}/api/sessions/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(800),
  }).catch(() => undefined);
}

main().catch(() => undefined).finally(done);
