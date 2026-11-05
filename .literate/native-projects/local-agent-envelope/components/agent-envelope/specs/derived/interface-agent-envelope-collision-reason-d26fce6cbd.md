# Public interface: agent-envelope.collision-reason

## ADDED Requirements

### Requirement: agent-envelope.collision-reason

JavaScript module agent_envelope/collision_reason exports collision_reason(harness,id,file,minutesAgo). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. For a harness exactly codex the label is Codex, otherwise Claude Code. Use short_id(harness,id). Let ago be less than a minute ago when minutesAgo < 1, otherwise the unmodified number followed by " min ago". Return "Align: {label} session {short-id}, working toward the same goal, edited {file} {ago}. Read the file again so you keep its changes, then retry this edit.", substituting clean(file,80).

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
