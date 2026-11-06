# Public interface: value.value-data

## ADDED Requirements

### Requirement: value.value-data

JavaScript module value_rules/value_data exports value_data():object. Return a new ordinary wrapper with exactly ESTIMATE_WORDS, VALUE_QUESTION, VALUE_NOTE_MAX and VALUE_EDIT_DAYS as enumerable own properties. VALUE_QUESTION is exactly 'Before Align, how long would getting this decision usually take?', VALUE_NOTE_MAX is the number 500 and VALUE_EDIT_DAYS is the number 7. ESTIMATE_WORDS is the same shared mutable array in every wrapper and in estimate_said. Its initial five ordinary mutable row objects, in order, are {id:'same_day',label:'Same day',said:'same day'}, {id:'two_to_three_days',label:'2–3 days',said:'2–3 days'}, {id:'about_a_week',label:'About a week',said:'about a week'}, {id:'longer',label:'Longer',said:'longer than a week'}, and {id:'would_not_be_decided',label:'It wouldn’t get decided',said:'it wouldn’t get decided'}. Wrapper property replacements do not change later wrappers or exported scalars. In-place mutation of the array or its rows remains visible in later wrappers and estimate_said. Never deep-copy or freeze the array/rows, and never reset them when the getter or lookup runs. Synchronous dependency-free JavaScript API. Preserve caller input objects and values without mutation. No network, filesystem, clock or persistent state. Only follow_up_url and follow_up_problem read process.env, and only when their env argument is omitted or undefined. Such calls consult the three named fields afresh on every call; all other functions never read the environment. Preserve ordinary JavaScript strings, UTF-16 code units, non-finite numbers, negative zero and native URL behavior. The shared estimate table is ordinary mutable process-local data; never freeze, clone or reset it. Public functions receive natural JavaScript arguments and return natural values without a JSON transport wrapper.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:857f6f77da51e167b897`
