# Public interface: agent-envelope.ended-why-words

## ADDED Requirements

### Requirement: agent-envelope.ended-why-words

JavaScript module agent_envelope/ended_why_words exports ended_why_words(why,again,relogin=false,brief=false). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. For why exactly device_signed_out and truthy relogin, return a new sign-in on this machine (`align login`) ended its share from the earlier sign-in. Otherwise let out be this machine signed out when brief is truthy, or this machine signed out of Align otherwise. For device_signed_out return out, plus , and is signed in again now only when again is truthy. For access_lost return this machine lost access to its Align workspace, and can reach it again now when again is truthy, otherwise this machine no longer has access to its Align workspace. For every other why return the Align server no longer has this session's share.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
