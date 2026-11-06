# Public interface: wording.counter-no-change

## ADDED Requirements

### Requirement: wording.counter-no-change

JavaScript module wording/counter_no_change exports counter_no_change(baseVersion:number,goalVersion:number):string. When baseVersion===goalVersion return 'This suggestion changes nothing on the goal, so there is nothing to suggest. Change a field to suggest something else, or decline the request.'. Otherwise return 'This suggestion changes nothing on version '+baseVersion+', the version this request was made against (the goal is now at version '+goalVersion+'), so there is nothing to suggest. Change a field to suggest something else, or decline the request.'. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:805177a76f06b199e538`
