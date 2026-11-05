# Public interface: agent-envelope.share-again-words

## ADDED Requirements

### Requirement: agent-envelope.share-again-words

JavaScript module agent_envelope/share_again_words exports share_again_words(unread,where,there=false,unsent=false). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Build share as `::align share`, followed by one space and where only when where is truthy, then shares it with one space before shares, then there with one space before it only for truthy there, then again with one space before it unless unsent is truthy. If unread is falsy return share. Otherwise prefix it with run `align sync` first (this machine has not yet heard whether its sharing was stopped on the web meanwhile), then followed by one space. Preserve where verbatim.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
