# Public interface: agent-envelope.limit-change

## ADDED Requirements

### Requirement: agent-envelope.limit-change

JavaScript module agent_envelope/limit_change exports limit_change(goal,seen). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Let now be the first five goal.limits entries when that value is an array, or [] otherwise. Let before be seen or []. Added entries are the original now objects for which no before entry has both the same id and same text. Removed entries are the original before objects whose id occurs nowhere in now. A reworded id is added but is not removed. Preserve order, duplicates and object reference identity. Return null when both lists are empty, otherwise a new ordinary object with exactly added and removed arrays.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
