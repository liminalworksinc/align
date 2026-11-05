# Public interface: wording.counter-same-as-request

## ADDED Requirements

### Requirement: wording.counter-same-as-request

JavaScript module wording/counter_same_as_request exports counter_same_as_request(requester:string,baseVersion:number,goalVersion:number):string. When baseVersion===goalVersion return 'That's what the request already asks for: approve it instead.'. Otherwise return 'That's what the request already asks for: approve it once '+requester+' updates it to version '+goalVersion+'.'. Preserve requester verbatim. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:805177a76f06b199e538`
