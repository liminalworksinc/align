# Public interface: wording.depends-on-full

## ADDED Requirements

### Requirement: wording.depends-on-full

JavaScript module wording/depends_on_full exports depends_on_full(ticked:number,hidden:number):string|null. Return null when ticked+hidden<5. Otherwise return 'A goal can depend on at most 5 other goals'+also+'. Untick one to choose another.'. also is empty when hidden is falsy; for hidden===1 it is ' (1 of them a goal you can't see, which stays)'; otherwise it is ' ('+hidden+' of them goals you can't see, which stay)'. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:805177a76f06b199e538`
