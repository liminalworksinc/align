# Public interface: spend-meter.valid-counts

## ADDED Requirements

### Requirement: spend-meter.valid-counts

JavaScript module spend_meter/valid_counts. It exports one function, valid_counts(counts), that says whether a counts object's counters are all usable.

A counts object has exactly six integer fields: input (fresh input tokens, excluding cache reads and writes), output, cache_read, cache_write_5m, cache_write_1h and cache_write_unsplit. valid_counts(counts) returns true when every own enumerable property value of counts (Object.values) is a number for which Number.isSafeInteger is true, that is >= 0 and <= 1000000000000; otherwise false. An object with no properties returns true. It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
