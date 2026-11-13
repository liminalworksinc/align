# Public interface: agent-envelope.state-situation

## ADDED Requirements

### Requirement: agent-envelope.state-situation

JavaScript module agent_envelope/state_situation exports state_situation(now). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return live when now.live is truthy. Otherwise return stopped unless now.ended is exactly device_signed_out or access_lost. For those two ends, return hold when both signed_in and unread are truthy. Otherwise, when signed_in is falsy return noreach only for an access_lost end with falsy reaches; return out for the other signed-out cases. When signed_in is truthy, return reshare for truthy reshare, otherwise noreach. Ignore unrelated fields. Accept an optional stopped field on the supplied current state without changing this capability's result; the stop wording is supplied by share_notice and the latch capabilities.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
