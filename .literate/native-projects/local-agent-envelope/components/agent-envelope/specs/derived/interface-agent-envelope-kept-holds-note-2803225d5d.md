# Public interface: agent-envelope.kept-holds-note

## ADDED Requirements

### Requirement: agent-envelope.kept-holds-note

JavaScript module agent_envelope/kept_holds_note exports kept_holds_note(titles). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return the empty string for no titles. Otherwise put literal double quotes around clean(title,100) for every title, without replacing inner quote characters. For one title, which is The hold on {quoted-title} still blocks. For multiple, which is The holds on {all-but-last joined with comma-space} and {last} still block. Return exactly " {which} this session's tools until {released} released: moving to another goal does not lift {pronoun}.", where released is it is for one title or they are for multiple, and pronoun is it or them respectively. Preserve the leading space and all title order/duplicates.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
