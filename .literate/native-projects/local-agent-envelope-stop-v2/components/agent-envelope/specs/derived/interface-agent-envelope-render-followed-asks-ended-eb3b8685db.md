# Public interface: agent-envelope.render-followed-asks-ended

## ADDED Requirements

### Requirement: agent-envelope.render-followed-asks-ended

JavaScript module agent_envelope/render_followed_asks_ended exports render_followed_asks_ended(team). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return exactly [Align] This session no longer follows a goal of team followed by one space, quoted(team,40), then , so that team's accepted asks given earlier no longer apply to it; they were not closed. No added authority. Take the first 300 UTF-16 units.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
