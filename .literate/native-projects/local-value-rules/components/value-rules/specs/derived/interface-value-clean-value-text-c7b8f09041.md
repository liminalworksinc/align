# Public interface: value.clean-value-text

## ADDED Requirements

### Requirement: value.clean-value-text

JavaScript module value_rules/clean_value_text exports clean_value_text(s:string):string. First remove control characters U+0000..U+0008, U+000B, U+000C, U+000E..U+001F and U+007F..U+009F. Apply the following prose cleaning: normalize CR LF and remaining CR to one LF; remove remaining Cc controls other than tab and LF; remove Unicode Cf format characters and Cs lone surrogate code units, while preserving two emoji cases computed before removal. Preserve U+200D only when immediately preceded by an Extended_Pictographic code point with optionally one U+FE0E, U+FE0F or U+1F3FB..U+1F3FF, and immediately followed by an Extended_Pictographic code point. Preserve a span of one or more U+E0020..U+E007E followed by U+E007F when preceded by an Extended_Pictographic code point optionally followed by U+FE0F. Use Unicode properties on code points, preserving valid surrogate pairs. Replace each U+115F, U+1160, U+3164, U+FFA0 and U+2800 blank filler with an ASCII space, then ECMAScript-trim the result. Collapse every nonempty ECMAScript whitespace run to one ASCII space and trim again. Return empty when the cleaned result contains only Unicode combining marks (property M) and whitespace; otherwise return the cleaned text. Do not normalize accents, case, punctuation, emoji or other visible characters, and do not truncate to VALUE_NOTE_MAX. Synchronous dependency-free JavaScript API. Preserve caller input objects and values without mutation. No network, filesystem, clock or persistent state. Only follow_up_url and follow_up_problem read process.env, and only when their env argument is omitted or undefined. Such calls consult the three named fields afresh on every call; all other functions never read the environment. Preserve ordinary JavaScript strings, UTF-16 code units, non-finite numbers, negative zero and native URL behavior. The shared estimate table is ordinary mutable process-local data; never freeze, clone or reset it. Public functions receive natural JavaScript arguments and return natural values without a JSON transport wrapper.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:857f6f77da51e167b897`
