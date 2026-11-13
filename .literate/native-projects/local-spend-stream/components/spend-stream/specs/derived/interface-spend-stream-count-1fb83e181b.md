# Public interface: spend-stream.count

## ADDED Requirements

### Requirement: spend-stream.count

JavaScript module spend_stream/count exports count(v), accepting any JavaScript value, including undefined, symbols and bigint. Return null when v is undefined or null. Let n = Number(v) only when v is a string matching /^[0-9]+$/; otherwise let n = v. Return n unchanged exactly when typeof n is number, Number.isSafeInteger(n), n >= 0 and n <= 1000000000000. Otherwise return JavaScript NaN. Preserve negative zero; invalid present input gives NaN, while absent input gives null. Do not throw for symbols or bigint. No side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
