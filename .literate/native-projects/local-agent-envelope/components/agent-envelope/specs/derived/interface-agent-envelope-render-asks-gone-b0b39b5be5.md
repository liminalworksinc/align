# Public interface: agent-envelope.render-asks-gone

## ADDED Requirements

### Requirement: agent-envelope.render-asks-gone

JavaScript module agent_envelope/render_asks_gone exports render_asks_gone(ta). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return [Align] Team followed by one space, quoted(ta.team.name,40), then exactly : you are no longer in this team, so its accepted asks are no longer shown here; they were not closed. No added authority. Take the first 300 UTF-16 units.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
