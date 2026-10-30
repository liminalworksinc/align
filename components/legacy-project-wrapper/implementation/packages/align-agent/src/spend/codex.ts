// Codex rollout fallback parser ($CODEX_HOME/sessions/**/rollout-*.jsonl).
// Rule: if a rollout has token_usage_record lines, count only those, deduped by payload.response_id. Otherwise use the
// legacy event_msg token_count path: last_token_usage per response, total_token_usage to drop repeats, and reject a
// cumulative regression. Threads with session_meta.parent_thread_id (subagent, guardian_review) fold into the root
// session (session_meta.session_id). codex-auto-review (guardian) stays unpriced.
import type { Counts } from "./prices.ts";
import { count, isoOrNull, type ParsedEvent, type QuerySource } from "./events.ts";

interface Totals {
  input: number;
  cached: number;
  cache_write: number;
  output: number;
}

export interface CodexFileState {
  native: string | null;
  thread: string | null;
  query_source: QuerySource;
  auto_review: boolean;
  model: string | null;
  root_turn: string | null;
  has_tur: boolean;
  emitted_tc: boolean;
  prev_total: Totals | null;
  group: string;
}

export function initCodexState(group: string): CodexFileState {
  return { native: null, thread: null, query_source: "main", auto_review: false, model: null, root_turn: null, has_tur: false, emitted_tc: false, prev_total: null, group };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function totals(u: unknown): Totals | null {
  if (!u || typeof u !== "object") return null;
  const r = u as Record<string, unknown>;
  const t = {
    input: count(r.input_tokens ?? r.prompt_tokens),
    cached: count(r.cached_input_tokens ?? r.cache_read_input_tokens ?? r.cached_tokens) ?? 0,
    cache_write: count(r.cache_write_input_tokens) ?? 0,
    output: count(r.output_tokens ?? r.completion_tokens),
  };
  if (t.input === null || t.output === null) return null;
  return Object.values(t).every((n) => Number.isSafeInteger(n)) ? (t as Totals) : null;
}

/** OpenAI input_tokens include cached (and cache-write) tokens; split into fresh vs cached. */
export function codexCounts(t: Totals | null): Counts | null {
  if (!t) return null;
  const fresh = t.input - t.cached - t.cache_write;
  if (fresh < 0) return null;
  return { input: fresh, output: t.output, cache_read: t.cached, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: t.cache_write };
}

function classify(meta: Record<string, unknown>): { qs: QuerySource; autoReview: boolean } {
  const src = meta.source;
  const threadSource = str(meta.thread_source);
  const sub = src && typeof src === "object" ? (src as Record<string, unknown>).subagent : null;
  const guardian =
    threadSource === "guardian_review" || (sub && typeof sub === "object" && (sub as Record<string, unknown>).other === "guardian");
  if (guardian) return { qs: "auxiliary", autoReview: true };
  if (threadSource === "subagent" || (sub && typeof sub === "object") || str(meta.parent_thread_id)) return { qs: "subagent", autoReview: false };
  return { qs: "main", autoReview: false };
}

const INTERESTING = ["session_meta", "turn_context", "token_usage_record", "token_count", "task_started"];

export function parseCodexLine(line: string, st: CodexFileState): ParsedEvent[] {
  if (!line.trim()) return [];
  // Most rollout bytes are response items; skip them without parsing.
  if (!INTERESTING.some((k) => line.includes(k))) return [];
  let rec: Record<string, unknown>;
  try {
    const v = JSON.parse(line);
    if (!v || typeof v !== "object") return [{ kind: "gap", reason: "malformed_line" }];
    rec = v as Record<string, unknown>;
  } catch {
    return [{ kind: "gap", reason: "malformed_line" }];
  }
  const payload = rec.payload && typeof rec.payload === "object" ? (rec.payload as Record<string, unknown>) : {};
  const ts = isoOrNull(rec.timestamp);
  const out: ParsedEvent[] = [];
  switch (rec.type) {
    case "session_meta": {
      st.thread = str(payload.id);
      // session_id names the root session for subagent threads; a few child threads repeat their own id there, in
      // which case the parent thread is the fold target.
      const sessionId = str(payload.session_id);
      const parent = str(payload.parent_thread_id);
      st.native = sessionId && (sessionId !== st.thread || !parent) ? sessionId : parent || sessionId || st.thread;
      const c = classify(payload);
      st.query_source = c.qs;
      st.auto_review = c.autoReview;
      if (str(payload.model)) st.model = str(payload.model);
      if (st.native && c.qs === "main") out.push({ kind: "session", harness: "codex", native_session_id: st.native, cwd: str(payload.cwd), ts });
      return out;
    }
    case "turn_context": {
      if (str(payload.model)) st.model = str(payload.model);
      st.root_turn = str(payload.root_turn_id) || str(payload.turn_id) || st.root_turn;
      return out;
    }
    case "token_usage_record": {
      if (!st.native) return [{ kind: "gap", reason: "no_session_meta" }];
      if (!st.has_tur) {
        st.has_tur = true;
        if (st.emitted_tc) out.push({ kind: "retract", group: st.group });
      }
      const responseId = str(payload.response_id);
      if (!responseId) return [...out, { kind: "gap", reason: "unkeyed_request" }];
      const t = totals(payload.usage);
      out.push(usage(st, `resp:${responseId}`, ts, t, str(payload.root_turn_id) || st.root_turn, null, str(payload.model)));
      return out;
    }
    case "event_msg": {
      const kind = payload.type;
      if (kind === "task_started") {
        const turn = str(payload.turn_id);
        const root = str(payload.root_turn_id) || turn;
        if (root) st.root_turn = root;
        if (st.native && st.query_source === "main" && turn && root === turn && ts) {
          out.push({ kind: "root_turn", harness: "codex", native_session_id: st.native, root_turn: turn, ts });
        }
        return out;
      }
      if (kind !== "token_count" || st.has_tur || !st.native) return out;
      const info = payload.info && typeof payload.info === "object" ? (payload.info as Record<string, unknown>) : null;
      if (!info) return out;
      const total = totals(info.total_token_usage);
      const last = totals(info.last_token_usage);
      let counted: Totals | null = last;
      if (total) {
        const prev = st.prev_total;
        if (prev && total.input === prev.input && total.output === prev.output && total.cached === prev.cached && total.cache_write === prev.cache_write) {
          return out; // repeated snapshot of the same response
        }
        if (prev && (total.input < prev.input || total.output < prev.output || total.cached < prev.cached || total.cache_write < prev.cache_write)) {
          st.prev_total = total;
          return [{ kind: "gap", reason: "cumulative_regression" }];
        }
        if (!counted) {
          counted = prev
            ? { input: total.input - prev.input, cached: total.cached - prev.cached, cache_write: total.cache_write - prev.cache_write, output: total.output - prev.output }
            : total;
        }
        st.prev_total = total;
      }
      if (!counted) return out;
      if (counted.input === 0 && counted.output === 0) return out;
      const key = total
        ? `tc:${st.thread}:${total.input}:${total.cached}:${total.output}`
        : `tc:${st.thread}:${ts}:${counted.input}:${counted.cached}:${counted.output}`;
      st.emitted_tc = true;
      out.push(usage(st, key, ts, counted, st.root_turn, st.group, null));
      return out;
    }
    default:
      return out;
  }
}

function usage(
  st: CodexFileState,
  providerId: string,
  ts: string | null,
  t: Totals | null,
  rootTurn: string | null,
  group: string | null,
  modelOverride: string | null,
): ParsedEvent {
  const model = modelOverride || st.model || (st.auto_review ? "codex-auto-review" : "unknown");
  return {
    kind: "request",
    harness: "codex",
    provider: "openai",
    provider_id: providerId,
    native_session_id: st.native as string,
    ts,
    model: st.auto_review ? "codex-auto-review" : model,
    query_source: st.query_source,
    counts: codexCounts(t),
    total_input: t ? t.input : undefined,
    finalized: true,
    root_turn: rootTurn,
    source: "rollout",
    retract_group: group,
  };
}
