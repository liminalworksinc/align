# Public interface: wording.launch-words

## ADDED Requirements

### Requirement: wording.launch-words

JavaScript module wording/launch_words exports launch_words(launch:'pending'|'not_yet'|'launched'|'superseded'|null,baseVersion:number,version:number|null):string|null. For pending or not_yet, return 'Approved, agents still on v'+baseVersion+' until launch'. For launched, return 'Launched, agents on v'+(version ?? baseVersion+1). For superseded, return 'Superseded before launch: it never reached agents.'. For every other launch value, including null and undefined, return null. These strings describe delivery, without claiming execution. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:5e963e90498aa5bde460`
