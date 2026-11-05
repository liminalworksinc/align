# Public interface: value.span-words

## ADDED Requirements

### Requirement: value.span-words

JavaScript module value_rules/span_words exports span_words(ms:number):string. Return empty for a negative or non-finite number. Compute whole seconds with Math.round(ms/1000). Below 60 seconds, render that number with second/seconds. Otherwise floor seconds/60 into minutes. Below 60 minutes, render minute/minutes only. Otherwise floor minutes/60 into hours. Below 24 hours render hour/hours and, only for a nonzero minutes modulo 60, one space and minute/minutes. Otherwise floor hours/24 into days, render day/days and, only for nonzero hours modulo 24, one space and hour/hours. A unit is singular only when its number is strictly equal to 1. Use ordinary JavaScript numeric division, floor, round, remainder and string coercion, including behavior at fractional thresholds and very large finite values. Never render zero lower units, seconds once in the minutes range, or minutes once in the days range. Synchronous dependency-free JavaScript API. Preserve caller input objects and values without mutation. No network, filesystem, clock or persistent state. Only follow_up_url and follow_up_problem read process.env, and only when their env argument is omitted or undefined. Such calls consult the three named fields afresh on every call; all other functions never read the environment. Preserve ordinary JavaScript strings, UTF-16 code units, non-finite numbers, negative zero and native URL behavior. The shared estimate table is ordinary mutable process-local data; never freeze, clone or reset it. Public functions receive natural JavaScript arguments and return natural values without a JSON transport wrapper.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:857f6f77da51e167b897`
