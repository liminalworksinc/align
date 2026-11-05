# Public interface: agent-envelope.clean

## ADDED Requirements

### Requirement: agent-envelope.clean

JavaScript module agent_envelope/clean exports clean(text,max). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Convert text by String(text ?? empty string). Replace every UTF-16 character in U+0000 through U+001F, U+007F through U+009F, U+2028 and U+2029 with one space. Replace every opening square bracket followed by zero or more JavaScript whitespace characters and case-insensitive align with the literal (Align; do not require a closing bracket or word boundary. Collapse each JavaScript whitespace run to one ASCII space and trim both ends. If the resulting UTF-16 length exceeds max, return its slice(0,max-3), with trailing whitespace removed, followed by three periods; otherwise return it. Preserve JavaScript slice behavior for zero, small and negative max values. Do not normalize Unicode or alter other punctuation.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
