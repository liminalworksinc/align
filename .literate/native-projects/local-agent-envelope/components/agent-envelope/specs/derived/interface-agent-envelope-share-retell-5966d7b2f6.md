# Public interface: agent-envelope.share-retell

## ADDED Requirements

### Requirement: agent-envelope.share-retell

JavaScript module agent_envelope/share_retell exports share_retell(id,w,told,fresh,changed=false). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. When changed is truthy, return true exactly when told is absent, told_situation(told.key) is null, told_situation(told.key) differs from told_situation(w.key), or w.tail is truthy and differs from told.tail. Otherwise, if fresh is truthy, told is absent, or told.id differs from id, return fresh verbatim. In the remaining case return whether the prefix of told.key before its first colon differs from that of w.key, or w.tail is truthy and differs from told.tail. Prefix extraction uses slice(0,indexOf(colon)), including its no-colon behavior. Do not compare the full keys or texts in this last case.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
