# Public interface: agent-envelope.short-id

## ADDED Requirements

### Requirement: agent-envelope.short-id

JavaScript module agent_envelope/short_id exports short_id(harness,id). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Convert id to a string. For a harness other than exactly codex, return clean(the first eight UTF-16 units,20). For codex, first remove every hyphen. If that entire result contains at least nine ASCII hexadecimal digits and nothing else, use its last eight digits with their original case; otherwise use the last eight UTF-16 units of the original string. Return clean(that suffix,20).

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
