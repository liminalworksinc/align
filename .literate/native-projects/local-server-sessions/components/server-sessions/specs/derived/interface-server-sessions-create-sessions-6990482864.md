# Public interface: server-sessions.create-sessions

## ADDED Requirements

### Requirement: server-sessions.create-sessions

# Shared sessions, epochs and usage

Provide `server-sessions.create-sessions`: a resource-bound service for shared
sessions, binding epochs, usage ingestion, sharing termination, history deletion,
agent stop/resume and the session list. Preserve the complete existing observable
behavior across all twelve public runtime values and both caller-owned public
TypeScript types, SessionRow and EndedReason.

A session belongs to the person and device that shared it. Ownership checks,
re-sharing after membership or device loss, permanent voluntary stop, workspace
and private-goal visibility, idempotent epoch/usage keys, accounting through
sharing gaps, conflict/refused-key distinctions and deletion tombstones must
remain exact. Stop/resume must refuse delivery when the sharing machine cannot
receive it. Owner lists must never expose other people's titles or usage.

All effects pass through the selected target's explicit resources. Preserve
resource capture and call order, identity, arguments, SQL scope, writes, supplied
transaction callbacks and their return values, commit/rollback and postcommit
refusals. Keep native JavaScript property reads, short circuits, nullish choices,
iterators, map/set behavior, errors, async kinds and live clock lookups. No new
validation, permission, retention, recovery, dependency or ambient effect is
introduced by the translation.

The selected Node Flavor specifies the package, exact public metadata, resource
ports, SQL programs, validation and lifecycle behavior. Caller types and typed
forwarding bindings remain caller-owned integration material. Test fixtures,
synthetic data, original implementation and private acceptance commands are not
generation inputs or product data. Local qualification and parent acceptance do
not establish a public release or operator security acceptance.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:71e452a67f41d8f36aab`
