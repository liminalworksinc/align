# Public interface: spend-stream.codex-counts

## ADDED Requirements

### Requirement: spend-stream.codex-counts

JavaScript module spend_stream/codex_counts exports codex_counts(t). t is null or an object with four JavaScript number fields input, cached, cache_write and output. If t is null return null. Otherwise fresh = t.input - t.cached - t.cache_write using ordinary JavaScript Number arithmetic. If fresh < 0 return null. Otherwise return exactly {input: fresh, output: t.output, cache_read: t.cached, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: t.cache_write}. Do not validate, clamp, round or coerce these fields beyond that subtraction and negative comparison. Fractional, negative, infinite and NaN number fields keep their JavaScript arithmetic behavior. Do not mutate t. No side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
