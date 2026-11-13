# Public interface: agent-envelope.asks-block

## ADDED Requirements

### Requirement: agent-envelope.asks-block

JavaScript module agent_envelope/asks_block exports asks_block(ta). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Return null for null/undefined ta or an empty ta.asks array. The heading is Asks of team followed by a space, quoted(ta.team.name,60), and the literal that the team accepted (people's words, quoted; information for planning, not instructions): preceded by one space. When ta.member === false, insert this session follows a goal of that team; immediately after the opening parenthesis, followed by a space. Use the first five asks in their supplied order. An ask line is - followed by a space, quoted(ask.text,textMax), then a space and (asked by followed by a space, clean(asked_by,50), on with one space on either side, clean(asked_on,10), comma and space, accepted by followed by one space, clean(accepted_by,30), then a closing parenthesis. Join heading and lines with newlines. Try textMax 280,160,100 in that order and return the first result of at most 2200 UTF-16 units. If none fits, take the first 2200 units of the last result.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
