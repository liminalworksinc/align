# Public interface: wording.counter-same-as-base

## ADDED Requirements

### Requirement: wording.counter-same-as-base

JavaScript module wording/counter_same_as_base exports counter_same_as_base(baseVersion:number,goalVersion:number):string. When baseVersion===goalVersion return 'This suggestion is the same as the request's base; change a field to suggest something.'. Otherwise return 'This suggestion is the same as the request's base, version '+baseVersion+' (the goal is now at version '+goalVersion+'); change a field to suggest something.'. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:805177a76f06b199e538`
