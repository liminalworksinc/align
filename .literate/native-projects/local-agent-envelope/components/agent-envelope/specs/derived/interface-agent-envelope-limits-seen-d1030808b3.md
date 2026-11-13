# Public interface: agent-envelope.limits-seen

## ADDED Requirements

### Requirement: agent-envelope.limits-seen

JavaScript module agent_envelope/limits_seen exports limits_seen(goal). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return [] for a null goal. Otherwise read the first five limits when goal.limits is an array, or none otherwise. Return a new array of new ordinary objects, each with exactly id and text copied verbatim from the corresponding limit. Do not retain a limit object as the returned entry.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
