# Public interface: home-attention.alignment-waits

## ADDED Requirements

### Requirement: home-attention.alignment-waits

JavaScript module home_attention/alignment_waits exports alignment_waits(a:{state:string,requester:HomePerson,requirements:{approvers:HomePerson[],approved_by:HomePerson|null}[]}):object|null. For countered return a fresh object {next:'accept_counter',waiting_on:[a.requester]}, with a new array holding the original requester object. For every state other than pending return null. For pending, visit requirements in order. Ignore each requirement with truthy approved_by. For every remaining requirement, visit approvers in order and retain the last encountered person object for each exact id, with ordinary JavaScript Map key semantics. Build a new waiting_on array of those retained original person objects, sorted by x.name.localeCompare(y.name), breaking a zero comparison with x.id.localeCompare(y.id), using the runtime's native localeCompare behavior. Return a fresh object {next:'decide',waiting_on}. Never clone person records or mutate input arrays. Duplicate ids select the last person value even across requirements; prototype-like ids remain ordinary keys. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
