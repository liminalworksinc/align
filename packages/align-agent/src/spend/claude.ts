// Claude Code transcript fallback parser (~/.claude/projects/<proj>/<session>.jsonl and <session>/subagents/*.jsonl).
// Ported rules from liminal-desktop session_reader.rs:
// - One line per content block repeats the message usage, so a request is keyed by requestId (else message.id) and
//   the finalized row (non-empty stop_reason) wins; unfinalized rows are kept locally but never uploaded.
// - Subagent transcripts fold into the parent session; they never add root turns.
// - Cache writes keep their 5m/1h tier; an untyped cache-write total is kept as cache_write_unsplit (priced as unpriced).
import path from "node:path";
import type { Counts } from "./prices.ts";
import { count, isoOrNull, type ParsedEvent } from "./events.ts";

export interface ClaudeFileState {
  session_id: string | null;
  prompt_id: string | null;
  subagent: boolean;
  cwd: string | null;
}

export function initClaudeState(file: string): ClaudeFileState {
  const parts = file.split(path.sep);
  const i = parts.lastIndexOf("subagents");
  if (i > 0) return { session_id: parts[i - 1], prompt_id: null, subagent: true, cwd: null };
  return { session_id: path.basename(file, ".jsonl"), prompt_id: null, subagent: false, cwd: null };
}

/** Usage counters from a transcript `message.usage`. null = invalid (unpriced). */
export function claudeCounts(u: unknown): Counts | null {
  if (!u || typeof u !== "object") return null;
  const usage = u as Record<string, unknown>;
  const input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  if (input === null || output === null || Number.isNaN(input) || Number.isNaN(output)) return null;
  const cacheRead = count(usage.cache_read_input_tokens) ?? 0;
  const total = count(usage.cache_creation_input_tokens);
  let w5 = 0;
  let w1 = 0;
  let unsplit = 0;
  const cc = usage.cache_creation;
  if (cc && typeof cc === "object") {
    const d = cc as Record<string, unknown>;
    w5 = count(d.ephemeral_5m_input_tokens) ?? 0;
    w1 = count(d.ephemeral_1h_input_tokens) ?? 0;
    if (total !== null) {
      if (Number.isNaN(total)) return null;
      if (w5 + w1 > total) return null;
      unsplit = total - (w5 + w1);
    }
  } else if (total !== null) {
    unsplit = total;
  }
  const c: Counts = { input, output, cache_read: cacheRead, cache_write_5m: w5, cache_write_1h: w1, cache_write_unsplit: unsplit };
  return Object.values(c).every((n) => Number.isSafeInteger(n) && n >= 0) ? c : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export function parseClaudeLine(line: string, st: ClaudeFileState): ParsedEvent[] {
  if (!line.trim()) return [];
  // Only usage rows and prompt rows matter once the session's cwd is known.
  if ((st.cwd || st.subagent) && !line.includes('"usage"') && !line.includes('"promptId"')) return [];
  let row: Record<string, unknown>;
  try {
    const v = JSON.parse(line);
    if (!v || typeof v !== "object") return [{ kind: "gap", reason: "malformed_line" }];
    row = v as Record<string, unknown>;
  } catch {
    return [{ kind: "gap", reason: "malformed_line" }];
  }
  const out: ParsedEvent[] = [];
  if (!st.subagent) {
    const sid = str(row.sessionId);
    if (sid) st.session_id = sid;
    const cwd = str(row.cwd);
    if (cwd && !st.cwd) {
      st.cwd = cwd;
      if (st.session_id) out.push({ kind: "session", harness: "claude-code", native_session_id: st.session_id, cwd, ts: isoOrNull(row.timestamp) });
    }
  }
  const session = st.session_id;
  if (!session) return out;
  const type = row.type;
  if (type === "user") {
    const pid = str(row.promptId);
    if (pid && !st.subagent && pid !== st.prompt_id && row.isSidechain !== true) {
      st.prompt_id = pid;
      const ts = isoOrNull(row.timestamp);
      if (ts) out.push({ kind: "root_turn", harness: "claude-code", native_session_id: session, root_turn: pid, ts });
    }
    return out;
  }
  if (type !== "assistant") return out;
  const m = row.message && typeof row.message === "object" ? (row.message as Record<string, unknown>) : null;
  if (!m || !m.usage) return out;
  const model = str(m.model);
  if (!model || model === "<synthetic>") return out;
  const reqId = str(row.requestId) || str(row.request_id);
  const msgId = str(m.id);
  const uuid = str(row.uuid);
  const providerId = reqId ? reqId : msgId ? `msg:${msgId}` : uuid ? `uuid:${uuid}` : null;
  if (!providerId) {
    out.push({ kind: "gap", reason: "unkeyed_request" });
    return out;
  }
  const subagent = st.subagent || row.isSidechain === true;
  out.push({
    kind: "request",
    harness: "claude-code",
    provider: "anthropic",
    provider_id: providerId,
    native_session_id: session,
    ts: isoOrNull(row.timestamp),
    model,
    query_source: subagent ? "subagent" : "main",
    counts: claudeCounts(m.usage),
    finalized: typeof m.stop_reason === "string" && m.stop_reason.length > 0,
    root_turn: subagent ? str(row.promptId) : st.prompt_id,
    source: "transcript",
  });
  return out;
}
