# Public interface: home-attention.app-status-words

## ADDED Requirements

### Requirement: home-attention.app-status-words

JavaScript module home_attention/app_status_words exports app_status_words(a:{approved_at:string,last_used_at:string|null,last_read_at:string|null},at:(iso:string)=>string):string. If a.last_read_at is truthy, call at(a.last_read_at) exactly once and return 'Read the goals '+its result. Otherwise if a.last_used_at is truthy, call at(a.last_used_at) exactly once and return 'Connected '+its result+', no goal read seen yet'. Otherwise call at(a.approved_at) exactly once and return 'Approved '+its result+', no goal read seen yet'. Preserve normal template-string coercion of the callback's result. Propagate any callback error unchanged. Do not format unused timestamps or inspect a goal version. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
