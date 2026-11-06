# Public interface: agent-envelope.out-of-reach-words

## ADDED Requirements

### Requirement: agent-envelope.out-of-reach-words

JavaScript module agent_envelope/out_of_reach_words exports out_of_reach_words(ws,lid,latched). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return exactly "this session was shared with {workspace}, and this machine can't reach {workspace} in Align now, so this session can't be shared there again from here, and it is never shared into another workspace instead; its usage stays on this machine.", using clean(ws,80) for both workspace slots. Append latch_notice_tail(lid,false) only when latched is truthy, preserving its leading space.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
