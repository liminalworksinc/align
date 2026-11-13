# Public interface: rate-limits.create-limiter

## ADDED Requirements

### Requirement: rate-limits.create-limiter

# Bound rate limiting

Capability `rate-limits.create-limiter` supplies a limiter bound to an explicitly
owned memory store, durable hit store, clock, signer and rate-limit error provider.
The selected target defines the constructor, concrete representations and public
names. The application retains its existing exported interface.

Binding performs no clock, signing or durable-store operations. Retain the
supplied store and dependency references. Instances bound to the same memory
store observe the same admissions; different stores remain independent.
Replacing a binding record's properties later does not reconfigure an existing
instance. Its operations remain callable independently of a method receiver.

## Memory admission and retry

Preserve exact text keys without normalization. A hit counts when its age is
strictly less than the requested window. Equality at the cutoff expires it.
Future hits continue to count when time moves backward.

Single-key admission refuses a full key with the existing rate-limit error.
Otherwise it retains that key's live hits and records the supplied time. A
successful admission moves the key to the end of insertion order. The store
holds at most 10,000 keys; admitting a key that needs space removes the earliest
remaining key. If the owner supplies or leaves the store above capacity, a
successful admission of a key removes as many oldest remaining keys as needed to
restore the bound before recording that hit. A refusal or retry query does not
change order or stored hits.

Batch admission checks every constraint against the initial state. Any full
constraint refuses the entire batch without effects. Success updates constraints
in input order, each using its initially filtered hits. Identical duplicates
therefore record one new hit. For one key with different windows, the final
occurrence determines its stored filtered list. An empty batch succeeds without
state effects.

Retry calculation does not change state. For each full constraint, return the
time until enough counted hits expire for admission. Preserve out-of-order
timestamps and return the longest required wait across constraints. Return zero
when every constraint has room, including an empty list.

## Durable accounting

Room and retry queries are read-only. Room checks stop at the first full
constraint. An exact cutoff does not count; future timestamps still count.
Retry calculation uses the newest hits up to the requested maximum and returns
the longest required wait. Empty room and retry queries issue no store calls and
return true and zero respectively.

Counting first removes all hits at or before the 24-hour retention cutoff, then
appends one hit for each constraint occurrence in input order. Empty counting
still prunes. Duplicate keys and timestamps remain separate durable records.

Durable admission checks room before counting. Refusal preserves all rows,
including expired ones. Successful empty admission still prunes. The caller owns
the transaction and rollback. Successful memory admission remains recorded when
a later durable or caller operation rolls back.

## Time, signing and errors

An omitted or undefined operation time samples the bound clock once before
effects. An explicit time suppresses that sample. Internal operation calls reuse
the sampled time. Clock and other dependency failures retain their original
identity and the established partial-effect and short-circuit behavior.

The OTP address key signs the exact payload `alo.` followed by the supplied email
and prefixes the returned value with `otp-email-hour:`. The access-request key
uses payload prefix `ala.` and result prefix `access-email:`. Preserve input text
without normalization and delegate signing to its existing owner.

Single-key memory refusal uses the existing qualified error constructor, status
429, code `rate_limited` and message `Too many requests, try again later`.
Boolean admission operations retain their original success/refusal meanings.

The reviewed caller domain uses positive integer maxima and windows up to 24
hours. This precondition introduces no new validation or refusal for other
runtime values. Preserve all separately frozen source observations.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:f75e33ee36cd56a587b0`
