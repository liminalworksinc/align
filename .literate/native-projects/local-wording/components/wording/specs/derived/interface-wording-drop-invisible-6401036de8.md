# Public interface: wording.drop-invisible

## ADDED Requirements

### Requirement: wording.drop-invisible

JavaScript module wording/drop_invisible exports drop_invisible(v:string):string. Apply drop_controls, then remove Unicode Cf format characters and Cs lone surrogate code units except the following emoji spans. Preserve U+200D only when immediately preceded by an Extended_Pictographic code point optionally followed by exactly one U+FE0E, U+FE0F or U+1F3FB..U+1F3FF code point, and immediately followed by an Extended_Pictographic code point. Preserve each tag span U+E0020..U+E007E of length at least one followed by U+E007F when immediately preceded by an Extended_Pictographic code point optionally followed by U+FE0F. Determine these preserved spans before removing format characters. Apply Unicode properties to code points, so a valid surrogate pair is never removed merely for containing surrogate code units; Cf code points remain subject to the removal rule. Keep all remaining text unchanged.  These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`
