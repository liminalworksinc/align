# Public interface: spend-meter.price-request

## ADDED Requirements

### Requirement: spend-meter.price-request

JavaScript module spend_meter/price_request. It exports one function, price_request(model, counts, total_input), that estimates the list price of one model request in micro-US-dollars using integer arithmetic.

A counts object has exactly six integer fields: input (fresh input tokens, excluding cache reads and writes), output, cache_read, cache_write_5m, cache_write_1h and cache_write_unsplit. total_input is a number, or null or undefined meaning not given; it is the provider's full input count (OpenAI input counts include cached tokens).

price_request returns an object with exactly two keys: est_list_usd_micros (an integer or null) and unpriced (null or one of the strings invalid_counters, auto_review_unpriced, unknown_model, untyped_cache_write, long_context_unmodeled). Exactly one of them is null. Rules, checked in this order:
1. If valid_counts(counts) (the spend-meter.valid-counts rule) is false: {est_list_usd_micros: null, unpriced: invalid_counters}.
2. If model is exactly codex-auto-review: {null, auto_review_unpriced} (this model is never priced).
3. Let row = the price_row(model) row (the spend-meter.price-row table). If there is none: {null, unknown_model}.
4. prompt = input + cache_read + cache_write_5m + cache_write_1h + cache_write_unsplit. If row has over and prompt > over.input_tokens (strictly greater), use over.rates as the rates r; otherwise r = row.
5. pico, a BigInt starting at 0, accumulates count times rate as BigInt products: input*r.input + output*r.output + cache_read*r.cache_read.
6. If r.provider is anthropic: if cache_write_unsplit > 0 return {null, untyped_cache_write}; otherwise add cache_write_5m*r.cache_write_5m + cache_write_1h*r.cache_write_1h.
7. If r.provider is openai: total = total_input when it was given (not null or undefined), else input + cache_read + cache_write_unsplit. If total > 272000 return {null, long_context_unmodeled}. Otherwise add (cache_write_unsplit + cache_write_5m + cache_write_1h) * r.cache_write.
8. est_list_usd_micros = Number((pico + 500000n) / 1000000n) (BigInt division truncates), so picodollars are rounded half up to whole micro-dollars once per request; unpriced is null.
It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
