# Public interface: home-attention.answer-evidence

## ADDED Requirements

### Requirement: home-attention.answer-evidence

JavaScript module home_attention/answer_evidence exports answer_evidence(state:string,autoAccepted=false):string. Return 'delivery_receipt' for state==='received', or for state==='accepted' with truthy autoAccepted. Otherwise return 'agent_reported' for accepted or declined, and 'not_observed' for every other state. Omitted and explicitly undefined autoAccepted both default to false. Automatic acceptance means delivery and no developer decline, without claiming execution. Synchronous JavaScript functions with no I/O, clock or environment access. Return ordinary values, without a transport envelope. Preserve all arguments, their enumerable properties and nested identities. Strings are opaque, case-sensitive and never trimmed, normalized or parsed as dates. Numbers retain normal JavaScript NaN, infinity, negative-zero and comparison behavior. The only shared mutable module data is the three objects returned by data(); preserve their current contents and identities without resetting or freezing them.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:db975cd75b3f694a27a9`
