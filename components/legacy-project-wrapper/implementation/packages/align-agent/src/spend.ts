// Name and type bindings only. Native implementation is materialized during build.
import type {Counts, PriceResult, PriceRow, ParsedEvent, ClaudeFileState, CodexFileState, CodexTotals} from "./spend-types.ts";
export type * from "./spend-types.ts";

const native: Record<string, unknown> = await import(new URL("./native/index.js", import.meta.url).href);
function bind<T>(name: string): T {
  const value = native[name];
  if (typeof value !== "function") throw new Error("Native spend function is missing: " + name);
  return value as T;
}
export const initClaudeState = bind<(file: string) => ClaudeFileState>("init_claude_state");
export const parseClaudeLine = bind<(line: string, state: ClaudeFileState) => ParsedEvent[]>("parse_claude_line");
export const initCodexState = bind<(group: string) => CodexFileState>("init_codex_state");
export const parseCodexLine = bind<(line: string, state: CodexFileState) => ParsedEvent[]>("parse_codex_line");
export const claudeCounts = bind<(usage: unknown) => Counts | null>("claude_counts");
export const codexCounts = bind<(totals: CodexTotals | null) => Counts | null>("codex_counts");
export const count = bind<(value: unknown) => number | null>("count");
export const isoOrNull = bind<(value: unknown) => string | null>("iso_or_null");
export const validCounts = bind<(counts: Counts) => boolean>("valid_counts");
export const priceRequest = bind<(model: string, counts: Counts, totalInputForLongContext?: number) => PriceResult>("price_request");
export const priceRow = bind<(model: string) => PriceRow | null>("price_row");
export const PRICE_TABLE_VERSION = bind<() => string>("price_table_version")();
export const picoToMicros = bind<(pico: bigint) => number>("pico_to_micros");
