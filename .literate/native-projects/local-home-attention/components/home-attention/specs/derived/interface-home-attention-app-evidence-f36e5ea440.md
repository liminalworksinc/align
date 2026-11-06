# Public interface: home-attention.app-evidence

## ADDED Requirements

### Requirement: home-attention.app-evidence

JavaScript module home_attention/app_evidence exports app_evidence(lastReadAt:string|null|undefined):string. Return 'delivery_receipt' exactly when typeof lastReadAt is 'string' and it is nonempty; otherwise return 'not_observed'. A connection time is never substituted for a goal read. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
