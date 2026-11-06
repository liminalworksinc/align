# Public interface: wording.with-hidden

## ADDED Requirements

### Requirement: wording.with-hidden

JavaScript module wording/with_hidden exports with_hidden(names:string[],hidden:number):string. When hidden is falsy, return names joined with ', '. With a truthy hidden and no names, return hidden_goals(hidden). Otherwise join names with ', ', append ' and ', then '1 other goal' for hidden===1 or String(hidden)+' other goals' otherwise, and append ' you can't see'. Preserve name order and duplicates.  These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:805177a76f06b199e538`
