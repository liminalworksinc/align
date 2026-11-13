# Public interface: agent-envelope.hold-reason

## ADDED Requirements

### Requirement: agent-envelope.hold-reason

JavaScript module agent_envelope/hold_reason exports hold_reason(latch). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Let h be the first latch.holds entry only when latch exists and holds is an array. If h is falsy return "Align: all agents on this session's goal were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved.". Otherwise reason is ": {quoted(h.reason,200)}" only when h.reason is truthy. More is " (and {latch.holds.length-1} more goal holds)" only when more than one hold exists. Apply end_sentence to "Align: {by} paused all agents on goal \"{title}\"{reason}{more}", using clean(h.by,50) || Someone and clean(h.goal_title,100). Append " Work resumes when they release it." unless latch.ended is truthy and latch.release is falsy. Always finish with " Your work so far is saved.".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
