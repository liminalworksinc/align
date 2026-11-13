# Public interface: wording.count

## ADDED Requirements

### Requirement: wording.count

JavaScript module wording/count exports count(n:number,one:string,many?:string,fmt?:(n:number)=>string):string. Default many as plural does and fmt to the native String function only when omitted or undefined. Invoke fmt(n) exactly once, then concatenate its result, one ASCII space, and plural(n,one,many). These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:58d5c56c917e67d5a63d`
