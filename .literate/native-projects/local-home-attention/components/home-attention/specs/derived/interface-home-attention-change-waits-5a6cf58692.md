# Public interface: home-attention.change-waits

## ADDED Requirements

### Requirement: home-attention.change-waits

JavaScript module home_attention/change_waits exports change_waits(v:{state:string,behind:boolean,requester:HomePerson,approvers:HomePerson[],dependency_loop?:string|null}):object|null. HomePerson has id and name strings, with opaque additional properties. For state==='countered', return a fresh ordinary object {next:'accept_counter',waiting_on:[v.requester]}; its new one-element array contains the original requester object. For every state other than pending, return null. For pending with truthy behind, return {next:'rebase',waiting_on:[v.requester]}, preserving that object alias. Otherwise return {next:'resolve_loop',waiting_on:v.approvers} when dependency_loop is truthy, or {next:'decide',waiting_on:v.approvers} otherwise. In both cases waiting_on is the exact caller-supplied array, not a copy. Keep the stated priority: countered, non-pending, behind, dependency loop, ordinary decision. Never mutate or sort the approvers. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
