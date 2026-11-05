# Public interface: spend-stream.iso-or-null

## ADDED Requirements

### Requirement: spend-stream.iso-or-null

JavaScript module spend_stream/iso_or_null exports iso_or_null(v). If v is not a string or is empty, return null. Otherwise t = Date.parse(v) using the ECMAScript built-in; return new Date(t).toISOString() if Number.isFinite(t), else null. Use those native semantics, including timezone offsets and native date normalization; do not invent a stricter parser. No side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
