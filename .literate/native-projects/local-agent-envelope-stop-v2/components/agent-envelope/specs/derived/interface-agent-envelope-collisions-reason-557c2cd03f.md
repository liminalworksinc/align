# Public interface: agent-envelope.collisions-reason

## ADDED Requirements

### Requirement: agent-envelope.collisions-reason

JavaScript module agent_envelope/collisions_reason exports collisions_reason(hits). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. For a harness exactly codex the label is Codex, otherwise Claude Code. Use short_id(harness,id). Let ago be less than a minute ago when minutesAgo < 1, otherwise the unmodified number followed by " min ago". For one hit return collision_reason using its harness,id,file,minutesAgo. Otherwise take the first four hits in order and form parts from "{label} session {short-id} edited {clean(file,80)} {ago}". For more than four hits join all four parts with comma-space, then append space-and-space, hits.length-4 and space-more. For at most four, join all but the last part with comma-space, append space-and-space and the last part. Preserve JavaScript's undefined interpolation for the last part of an empty list. Count distinct raw file strings over all hits, without cleaning; use files when more than one exists, otherwise file. Return "Align: {list}, all working toward the same goal. Read the {file-word} again so you keep their changes, then retry this edit.".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
