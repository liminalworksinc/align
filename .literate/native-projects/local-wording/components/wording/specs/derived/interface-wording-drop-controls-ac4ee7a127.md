# Public interface: wording.drop-controls

## ADDED Requirements

### Requirement: wording.drop-controls

JavaScript module wording/drop_controls exports drop_controls(v:string):string. First replace each CR LF pair and each remaining CR with one LF. Remove Cc control characters U+0000..U+0008, U+000B..U+001F and U+007F..U+009F. Keep tab U+0009, LF U+000A and all other text, preserving order.  These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`
