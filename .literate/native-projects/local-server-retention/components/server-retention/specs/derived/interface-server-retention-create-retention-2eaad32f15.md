# Public interface: server-retention.create-retention

## ADDED Requirements

### Requirement: server-retention.create-retention

# Retention and identity erasure

Supply the existing idempotent retention job, former-member identity operations and
server scheduling behavior. Preserve the established data-lifetime obligations,
deadline inclusivity, report counts and failure behavior. This migration adds no new
retention policy, operator authority or public endpoint.

The caller supplies storage, transactions, deletion, identity pseudonyms, time,
configuration, scheduling, logging and owned process state. Retention operates only
on caller-provided data. It must not discover credentials, start a real timer, open a
database, inspect the host environment or use a global clock outside those ports.

A deleted workspace is purged at the restore deadline. Old sessions are summarized
without person or session identity before deletion. Requests to agents expire before
session rollup can remove their last delivery. Departed members are pseudonymised in
one workspace after their grace period unless membership has resumed. Account
deletion can request the same erasure immediately inside its own transaction.
Pseudonymisation updates every declared person reference, nested approval and
directive identity, removes identifying invitations and removes that person's keyed
actor from events of that workspace. Other workspaces remain unaffected.

Apply the audit, verification, sign-in, activity, invitation, access-request, event,
closed-ask, value-report, request and deleted-session-marker lifetimes exactly as
declared. Calendar months retain calendar-month arithmetic. Some deadlines are
inclusive and others strictly earlier; the target contract states each. Open or
accepted asks are not closed asks. A goal hold has no automatic expiry.

Each real-run step has its own caller transaction. A dry run executes the same steps
in one transaction and deliberately rolls it back, returning the counts it would
have applied. It must preserve file bytes, data and caller-visible failure identity.
An unexpected error is not mistaken for the private dry-run rollback signal.

The server adapter always awaits an initial run. It keeps one process-owned periodic
timer and does not keep the process alive just for that timer. Empty counts stay
quiet. Hosted failures log only the error name; local failures preserve the existing
diagnostic value. Failure of a logged run does not prevent the existing scheduling
behavior. Operator command parsing and authorization remain separate caller work.


This capability binds the retention core and identity-erasure operations. The scheduling factory is a separate capability.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7eebee63d9fceebb9c59`, `evidence:b0311d7a6df6e1708429`
