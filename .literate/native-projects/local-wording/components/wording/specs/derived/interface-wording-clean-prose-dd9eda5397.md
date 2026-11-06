# Public interface: wording.clean-prose

## ADDED Requirements

### Requirement: wording.clean-prose

JavaScript module wording/clean_prose exports clean_prose(v:string):string. Apply drop_invisible, replace every BLANK_FILLERS code point with one ASCII space, then use ECMAScript trim on the result. Preserve interior whitespace and line breaks.  These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`
