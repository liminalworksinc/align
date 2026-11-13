# Public interface: storage-event-integrity.extend-event-integrity-schema

## ADDED Requirements

### Requirement: storage-event-integrity.extend-event-integrity-schema

# Privacy-preserving event attribution integrity

Provide `storage-event-integrity.extend-event-integrity-schema` through a pure
synchronous unary function. Given an array of earlier SQLite migration program
strings, return a fresh mutable array that preserves every input string and its
order exactly and appends one stable nonempty SQL program. Never mutate or freeze
the input. Repeated calls produce independent arrays with identical values. The
appended program does not depend on the number or contents of the prefix. Accept
frozen arrays too. No import-time or call-time database, filesystem, environment,
network or process effect belongs to this library.

The production caller supplies the existing23 programs and executes the result
through its existing transaction-owning migration coordinator as version24. The
new program adds only the attribution trigger specified by the selected target.
It preserves all existing objects, table contents, connection policy and old
append-only enforcement. Do not execute migrations here or add another runtime
dependency. The two already admitted predecessor providers remain separate.

This is an explicitly authored security correction. Existing main does not
already enforce it. Historical migration and event observations stay preserved.
The required privacy redaction, account deletion and retention operations remain
available. The independent qualification contains both unchanged schema
observations and separately labeled authored security requirements.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:429f61ee2a4180881038`
