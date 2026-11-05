# Public interface: agent-envelope.request-answer-line

## ADDED Requirements

### Requirement: agent-envelope.request-answer-line

JavaScript module agent_envelope/request_answer_line exports request_answer_line(r,answer). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. A request has id,type,optional sender{name,role},optional goal{id,title,version},optional target_goal{title},optional note and cancel_reason. Sender is clean(sender?.name,50) || Someone. Goal and target titles are clean of their optional title to 100. Note is quoted(note,280) only when the original note is truthy, otherwise absent. A goal version is Math.trunc(Number(goal?.version)||0). Type and role comparisons are exact and case-sensitive. For answer exactly declined return "[Align] The developer declined {sender}'s request to {request_what(r)}; continue as before.". Otherwise, for r.type exactly replan return "[Align] The developer accepted {sender}'s request to replan toward goal \"{goal-title}\": follow the updated plan.". For every other type return "[Align] The developer accepted {sender}'s request to {request_what(r)}.".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
