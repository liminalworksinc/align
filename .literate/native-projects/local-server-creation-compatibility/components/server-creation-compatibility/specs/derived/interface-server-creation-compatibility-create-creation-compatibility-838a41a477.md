# Public interface: server-creation-compatibility.create-creation-compatibility

## ADDED Requirements

### Requirement: server-creation-compatibility.create-creation-compatibility

# Existing tester-code compatibility in v2

Preserve the current v2 creation-code behavior on main. A tester with an unused
invitation from the previous version must be able to redeem an imported code in
v2. Existing current-format codes continue to work. This component owns the
current v2 compatibility declarations, rather than the previous version's
service implementation.

Provide the previous-format predicate and the combined creation-code predicate,
the operator's batch import, and creation-code redemption. The unchanged core
library continues to own its other capabilities. The application facade selects
these four exports from this component.

Validate every import row before performing any database write. Import only
valid previous-format codes. Exclude codes already spent in the previous
version using their plain SHA-256 digest. Preserve existing rows and their
redemption bindings, record a creation event only for a new row, and return the
existing imported, present, used and spent counts. The caller owns the
transaction and recovery decision.

Redemption accepts either existing code format. A successful redemption updates
exactly one unredeemed, unrevoked, unexpired code whose optional email restriction
matches the supplied email. Preserve the secret-bound code hash, normalized email
comparison, return value, clock lookups, helper calls and propagated failures.
This component performs no filesystem, network or process operations.

The original characterization covers 38 port observations and 20 actual SQLite
observations on macOS and SSD-backed Linux. Twelve controlled regressions are
rejected on both hosts. Qualification, complete generated-source review, current
source admission, refreshed workspace-admission behavior, actual caller assembly,
full application and image checks, and normal publication remain required.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:1b46c7b9310358b63219`
