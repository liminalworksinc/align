# Public interface: share-notices.resumed-held

## ADDED Requirements

### Requirement: share-notices.resumed-held

JavaScript module share_notices/resumed_held exports resumed_held(held:string[],reader:'user'|'model'):string. These are synchronous JavaScript functions with no I/O, environment or clock access. Preserve arguments and their enumerable properties. All strings are opaque and case-sensitive, including empty, whitespace, Unicode, newlines, quotes and prototype-like text. Do not trim, normalize or escape strings. The only shared state is the public SHARE_STATE_NOTICES mutable array described by the constants capability. Ordinary function calls never change that array. Return exact raw strings and booleans, with no transport envelope. held contains goal titles. Wrap each title in literal double quotes without escaping its contents. Let n be held.length. For n=0, which is 'a goal hold'. For n>0, which is 'the hold on ' followed by 'goal ' only for the model reader, then the quoted titles: for n=1 use its only title; for n>1 join all but the last title with ', ', append ' and ', and append the last quoted title. Let verb be 'block' when n>1, otherwise 'blocks'. For user, return exactly 'Align: this session was resumed from its Align workspace, so its stop is lifted, but '+which+' still '+verb+' its tools until it is released.'. For model, return exactly '[Align] This session was resumed from its Align workspace, so the stop no longer blocks its tools, but '+which+' still '+verb+' them until it is released. Tell the user and wait for instructions.'. Preserve title order and duplicates. Do not mutate held.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:4dc9c8e9b034c5bb4a92`
