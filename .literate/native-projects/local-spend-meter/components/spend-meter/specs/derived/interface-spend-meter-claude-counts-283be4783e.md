# Public interface: spend-meter.claude-counts

## ADDED Requirements

### Requirement: spend-meter.claude-counts

JavaScript module spend_meter/claude_counts. It exports one function, claude_counts(usage), that turns a Claude Code transcript's message.usage value into a counts object, or null when the counters are missing or invalid.

A counts object has exactly six integer fields: input (fresh input tokens, excluding cache reads and writes), output, cache_read, cache_write_5m, cache_write_1h and cache_write_unsplit. The helper count(v) used below: when v is undefined or null it gives null (absent). When v is a string made only of one or more ASCII digits 0-9 it is first converted with Number(v). The result (or v itself when it was not such a string) is accepted only if it is a JavaScript number that Number.isSafeInteger accepts, is >= 0 and is <= 1000000000000; then count gives that number. Any other value (a negative number, a fraction, a boolean, an object, a string with any non-digit character, a number above 1000000000000) gives NaN (present but invalid).

claude_counts(usage): if usage is not a non-null object, return null. input = count(usage.input_tokens), output = count(usage.output_tokens); if either is null or NaN return null. cache_read = count(usage.cache_read_input_tokens), with null replaced by 0 (NaN stays NaN). total = count(usage.cache_creation_input_tokens). Let w5 = w1 = unsplit = 0. If usage.cache_creation is a non-null object d: w5 = count(d.ephemeral_5m_input_tokens) with null replaced by 0, w1 = count(d.ephemeral_1h_input_tokens) with null replaced by 0; then if total is not null: if total is NaN return null; if w5 + w1 > total return null; unsplit = total - (w5 + w1). Otherwise (no cache_creation object) if total is not null, unsplit = total. The result is {input, output, cache_read, cache_write_5m: w5, cache_write_1h: w1, cache_write_unsplit: unsplit}, returned only if every one of its six values is a safe integer >= 0; otherwise null (so any NaN gives null). It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
