# Public interface: home-attention.launch-waits

## ADDED Requirements

### Requirement: home-attention.launch-waits

JavaScript module home_attention/launch_waits exports launch_waits(v:unknown):object|null. Return null unless v is truthy and typeof v==='object', v.state==='approved', typeof v.launch==='string', and the current shared UNLAUNCHED_STATES includes v.launch. Arrays with these properties are objects too. On acceptance return a fresh ordinary object with exactly {state:v.launch,can_launch,launchers}. Read can as v.can.launch only when v.can is truthy and typeof v.can==='object'; otherwise it is undefined. can_launch is true only for can===true, never for 1 or 'true'. If v.launchers is not an array, launchers is a new empty array. Otherwise keep, in input order and with duplicates, each truthy element whose typeof is 'object' and whose id and name are both strings. Elements may be arrays with those properties. Map each accepted element to a fresh ordinary {id:p.id,name:p.name} record, dropping every other property and retaining no record aliases to input. The result's state preserves the exact accepted string, including values externally added to UNLAUNCHED_STATES. A frozen private list cannot substitute for that shared array. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
