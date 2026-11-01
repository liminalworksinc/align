// Hook entry point: `node <ALIGN_HOME>/bin/current/hook.js <claude|codex> <Event>`.
// Contract: offline, local files only, internal 300 ms deadline, exit 0 silently on any failure, EXCEPT PreToolUse,
// which denies when a stop latch or a goal hold exists for the session (or cannot be ruled out) and fails closed. Before the input is
// read, any latch on the machine denies; after, only this session's.
import fs from "node:fs";
import { alignHomeForHook } from "./shared/layout.ts";
import type { Harness } from "./shared/types.ts";
import { kickSync } from "./hooks/autostart.ts";
import { denyOutput, failureDeny, latchDeny, latchedOnFailure, preToolUse, sessionStart, stop, userPromptSubmit, type HookInput, type HookOutput } from "./hooks/handlers.ts";
import { MIN_NODE, unsupportedNode } from "./node-version.ts";

const DEADLINE_MS = Number(process.env.ALIGN_HOOK_DEADLINE_MS || 300);
const MAX_INPUT = 8 * 1024 * 1024;

const harnessArg = process.argv[2];
const event = process.argv[3] || "";
const harness: Harness | null = harnessArg === "claude" || harnessArg === "claude-code" ? "claude-code" : harnessArg === "codex" ? "codex" : null;
const home = alignHomeForHook(process.argv[1] || "", process.env);
let settled = false;
/** The session this PreToolUse call is for, once its input has been read. */
let sessionId: string | null = null;
/** Output already decided; a later deadline or failure emits it rather than dropping it. */
let decided: HookOutput | undefined;

function emit(out: HookOutput): never {
  settled = true;
  if (out) {
    try {
      fs.writeSync(1, JSON.stringify(out));
    } catch {
      /* stdout closed */
    }
  }
  process.exit(0);
}

function failure(): never {
  if (decided !== undefined) emit(decided);
  // Fail open everywhere except the stop latch and goal holds.
  if (event === "PreToolUse" && !settled) {
    let latched = true;
    try {
      latched = harness ? latchedOnFailure(home, harness, sessionId) : true;
    } catch {
      latched = true;
    }
    if (latched) {
      let out: HookOutput = null;
      try {
        out = harness ? failureDeny(home, harness, sessionId) : null;
      } catch {
        /* the stop wording below */
      }
      emit(out || denyOutput());
    }
  }
  emit(null);
}

process.on("uncaughtException", () => failure());
process.on("unhandledRejection", () => failure());
setTimeout(() => failure(), DEADLINE_MS);

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
    size += (chunk as Buffer).length;
    if (size > MAX_INPUT) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  if (!harness) return emit(null);
  const raw = await readStdin();
  let input: HookInput;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return failure();
  }
  if (!input || typeof input !== "object") return failure();
  const old = unsupportedNode(process.env);
  if (old) return emit(oldNode(old, input));
  switch (event) {
    case "SessionStart": {
      const out = (decided = sessionStart(home, harness, input, process.env));
      await kickSync(home, process.argv[1] || "", process.env, event).catch(() => undefined);
      return emit(out);
    }
    case "UserPromptSubmit": {
      const out = (decided = userPromptSubmit(home, harness, input));
      const command = typeof input.prompt === "string" && /^\s*::align\b/i.test(input.prompt);
      await kickSync(home, process.argv[1] || "", process.env, command ? "Command" : event).catch(() => undefined);
      return emit(out);
    }
    case "Stop":
    case "StopFailure": {
      decided = null; // the turn is over: add nothing to context and never continue it
      if (event === "Stop") {
        try {
          stop(home, harness, input); // local drift check: leaves a user-only notice for the next prompt
        } catch {
          /* never affects the turn */
        }
      }
      await kickSync(home, process.argv[1] || "", process.env, event).catch(() => undefined);
      return emit(null);
    }
    case "PreToolUse": {
      sessionId = typeof input.session_id === "string" && input.session_id ? input.session_id : null;
      const out = (decided = preToolUse(home, harness, input));
      await kickSync(home, process.argv[1] || "", process.env, event).catch(() => undefined);
      return emit(out);
    }
    default:
      return emit(null);
  }
}

/**
 * On an unsupported Node the hooks do nothing (no context, no spool, no sync), with one message when a session starts.
 * What already fails closed still does: a stop latch or goal hold of the session denies its tools, and an `::align`
 * command is still kept from the model.
 */
function oldNode(why: string, input: HookInput): HookOutput {
  const fix = `Install Node ${MIN_NODE} or later and run \`align install\` with it.`;
  if (event === "SessionStart") return { systemMessage: `Align: ${why}, so Align is off in this session (a stop or goal hold still blocks tools). ${fix}` };
  if (event === "UserPromptSubmit" && typeof input.prompt === "string" && /^\s*::align\b/i.test(input.prompt)) return { decision: "block", reason: `Align: ${why}. ${fix}` };
  if (event === "PreToolUse" && harness) {
    sessionId = typeof input.session_id === "string" && input.session_id ? input.session_id : null;
    // The same latch rules as on a supported Node (a stopped session may still read; a held one may not), so the
    // session behaves the same; anything that can't be read still denies (failure()).
    if (latchedOnFailure(home, harness, sessionId)) return latchDeny(home, harness, input);
  }
  return null;
}

main().catch(() => failure());
