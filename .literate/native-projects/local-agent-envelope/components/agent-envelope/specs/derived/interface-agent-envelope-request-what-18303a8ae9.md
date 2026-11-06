# Public interface: agent-envelope.request-what

## ADDED Requirements

### Requirement: agent-envelope.request-what

JavaScript module agent_envelope/request_what exports request_what(r). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. A request has id,type,optional sender{name,role},optional goal{id,title,version},optional target_goal{title},optional note and cancel_reason. Sender is clean(sender?.name,50) || Someone. Goal and target titles are clean of their optional title to 100. Note is quoted(note,280) only when the original note is truthy, otherwise absent. A goal version is Math.trunc(Number(goal?.version)||0). Type and role comparisons are exact and case-sensitive. For switch_goal return "move this session to goal \"{target-title}\"". For checkpoint return "make a checkpoint". Otherwise return "replan toward goal \"{goal-title}\"".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
