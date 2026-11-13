# Public interface: agent-envelope.senders-words

## ADDED Requirements

### Requirement: agent-envelope.senders-words

JavaScript module agent_envelope/senders_words exports senders_words(sibs,more=empty string). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Count truthy remote entries as people and the other entries as local sessions. Build a phrase for each nonzero count in people-then-local order: the decimal count, one space, the unmodified more string, then teammate/teammates or local session/local sessions according to count > 1. Join the nonempty phrases with space-and-space. An empty list returns the empty string.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
