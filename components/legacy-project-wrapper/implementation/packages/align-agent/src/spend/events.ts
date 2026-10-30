import type { Harness } from "../shared/types.ts";
import type { Counts } from "./prices.ts";

export type QuerySource = "main" | "subagent" | "auxiliary" | "unknown";
export type UsageSource = "transcript" | "rollout";

export interface UsageEvent {
  kind: "request";
  harness: Harness;
  provider: "anthropic" | "openai";
  /** Provider request identity, namespaced: req_..., msg:..., uuid:..., resp_..., tc:... */
  provider_id: string;
  native_session_id: string;
  ts: string | null;
  model: string;
  query_source: QuerySource;
  /** null = counters were missing or invalid; the row is kept but unpriced. */
  counts: Counts | null;
  /** Provider's full input count when it differs from fresh input (OpenAI includes cached tokens). */
  total_input?: number;
  finalized: boolean;
  root_turn: string | null;
  source: UsageSource;
  /** Rows sharing a group can be retracted together (Codex token_count rows once token_usage_record appears). */
  retract_group?: string | null;
  harness_cost_usd_micros?: number | null;
}

export interface RootTurnEvent {
  kind: "root_turn";
  harness: Harness;
  native_session_id: string;
  root_turn: string;
  ts: string;
}

export interface SessionEvent {
  kind: "session";
  harness: Harness;
  native_session_id: string;
  cwd: string | null;
  ts: string | null;
}

export interface GapEvent {
  kind: "gap";
  reason: string;
}

export interface RetractEvent {
  kind: "retract";
  group: string;
}

export type ParsedEvent = UsageEvent | RootTurnEvent | SessionEvent | GapEvent | RetractEvent;

export function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function count(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000_000 ? n : NaN;
}
