# Public interface: home-attention.data

## ADDED Requirements

### Requirement: home-attention.data

JavaScript module home_attention/data exports data():object. Return a fresh ordinary wrapper with exactly EVIDENCE_CLASSES, EVIDENCE_WORDS and UNLAUNCHED_STATES. EVIDENCE_CLASSES is one shared mutable array initially ['delivery_receipt','agent_reported','not_observed'], in that order. EVIDENCE_WORDS is one shared mutable ordinary object initially {delivery_receipt:'Delivery receipt',agent_reported:'Agent reported',not_observed:'Not observed'}. UNLAUNCHED_STATES is one shared mutable array initially ['pending','not_yet'], in that order. Every wrapper shares those same three underlying objects. In-place changes appear in later wrappers; launch_waits reads the current shared UNLAUNCHED_STATES on each call. Mutating a wrapper's own property bindings never replaces the module objects. Do not return detached copies or a shared wrapper. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
