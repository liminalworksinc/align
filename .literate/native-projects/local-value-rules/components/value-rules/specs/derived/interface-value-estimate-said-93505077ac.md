# Public interface: value.estimate-said

## ADDED Requirements

### Requirement: value.estimate-said

JavaScript module value_rules/estimate_said exports estimate_said(id:string):string. Find the first entry in the shared ESTIMATE_WORDS array whose id is strictly equal to the supplied id. Return its current said value when not null or undefined, otherwise return the original id unchanged. Unknown identifiers remain unchanged. In-place row edits, inserted rows, removals and ordering changes in the shared array affect subsequent lookups. Synchronous dependency-free JavaScript API. Preserve caller input objects and values without mutation. No network, filesystem, clock or persistent state. Only follow_up_url and follow_up_problem read process.env, and only when their env argument is omitted or undefined. Such calls consult the three named fields afresh on every call; all other functions never read the environment. Preserve ordinary JavaScript strings, UTF-16 code units, non-finite numbers, negative zero and native URL behavior. The shared estimate table is ordinary mutable process-local data; never freeze, clone or reset it. Public functions receive natural JavaScript arguments and return natural values without a JSON transport wrapper.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:30c5cfa447878002b5f7`, `evidence:857f6f77da51e167b897`
