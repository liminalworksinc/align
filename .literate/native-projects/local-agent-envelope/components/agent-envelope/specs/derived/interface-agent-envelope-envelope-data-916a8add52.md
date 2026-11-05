# Public interface: agent-envelope.envelope-data

## ADDED Requirements

### Requirement: agent-envelope.envelope-data

JavaScript module agent_envelope/envelope_data exports envelope_data(). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return a fresh ordinary wrapper with exactly the fifteen data names ["ENVELOPE_MAX","ENVELOPE_MAX_WITH_LIMITS","ASKS_MAX","ASK_TEXT_MAX","ASKS_SHOWN","DELTA_MAX","LIMIT_WORDS","CARD_MAX","CARD_MAX_BOTH","TEAM_POINTER","SELF_ELSEWHERE","NAME_NOT_SHARED","SAFE_REQUESTS","GOAL_MARKS","HELD_MARK"]. Their initial values, except SAFE_REQUESTS, are {"ENVELOPE_MAX":1200,"ENVELOPE_MAX_WITH_LIMITS":1800,"ASKS_MAX":2200,"ASK_TEXT_MAX":280,"ASKS_SHOWN":5,"DELTA_MAX":300,"LIMIT_WORDS":{"must":"Must","must_not":"Must not","out_of_scope":"Out of scope"},"CARD_MAX":300,"CARD_MAX_BOTH":450,"TEAM_POINTER":"The user can type `::align team` for details.","SELF_ELSEWHERE":"You, on another machine","NAME_NOT_SHARED":"a file (name not shared)","GOAL_MARKS":"* = you can bind a session to it now.","HELD_MARK":"h = on hold: all agents on it were paused from its Align workspace, so a session bound to it has its tools blocked until the hold is released."}. SAFE_REQUESTS is an ordinary mutable Set initially containing checkpoint and replan, in that order. Every wrapper shares the same LIMIT_WORDS object and SAFE_REQUESTS Set; do not return detached copies, freeze them, reset them on reads or use a private substitute for LIMIT_WORDS in wording. External in-place record changes affect all limit wording immediately. In-place Set changes are visible through every wrapper. Data reads themselves never mutate these objects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
