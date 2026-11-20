// Hook-safe accounting of final returned strings. Each return makes at most one append, with no read or lock.
import fs from "node:fs";
import { layout } from "./layout.ts";
import type { AddedText } from "./types.ts";

export const emptyAddedText = (): AddedText => ({ characters: 0, additions: 0, last_at: null, last_event: null });
export const emptyContextCost = () => ({ context_added: emptyAddedText(), notices_added: emptyAddedText() });
export const CONTEXT_READ_BYTES = 1024 * 1024;
type Event = NonNullable<AddedText["last_event"]>;
type TextOutput = {
  hookSpecificOutput?: { additionalContext?: string; permissionDecisionReason?: string };
  systemMessage?: string;
  decision?: string;
  reason?: string;
};

/** One line per audience per return, including separators already present in the returned strings. */
export function countOutput(home: string, lid: string, output: Record<string, unknown>, event: Event): void {
  const out = output as TextOutput;
  const model = (out.hookSpecificOutput?.additionalContext?.length || 0) + (out.hookSpecificOutput?.permissionDecisionReason?.length || 0);
  const person = (out.systemMessage?.length || 0) + (out.decision === "block" ? out.reason?.length || 0 : 0);
  if (!model && !person) return;
  const at = new Date().toISOString();
  const lines = ([["model", model], ["person", person]] as const)
    .filter(([, characters]) => characters > 0).map(([audience, characters]) => JSON.stringify([audience, characters, at, event]));
  let fd: number | undefined;
  try {
    fs.mkdirSync(layout.contextCostDir(home), { recursive: true, mode: 0o700 });
    fd = fs.openSync(layout.contextCost(home, lid), fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    if (!fs.fstatSync(fd).isFile()) return;
    // A leading newline isolates an earlier torn line; both audiences share one O_APPEND write.
    fs.appendFileSync(fd, "\n" + lines.join("\n") + "\n", "utf8");
  } catch {
    /* Accounting cannot suppress text or turn a denial into an allowance. */
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); } catch { /* Best effort. */ }
  }
}

/** Commands sum complete records only. Never rewrite or rotate a live session's append-only log. */
export function readContextCost(home: string, lid: string): ReturnType<typeof emptyContextCost> {
  const totals = emptyContextCost();
  let text: string, fd: number | undefined;
  try {
    fd = fs.openSync(layout.contextCost(home, lid), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return totals;
    const start = Math.max(0, stat.size - CONTEXT_READ_BYTES);
    if (start) { totals.context_added.lower_bound = true; totals.notices_added.lower_bound = true; }
    const buf = Buffer.alloc(Math.min(stat.size, CONTEXT_READ_BYTES));
    let bytes = 0;
    while (bytes < buf.length) {
      const n = fs.readSync(fd, buf, bytes, buf.length - bytes, start + bytes);
      if (!n) break;
      bytes += n;
    }
    text = buf.subarray(0, bytes).toString("utf8");
    // The first bytes may start inside a record or a multibyte character. Discard that partial line.
    if (start) text = text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : "";
  } catch { return totals; }
  finally { try { if (fd !== undefined) fs.closeSync(fd); } catch { /* Best effort. */ } }
  for (const line of text.slice(0, text.lastIndexOf("\n") + 1).split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (!Array.isArray(row) || row.length !== 4) continue;
      const [audience, characters, at, event] = row;
      if ((audience !== "model" && audience !== "person") || !Number.isSafeInteger(characters) || characters <= 0 ||
        typeof at !== "string" || !Number.isFinite(Date.parse(at)) || !["SessionStart", "UserPromptSubmit", "PreToolUse"].includes(event)) continue;
      const total = totals[audience === "model" ? "context_added" : "notices_added"];
      total.characters += characters;
      total.additions++;
      if (!total.last_at || at >= total.last_at) { total.last_at = at; total.last_event = event; }
    } catch { /* Torn or malformed records do not hide valid additions. */ }
  }
  return totals;
}

export function contextAddedLine(total: AddedText | undefined): string {
  if (total?.lower_bound && !total.additions) return "Align has added at least 0 characters to this session's context; the counter file exceeds the read limit.";
  if (!total?.additions) return "Align has added no characters to this session's context.";
  const event = total.last_event === "SessionStart" ? "session start" : total.last_event === "PreToolUse" ? "a tool call" : "a prompt";
  const bound = total.lower_bound ? "at least " : "";
  return `Align has added ${bound}${total.characters} characters to this session's context in ${bound}${total.additions} ${total.additions === 1 ? "addition" : "additions"}, last at ${event} (${total.last_at}).`;
}
