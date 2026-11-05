# Public interface: agent-envelope.stopped-for-good-words

## ADDED Requirements

### Requirement: agent-envelope.stopped-for-good-words

JavaScript module agent_envelope/stopped_for_good_words exports stopped_for_good_words(lid,then). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return exactly "this session's sharing was stopped (`::align unshare`, `align stop-sharing` or Stop sharing on the web), and a session whose sharing was stopped is not shared again, so it stays stopped. To share it again, counting from now, first delete its shared history (it leaves every total): run `align delete-history {id}` in a terminal, or use Delete shared history on the web's Sessions page; then {then}.", using lid.slice(0,8) for id and then verbatim.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
