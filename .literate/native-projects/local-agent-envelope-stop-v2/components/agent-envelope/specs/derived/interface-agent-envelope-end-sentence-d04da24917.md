# Public interface: agent-envelope.end-sentence

## ADDED Requirements

### Requirement: agent-envelope.end-sentence

JavaScript module agent_envelope/end_sentence exports end_sentence(text). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return text unchanged when it ends in an ASCII period, exclamation point or question mark followed only by zero or more ASCII double quotes U+0022, apostrophes U+0027 or closing parentheses U+0029. Otherwise append one ASCII period. Do not trim text first. Empty text becomes a period.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
