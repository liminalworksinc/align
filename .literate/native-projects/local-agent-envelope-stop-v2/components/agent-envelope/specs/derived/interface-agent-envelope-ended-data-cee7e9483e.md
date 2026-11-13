# Public interface: agent-envelope.ended-data

## ADDED Requirements

### Requirement: agent-envelope.ended-data

JavaScript module agent_envelope/ended_data exports ended_data(). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return a fresh ordinary wrapper with exactly SHARE_CHANGED and STOP_HOLDS_NO_SHARE. SHARE_CHANGED is "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.". STOP_HOLDS_NO_SHARE is "this session was stopped from its Align workspace, and that stop holds after its sharing stopped or its shared history was deleted, so it is not shared again and it stays stopped. A new session is not stopped.". Both values are strings; do not change the public name, wording or punctuation.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
