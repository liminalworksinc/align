# Public interface: wording.wording-data

## ADDED Requirements

### Requirement: wording.wording-data

JavaScript module wording/wording_data exports wording_data():object. Return a fresh ordinary object with exactly BLANK_FILLERS, DEPENDS_ON_MAX and COUNTER_SAME_AS_PROPOSAL. BLANK_FILLERS is the five-character string U+115F U+1160 U+3164 U+FFA0 U+2800 in that order. DEPENDS_ON_MAX is 5. COUNTER_SAME_AS_PROPOSAL is exactly "That's what the proposal already asks for: approve it instead.". Mutating a returned wrapper never changes the next wrapper or any function's behavior. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:805177a76f06b199e538`
