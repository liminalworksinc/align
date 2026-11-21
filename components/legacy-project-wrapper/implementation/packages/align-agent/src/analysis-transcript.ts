import fs from "node:fs";
import type { AnalysisTurn } from "./shared/analysis.ts";
import type { Harness } from "./shared/types.ts";

const BYTES = 512 * 1024;
const BLOCKS = 200;
const LATE_BYTES = 128 * 1024;
type TurnReference = Pick<AnalysisTurn, "at" | "root" | "transcript" | "endOffset">;
const COMMAND = /^\s*::align\b/i;
type RecordValue = { [key: string]: unknown };

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const blocks = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(object) : [];

function messageText(value: unknown, kind: string): string {
  return typeof value === "string" ? value : blocks(value).filter((b) => b.type === kind).map((b) => text(b.text)).join("\n");
}

export type RecordCount = "replies" | "calls" | "results";

export interface TurnContent {
  prompt?: string;
  replies: string[];
  finalReply: string | null;
  calls: Set<string>;
  results: Set<string>;
  lowerBounds: Set<RecordCount>;
}

function addRecord<T>(records: Set<T>, value: T, lowerBounds: Set<RecordCount>, kind: RecordCount) {
  if (records.has(value)) return;
  if (records.size < BLOCKS) records.add(value);
  else lowerBounds.add(kind);
}

function addResult(calls: Set<string>, results: Set<string>, id: unknown, lowerBounds: Set<RecordCount>) {
  if (typeof id !== "string" || !id) return;
  if (calls.has(id)) addRecord(results, id, lowerBounds, "results");
  else if (lowerBounds.has("calls")) lowerBounds.add("results");
}

function markPartial(lowerBounds: Set<RecordCount>) {
  for (const kind of ["replies", "calls", "results"] as const) lowerBounds.add(kind);
}


/** This reader has its own bounded byte window. Metering offsets can be past the entire turn. */
export function readTurn(harness: Harness, native: string, turn: TurnReference): TurnContent | null {
  if (!turn.transcript) return null;
  try {
    // Refuse pipes and device files without opening them. Only a regular transcript can be analysed.
    const stat = fs.statSync(turn.transcript);
    if (!stat.isFile() || !stat.size) return null;
    const end = turn.endOffset && turn.endOffset <= stat.size ? Math.min(stat.size, turn.endOffset + LATE_BYTES) : stat.size;
    const from = Math.max(0, end - BYTES);
    const fd = fs.openSync(turn.transcript, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    let data: string;
    try {
      if (!fs.fstatSync(fd).isFile()) return null;
      const buffer = Buffer.alloc(end - from);
      data = buffer.subarray(0, fs.readSync(fd, buffer, 0, buffer.length, from)).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    const lines = data.split("\n").slice(from ? 1 : 0);
    const rows = lines.flatMap((line) => {
      try {
        return [object(JSON.parse(line))];
      } catch {
        return [];
      }
    });
    const partial = end < stat.size || !data.endsWith("\n");
    return harness === "claude-code" ? claudeTurn(rows, native, turn, from > 0, partial) : codexTurn(rows, native, turn.root, partial);
  } catch {
    return null;
  }
}

function claudePrompt(row: RecordValue, native: string): string {
  if (row.type !== "user" || row.sessionId !== native || row.isSidechain === true) return "";
  const content = object(row.message).content;
  return blocks(content).some((b) => b.type === "tool_result") ? "" : messageText(content, "text");
}

function claudeTurn(rows: RecordValue[], native: string, turn: TurnReference, cropped: boolean, partial: boolean): TurnContent | null {
  const byTime = turn.root.startsWith("ts:");
  const at = Date.parse(turn.at);
  const candidates = new Map<string | number, number>();
  let sawEarlier = !cropped;
  for (const [index, row] of rows.entries()) {
    const prompt = claudePrompt(row, native);
    if (!prompt || COMMAND.test(prompt)) continue;
    const timestamp = Date.parse(text(row.timestamp));
    if (timestamp < at - 1500) sawEarlier = true;
    const matches = byTime ? Math.abs(timestamp - at) <= 1500 : row.promptId === turn.root || row.uuid === turn.root;
    if (!matches) continue;
    const identity = text(row.uuid) || text(row.promptId) || index;
    if (!candidates.has(identity)) candidates.set(identity, index);
  }
  if (candidates.size !== 1 || (byTime && !sawEarlier)) return null;
  const index = candidates.values().next().value!;
  const first = rows[index];
  const prompt = blocks(object(first.message).content).some((b) => b.type !== "text") ? undefined : claudePrompt(first, native);
  const root = text(first.promptId) || text(first.uuid);
  const calls = new Set<string>();
  const results = new Set<string>();
  const replies = new Map<string, string>();
  const lowerBounds = new Set<RecordCount>();
  const seen = new Set([text(first.uuid)]);
  let finalReply: string | null = null;
  let lastMessage = "";
  let disputedText = false;
  let lastText = "";
  let usedTool = false;
  let ended = false;
  for (const row of rows.slice(index + 1)) {
    if (row.sessionId !== native || row.isSidechain === true) continue;
    const uuid = text(row.uuid);
    // Streamed assistant rows may share an id and carry different blocks.
    if (uuid && row.type !== "assistant" && seen.has(uuid)) continue;
    if (uuid && row.type !== "assistant") seen.add(uuid);
    const message = object(row.message);
    const promptId = text(row.promptId);
    if (row.type === "user") {
      const toolResults = blocks(message.content).filter((b) => b.type === "tool_result");
      if (toolResults.length) {
        if (!promptId || promptId === root) {
          for (const b of toolResults) addResult(calls, results, b.tool_use_id, lowerBounds);
        }
      } else if (messageText(message.content, "text") && (!promptId || promptId !== root || COMMAND.test(messageText(message.content, "text")))) {
        ended = true;
        break;
      }
      continue;
    }
    if (row.type !== "assistant" || (promptId && root && promptId !== root)) continue;
    const reply = messageText(message.content, "text");
    const identity = text(message.id) || uuid;
    const toolUses = blocks(message.content).filter((b) => b.type === "tool_use");
    if (!identity || identity !== lastMessage) {
      lastMessage = identity;
      lastText = "";
      disputedText = false;
      usedTool = false;
    }
    if (lastText && reply && lastText !== reply) disputedText = true;
    if (reply) lastText = reply;
    usedTool ||= toolUses.length > 0 || message.stop_reason === "tool_use";
    finalReply = reply && !disputedText && !usedTool ? reply : null;
    if (reply) {
      const replyKey = identity || reply;
      const earlier = replies.get(replyKey);
      if (earlier !== undefined || replies.size < BLOCKS) {
        if (!earlier || reply.length > earlier.length) replies.set(replyKey, reply);
      } else lowerBounds.add("replies");
    }
    for (const b of toolUses) if (text(b.id)) addRecord(calls, text(b.id), lowerBounds, "calls");
  }
  if (!ended && partial) markPartial(lowerBounds);
  return replies.size || calls.size ? { prompt, replies: [...replies.values()], calls, results, lowerBounds, finalReply: ended || !partial ? finalReply : null } : null;
}

function codexTurn(rows: RecordValue[], native: string, root: string, partial: boolean): TurnContent | null {
  const meta = rows.find((r) => r.type === "session_meta");
  if (meta && object(meta.payload).id !== native) return null;
  const calls = new Set<string>();
  const results = new Set<string>();
  const messages = new Set<string>();
  const events = new Set<string>();
  const lowerBounds = new Set<RecordCount>();
  const eventBounds = new Set<RecordCount>();
  let ended = false;
  let active = false;
  let user = false;
  let prompt: string | undefined;
  let markedFinal: string | null = null;
  let finalReply: string | null = null;
  for (const row of rows) {
    const p = object(row.payload);
    const type = p.type;
    const id = text(p.turn_id);
    const turn = text(p.root_turn_id) || id;
    if (row.type === "event_msg" && type === "task_started") {
      if (active && turn !== root) {
        ended = true;
        break;
      }
      active = id === root && turn === root;
    } else if (!active || (turn && turn !== root)) {
      continue;
    } else if (row.type === "event_msg" && (type === "task_complete" || type === "turn_aborted")) {
      ended = true;
      if (type === "task_complete" && turn === root) finalReply = text(p.last_agent_message) || markedFinal;
      break;
    } else if (row.type === "event_msg" && type === "user_message") {
      if (COMMAND.test(text(p.message))) return null;
      user = true;
      prompt ??= text(p.message) || undefined;
    } else if (row.type === "event_msg" && type === "agent_message") {
      const reply = text(p.message);
      if (p.phase === "final_answer") markedFinal = reply || null;
      if (reply) addRecord(events, reply, eventBounds, "replies");
    } else if (row.type === "response_item") {
      if (type === "message" && p.role === "user") {
        const content = messageText(p.content, "input_text");
        if (COMMAND.test(content)) return null;
        if (content) {
          user = true;
          if (!blocks(p.content).some((b) => b.type !== "input_text")) prompt ??= content;
        }
      } else if (type === "message" && p.role === "assistant") {
        const reply = messageText(p.content, "output_text");
        if (p.phase === "final_answer") markedFinal = reply || null;
        if (reply) addRecord(messages, reply, lowerBounds, "replies");
      } else if (type === "function_call" || type === "custom_tool_call") {
        if (text(p.call_id)) addRecord(calls, text(p.call_id), lowerBounds, "calls");
      } else if (type === "function_call_output" || type === "custom_tool_call_output") {
        addResult(calls, results, p.call_id, lowerBounds);
      }
    }
  }
  const replies = messages.size ? messages : events;
  if (!messages.size && eventBounds.has("replies")) lowerBounds.add("replies");
  if (finalReply && !replies.size) addRecord(replies, finalReply, lowerBounds, "replies");
  if (!ended && partial) markPartial(lowerBounds);
  return user && (replies.size || calls.size) ? { prompt, replies: [...replies], calls, results, lowerBounds, finalReply } : null;
}
