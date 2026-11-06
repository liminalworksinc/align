# Public interface: agent-envelope.bound-context-note

## ADDED Requirements

### Requirement: agent-envelope.bound-context-note

JavaScript module agent_envelope/bound_context_note exports bound_context_note(context). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Collect parent entries in input order as double-quoted clean(goal.title,80), then a space and (v{Math.trunc(Number(version)||0)}); do the same for depends entries. Ignore other rel values. Return null if both lists are empty. Add a contributes to clause for parents and depends on clause for dependencies, each followed by one space and that list joined with space-and-space. Join these clauses with comma-space-and-space. The text is "[Align] This goal {clauses}; their changes also arrive as [Align] notes. No added authority.". If it fits in 300 units, return it. Otherwise return text.slice(0,300-24).trimEnd() followed by "... No added authority.".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
