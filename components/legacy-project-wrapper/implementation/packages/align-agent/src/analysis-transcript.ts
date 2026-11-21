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
  if (typeof id !== "string" || !id) {
    lowerBounds.add("results");
    return;
  }
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
    let corrupt = false;
    const rows = lines.flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const row = object(JSON.parse(line));
        if (typeof row.type !== "string") corrupt = true;
        return [row];
      } catch {
        corrupt = true;
        return [];
      }
    });
    const partial = end < stat.size || !data.endsWith("\n");
    const content = harness === "claude-code" ? claudeTurn(rows, native, turn, from > 0, partial) : codexTurn(rows, native, turn, from > 0);
    if (corrupt && content) {
      markPartial(content.lowerBounds);
      content.finalReply = null;
    }
    return content;
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
  const prompt = claudePrompt(first, native);
  const root = text(first.promptId) || text(first.uuid);
  const calls = new Set<string>();
  const results = new Set<string>();
  const replies = new Map<string, string>();
  const lowerBounds = new Set<RecordCount>();
  const seen = new Set([text(first.uuid)]);
  const linked = new Set([root, text(first.uuid)].filter(Boolean));
  let finalReply: string | null = null;
  let explicitlyFinal = false;
  let ended = false;
  for (const row of rows.slice(index + 1)) {
    if (row.sessionId !== native || row.isSidechain === true) continue;
    const uuid = text(row.uuid);
    // Streamed assistant rows may share an id and carry different blocks.
    if (uuid && row.type !== "assistant" && seen.has(uuid)) continue;
    if (uuid && row.type !== "assistant") seen.add(uuid);
    const message = object(row.message);
    const promptId = text(row.promptId);
    const parent = text(row.parentUuid);
    const belongs = (!promptId || !root || promptId === root) && (!parent || linked.has(parent));
    if (row.type === "user") {
      const toolResults = blocks(message.content).filter((b) => b.type === "tool_result");
      if (toolResults.length) {
        if (belongs) {
          if (uuid) linked.add(uuid);
          for (const b of toolResults) addResult(calls, results, b.tool_use_id, lowerBounds);
        }
      } else if (messageText(message.content, "text") && (!promptId || promptId !== root || COMMAND.test(messageText(message.content, "text")))) {
        ended = true;
        break;
      }
      continue;
    }
    if (row.type !== "assistant" || !belongs) continue;
    if (uuid) linked.add(uuid);
    const reply = messageText(message.content, "text");
    const identity = text(message.id) || uuid;
    const toolUses = blocks(message.content).filter((b) => b.type === "tool_use");
    const terminal = message.stop_reason === "end_turn" || message.stop_reason === "stop_sequence"
      || row.phase === "final_answer" || message.phase === "final_answer";
    if (terminal && reply && !toolUses.length) {
      finalReply = reply;
      explicitlyFinal = true;
    } else if (toolUses.length || message.stop_reason === "tool_use" || !identity || !replies.has(identity)) {
      finalReply = null;
      explicitlyFinal = false;
    }
    if (reply) {
      const replyKey = identity || reply;
      const earlier = replies.get(replyKey);
      if (earlier !== undefined || replies.size < BLOCKS) {
        if (terminal || !earlier || reply.length > earlier.length) replies.set(replyKey, reply);
      } else lowerBounds.add("replies");
    }
    for (const b of toolUses) {
      if (text(b.id)) addRecord(calls, text(b.id), lowerBounds, "calls");
      else {
        lowerBounds.add("calls");
        lowerBounds.add("results");
      }
    }
  }
  if (!ended && (!explicitlyFinal || partial)) markPartial(lowerBounds);
  return prompt || replies.size || calls.size ? { prompt, replies: [...replies.values()], calls, results, lowerBounds, finalReply: explicitlyFinal ? finalReply : null } : null;
}

function codexTurn(rows: RecordValue[], native: string, reference: TurnReference, cropped: boolean): TurnContent | null {
  let root = reference.root;
  if (root.startsWith("ts:")) {
    const at = Date.parse(reference.at);
    const ids = new Set<string>();
    let active = "";
    let sawEarlier = !cropped;
    for (const row of rows) {
      const payload = object(row.payload);
      const type = payload.type;
      const turnId = text(payload.turn_id);
      const rootId = text(payload.root_turn_id) || turnId;
      if (row.type === "event_msg" && type === "task_started") active = rootId === turnId ? turnId : "";
      if (!active || (rootId && rootId !== active)) continue;
      if (type === "task_complete" || type === "turn_aborted") {
        active = "";
        continue;
      }
      if (type !== "task_started" && type !== "user_message" && !(type === "message" && payload.role === "user")) continue;
      const time = Date.parse(text(row.timestamp));
      if (time < at - 1500) sawEarlier = true;
      if (Math.abs(time - at) <= 1500) ids.add(active);
    }
    if (ids.size !== 1 || !sawEarlier) return null;
    root = ids.values().next().value!;
  }
  const meta = rows.find((r) => r.type === "session_meta");
  if (meta && object(meta.payload).id !== native) return null;
  const calls = new Set<string>();
  const results = new Set<string>();
  const messages = new Map<string, string>();
  const events = new Map<string, string>();
  const lowerBounds = new Set<RecordCount>();
  const eventBounds = new Set<RecordCount>();
  const addReply = (records: Map<string, string>, payload: RecordValue, reply: string, bounds: Set<RecordCount>) => {
    if (!reply) return;
    const id = text(payload.message_id) || text(payload.id);
    const key = id ? `id:${id}` : `text:${reply}`;
    if (records.has(key)) {
      if (payload.phase === "final_answer" || records.get(key)!.length < reply.length) records.set(key, reply);
    } else if (records.size < BLOCKS) records.set(key, reply);
    else bounds.add("replies");
  };
  let complete = false;
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
      if (active && turn !== root) break;
      active = id === root && turn === root;
    } else if (!active || (turn && turn !== root)) {
      continue;
    } else if (row.type === "event_msg" && (type === "task_complete" || type === "turn_aborted")) {
      if (type === "task_complete" && turn === root) {
        complete = true;
        finalReply = text(p.last_agent_message) || markedFinal;
      }
      break;
    } else if (row.type === "event_msg" && type === "user_message") {
      if (COMMAND.test(text(p.message))) return null;
      user = true;
      prompt ??= text(p.message) || undefined;
    } else if (row.type === "event_msg" && type === "agent_message") {
      const reply = text(p.message);
      if (p.phase === "final_answer") markedFinal = reply || null;
      addReply(events, p, reply, eventBounds);
    } else if (row.type === "response_item") {
      if (type === "message" && p.role === "user") {
        const content = messageText(p.content, "input_text");
        if (COMMAND.test(content)) return null;
        if (content) {
          user = true;
          prompt ??= content;
        }
      } else if (type === "message" && p.role === "assistant") {
        const reply = messageText(p.content, "output_text");
        if (p.phase === "final_answer") markedFinal = reply || null;
        addReply(messages, p, reply, lowerBounds);
      } else if (type === "function_call" || type === "custom_tool_call") {
        if (text(p.call_id)) addRecord(calls, text(p.call_id), lowerBounds, "calls");
        else {
          lowerBounds.add("calls");
          lowerBounds.add("results");
        }
      } else if (type === "function_call_output" || type === "custom_tool_call_output") {
        addResult(calls, results, p.call_id, lowerBounds);
      }
    }
  }
  const replies = messages.size ? messages : events;
  if (!messages.size && eventBounds.has("replies")) lowerBounds.add("replies");
  if (finalReply && !replies.size) replies.set("final", finalReply);
  if (!complete) markPartial(lowerBounds);
  return user ? { prompt, replies: [...replies.values()], calls, results, lowerBounds, finalReply } : null;
}
