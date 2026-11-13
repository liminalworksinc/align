// Retained consumer data contracts for the qualified native spend libraries.
import type {Harness} from "./shared/types.ts";

export interface Counts {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_write_unsplit: number;
}
export type UnpricedReason = "unknown_model" | "untyped_cache_write" | "long_context_unmodeled" | "auto_review_unpriced" | "invalid_counters";
export interface PriceResult { est_list_usd_micros: number | null; unpriced: UnpricedReason | null; }
export interface PriceRow {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m?: number;
  cache_write_1h?: number;
  cache_write?: number;
  provider: "anthropic" | "openai";
  source: string;
  read: string;
  over?: {input_tokens: number; rates: PriceRow};
}
export type QuerySource = "main" | "subagent" | "auxiliary" | "unknown";
export type UsageSource = "transcript" | "rollout";
export interface UsageEvent {
  kind: "request";
  harness: Harness;
  provider: "anthropic" | "openai";
  provider_id: string;
  native_session_id: string;
  ts: string | null;
  model: string;
  query_source: QuerySource;
  counts: Counts | null;
  total_input?: number;
  finalized: boolean;
  root_turn: string | null;
  source: UsageSource;
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
export interface GapEvent { kind: "gap"; reason: string; }
export interface RetractEvent { kind: "retract"; group: string; }
export type ParsedEvent = UsageEvent | RootTurnEvent | SessionEvent | GapEvent | RetractEvent;
export interface ClaudeFileState {
  session_id: string | null;
  prompt_id: string | null;
  subagent: boolean;
  cwd: string | null;
  other_cwds?: string[];
}
export interface CodexTotals { input: number; cached: number; cache_write: number; output: number; }
export interface CodexFileState {
  native: string | null;
  thread: string | null;
  query_source: QuerySource;
  auto_review: boolean;
  model: string | null;
  root_turn: string | null;
  has_tur: boolean;
  emitted_tc: boolean;
  prev_total: CodexTotals | null;
  group: string;
  cwd?: string | null;
  other_cwds?: string[];
}
