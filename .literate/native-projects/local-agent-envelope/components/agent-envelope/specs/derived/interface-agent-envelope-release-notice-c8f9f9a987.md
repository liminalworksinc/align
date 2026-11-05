# Public interface: agent-envelope.release-notice

## ADDED Requirements

### Requirement: agent-envelope.release-notice

JavaScript module agent_envelope/release_notice exports release_notice(by,title). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Apply end_sentence to the exact template "Align: {by} released the hold on \"{title}\"", substituting clean(by,50) || Someone for by and clean(title,100) for title. Someone is that literal default. Do not replace inner double quotes with apostrophes in this function.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
