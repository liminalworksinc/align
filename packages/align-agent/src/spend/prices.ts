// List-price estimates. Ported from the liminal ai-spend pack pricing.js (exact match only, no family fallback) and the
// desktop prices.rs integer math. Rates are picodollars per token (USD per MTok * 1e6) so every sum stays integral.
// These are estimates of list price, never a claim of money spent: a subscription session's row says so via `basis`.

export const PRICE_TABLE_VERSION = "align-prices-2026-10-22.2";

interface Row {
  input: number;
  output: number;
  cache_read: number;
  /** Anthropic: typed tiers. */
  cache_write_5m?: number;
  cache_write_1h?: number;
  /** OpenAI: single cache-write tier. */
  cache_write?: number;
  provider: "anthropic" | "openai";
  /** Where the row came from and when it was last read against a source. */
  source: string;
  read: string;
  /** A second rate card for prompts above `input_tokens` (input + cache read + cache write), e.g. Claude Haiku 5.5. */
  over?: { input_tokens: number; rates: Row };
}

const AI_SPEND = "liminal ai-spend pricing.js (operator-maintained table)";
const CLAUDE_API_REF = "Claude API reference (claude-api skill, cached 2026-10-06): models table and Haiku 5.5 migration notes";
const OPENAI_PAGE = "developers.openai.com/api/docs/pricing (per pricing.js)";
const UNVERIFIED = "not re-verified for this table";

const usd = (perMTok: number): number => Math.round(perMTok * 1_000_000);

function anthropic(input: number, output: number, cw5m: number, cw1h: number, cacheRead: number, read = UNVERIFIED, source = AI_SPEND): Row {
  return { provider: "anthropic", input: usd(input), output: usd(output), cache_write_5m: usd(cw5m), cache_write_1h: usd(cw1h), cache_read: usd(cacheRead), source, read };
}
function openai(input: number, output: number, cw: number, cacheRead: number, source = AI_SPEND, read = UNVERIFIED): Row {
  return { provider: "openai", input: usd(input), output: usd(output), cache_write: usd(cw), cache_read: usd(cacheRead), source, read };
}

export const PRICES: Record<string, Row> = {
  "claude-fable-5-1": anthropic(10, 50, 12.5, 20, 0.25),
  "claude-opus-5-5": anthropic(4, 20, 5, 8, 0.2),
  "claude-sonnet-5-5": anthropic(2, 10, 2.5, 4, 0.2, "2026-10-22", CLAUDE_API_REF),
  // Two rate cards by prompt length; cache reads 0.1x input, writes 1.25x (5m) and 2x (1h).
  "claude-haiku-5-5": {
    ...anthropic(0.1, 0.5, 0.125, 0.2, 0.01, "2026-10-22", CLAUDE_API_REF),
    over: { input_tokens: 100_000, rates: anthropic(0.5, 2.5, 0.625, 1, 0.05, "2026-10-22", CLAUDE_API_REF) },
  },
  "claude-opus-5": anthropic(5, 25, 6.25, 10, 0.5),
  "claude-sonnet-5": anthropic(3, 15, 3.75, 6, 0.3),
  "claude-mythos-5": anthropic(10, 50, 12.5, 20, 1.0),
  "claude-opus-4-8": anthropic(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-7": anthropic(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-6": anthropic(5, 25, 6.25, 10, 0.5),
  "claude-opus-4-5": anthropic(5, 25, 6.25, 10, 0.5),
  "claude-sonnet-4-6": anthropic(3, 15, 3.75, 6, 0.3),
  "claude-sonnet-4-5": anthropic(3, 15, 3.75, 6, 0.3),
  "claude-haiku-4-5": anthropic(1, 5, 1.25, 2, 0.1),
  "claude-haiku-4-5-20251001": anthropic(1, 5, 1.25, 2, 0.1),
  "claude-fable-5": anthropic(10, 50, 12.5, 20, 1.0),
  "gpt-5": openai(1.25, 10, 1.25, 0.125),
  "gpt-5-codex": openai(1.25, 10, 1.25, 0.125),
  "gpt-5.5": openai(5, 30, 5, 0.5),
  "gpt-5.5-pro": openai(30, 180, 30, 3),
  "gpt-6-astra": openai(10, 50, 12.5, 1, OPENAI_PAGE, "2026-10-09"),
  "gpt-6-sol": openai(2, 10, 2.5, 0.2, OPENAI_PAGE, "2026-10-09"),
  "gpt-6.1-sol": openai(2, 10, 2.5, 0.1, OPENAI_PAGE, "2026-10-09"),
  "gpt-6-luna": openai(0.1, 0.5, 0.125, 0.01, OPENAI_PAGE, "2026-10-09"),
  "gpt-5.6-sol": openai(4, 20, 5, 0.4, OPENAI_PAGE, "2026-10-09"),
  "gpt-5.6-terra": openai(2, 12, 2.5, 0.2, OPENAI_PAGE, "2026-10-09"),
  "gpt-5.6-luna": openai(0.2, 1.2, 0.25, 0.02, OPENAI_PAGE, "2026-10-09"),
  "o4": openai(15, 60, 18.75, 1.5),
  "o4-mini": openai(1.1, 4.4, 1.1, 0.275),
};

/** Models that must stay unpriced even if a row is ever added by mistake. */
const NEVER_PRICED = new Set(["codex-auto-review"]);
/** OpenAI long-context surcharge above this many input tokens is not modeled, so such rows stay unpriced. */
export const OPENAI_LONG_CONTEXT_INPUT = 272_000;

export interface Counts {
  input: number; // fresh input, excluding cache reads and writes
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_write_unsplit: number;
}

export type UnpricedReason =
  | "unknown_model"
  | "untyped_cache_write"
  | "long_context_unmodeled"
  | "auto_review_unpriced"
  | "invalid_counters";

export interface PriceResult {
  est_list_usd_micros: number | null;
  unpriced: UnpricedReason | null;
}

const MAX_COUNT = 1_000_000_000_000;

export function validCounts(c: Counts): boolean {
  return Object.values(c).every((n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_COUNT);
}

/**
 * Integer picodollar pricing, rounded half-up to micro-USD once per request.
 * `totalInputForLongContext` is the provider's full input count (OpenAI includes cached tokens in input).
 */
export function priceRequest(model: string, c: Counts, totalInputForLongContext?: number): PriceResult {
  if (!validCounts(c)) return { est_list_usd_micros: null, unpriced: "invalid_counters" };
  if (NEVER_PRICED.has(model)) return { est_list_usd_micros: null, unpriced: "auto_review_unpriced" };
  const base = PRICES[model];
  if (!base) return { est_list_usd_micros: null, unpriced: "unknown_model" };
  const prompt = c.input + c.cache_read + c.cache_write_5m + c.cache_write_1h + c.cache_write_unsplit;
  const r = base.over && prompt > base.over.input_tokens ? base.over.rates : base;
  let pico = 0n;
  const add = (n: number, rate: number) => {
    pico += BigInt(n) * BigInt(rate);
  };
  add(c.input, r.input);
  add(c.output, r.output);
  add(c.cache_read, r.cache_read);
  if (r.provider === "anthropic") {
    // An Anthropic cache write without a 5m/1h split fails closed instead of assuming the cheaper tier.
    if (c.cache_write_unsplit > 0) return { est_list_usd_micros: null, unpriced: "untyped_cache_write" };
    add(c.cache_write_5m, r.cache_write_5m ?? 0);
    add(c.cache_write_1h, r.cache_write_1h ?? 0);
  } else {
    const total = totalInputForLongContext ?? c.input + c.cache_read + c.cache_write_unsplit;
    if (total > OPENAI_LONG_CONTEXT_INPUT) return { est_list_usd_micros: null, unpriced: "long_context_unmodeled" };
    add(c.cache_write_unsplit + c.cache_write_5m + c.cache_write_1h, r.cache_write ?? r.input);
  }
  return { est_list_usd_micros: picoToMicros(pico), unpriced: null };
}

export function picoToMicros(pico: bigint): number {
  const PER_MICRO = 1_000_000n;
  return Number((pico + PER_MICRO / 2n) / PER_MICRO);
}

export function priceRow(model: string): Row | null {
  return PRICES[model] ?? null;
}
