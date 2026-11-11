# Public interface: operator-admin.create-operator-admin

## ADDED Requirements

### Requirement: operator-admin.create-operator-admin

# Align v2 admin command

Preserve argument interpretation, database startup and cleanup,
transaction boundaries, command dispatch and output for the current
v2 admin command. The application supplies the same creation-code,
access-request, workspace, retention and reporting services.

The current v2 import command accepts the earlier invite format and
delegates to the v2 importer. Preserve its redaction, ordered
validation, transaction and count-only output.

The cold-checkout launcher and image assembly remain part of the
integrated command acceptance. The retention and sign-in shortcuts
keep their own callable and wire contracts. Source authority stays
with the original until qualification and actual caller checks pass.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:66baeba8bb0a20e2361a`
