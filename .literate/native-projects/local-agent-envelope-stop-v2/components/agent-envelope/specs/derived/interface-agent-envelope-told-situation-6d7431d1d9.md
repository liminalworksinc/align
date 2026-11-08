# Public interface: agent-envelope.told-situation

## ADDED Requirements

### Requirement: agent-envelope.told-situation

JavaScript module agent_envelope/told_situation exports told_situation(key). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Let s be key.slice(0,key.indexOf(colon)), using JavaScript slice behavior when no colon exists. Return live for s exactly started or for key exactly changed:live. Return stopped for s stopped or share_err, or key changed:other. Return s itself when it is out,reshare,noreach. If s is none, return key.slice(5) only when it is exactly live,stopped,out,reshare,noreach. Return null in every other case, including none:hold.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:17a1481125521529c10b`, `evidence:859f04f683f07a21c137`, `evidence:d58b86a2d520d64c97c7`
