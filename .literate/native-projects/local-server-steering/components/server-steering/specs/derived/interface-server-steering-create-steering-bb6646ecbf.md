# Public interface: server-steering.create-steering

## ADDED Requirements

### Requirement: server-steering.create-steering

# Steering switch and reported steering events

Provide capability server-steering.create-steering as a library. Preserve the
server's existing steering switch, event intake and daily aggregate interfaces.
This service reports uploaded steering events. It does not choose work, change
goal targets, issue directives or establish that weekly allocation improved.

The workspace switch reads on only for an existing row whose steering value is
exactly on; all other stored or missing values read off. A caller that already
checked workspace management permission may write on or off within its own
transaction. Refuse any other value. Update and audit only when the effective
switch changes, and return the requested valid value even for a no-op.

Take batches of at most 100 reported steering events after checking session
sharing permission. Validate the complete batch before starting its transaction.
Each event has a session key, current and suggested goal ids, integer share and
target percentages from zero through one hundred, and a parseable finite time.
Apply the supplied key/id validators. Preserve validation order, repeated reads,
native failures and exact refusal values.

Capture server time after parsing the complete batch. In its transaction,
refuse each event more than five minutes ahead or fourteen days behind, with
its original index and the corresponding clock_skew or too_old reason. At the
exact boundaries it remains eligible. An unknown session, another device's
session, another person's session, or a session whose state is not shared is
refused as not_shared. Do not expose which ownership condition failed.

An eligible event counts as accepted whether or not it was already stored.
Store it idempotently by workspace, session and event time. Return accepted,
refused and captured server_time. For a valid completed batch, accepted plus
refused length equals the number of events. A later validation or write failure
must preserve the original transaction and refusal behavior.

For a reader allowed to read spending, return the workspace's switch and event
counts per UTC day in the optional half-open interval from/to. Scope by
workspace, order days ascending, and sum their counts. Return no goal, session
or person identities in these aggregates. Permission to mutate the workspace
switch remains the caller's existing responsibility.

The caller owns persistence, permissions, clock, validators and audit ports.
Keep public signatures and response field order, identity, nullability, duplicate
handling, transaction effects and failures. Keep four runtime functions and the
existing Steering caller type. No additional eligibility rule or ambient IO is
introduced. The wire contract's agent steering rule and allocation experiment
remain separate consumers and acceptance requirements.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:189341745fb02b49ab98`
