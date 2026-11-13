# Public interface: wording.is-blank-text

## ADDED Requirements

### Requirement: wording.is-blank-text

JavaScript module wording/is_blank_text exports is_blank_text(v:string):boolean. Apply clean_prose, remove every Unicode M combining mark and ECMAScript whitespace character, and return true exactly when nothing remains. Do not strip visible letters, numbers, symbols or emoji. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`
