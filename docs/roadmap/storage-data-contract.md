# Storage data contract work

- **Status:** active
- **Owning queue item:** [ADOPT-002](active-work.md#adopt-002)
- **Completion / archival evidence:** pending while ADOPT-002 remains open
- **Design status:** proposed; retained storage remains release authority

B12 follows the verified sixteen-library checkpoint `bb2605c`. The next transfer
needs an explicit data contract before database-dependent behavior can be
replaced. This work covers Align's domain schema and migration behavior. Better
Auth's full schema remains with B13; the referenced external IDs are explicit
cross-boundary dependencies.

## Baseline and limits

The [machine-readable observation](../architecture/storage-schema-observation.json)
records the current SQLite representation. It is a diagnostic baseline, not an
accepted Component or Flavor and not generation input. Native generation must use
reviewed intent, target requirements and authored acceptance contracts.

The TypeScript parser extracts the 22 literal migration strings without
executing the retained module. SQLite then executes those statements in isolated
memory databases. Snapshots cover versions 0 through 22. Twenty-three empty
starting-schema checks converge to the same final schema with no foreign-key
violations. Those inventory observations cover schema shape only.

A separate [retained-runtime probe](../architecture/storage-runtime-observation.json)
transpiles the unchanged original module and executes its public functions in an
isolated process. All 27 cases pass: 23 empty historical upgrades, connection and
file-mode checks, future-version handling, failed-migration rollback, and an
observer control that detects a dropped index. Dependencies bind only the owned
fixture directory, the observed schema-version constant, the actual qualified
wording function and the actual Node SQLite driver. That 27-case observation is
unchanged. The additional baselines below cover stored-data upgrades,
transactions, constraints and recovery. Full auth-schema qualification remains
outside B12. The full storage boundary remains unqualified.

The external auth fixtures provide only empty `ba_user.id` and `ba_passkey.id`
entities referenced by domain constraints. They do not replace or qualify Better
Auth's real migrations or sign-in behavior.

The final shape has 48 tables, 420 columns, 71 foreign-key constraints represented
by 117 field-pair rows, 96 indexes including SQLite's automatic indexes, and one
trigger. The observed runtime is Node 26.3.0, SQLite 3.53.2 and TypeScript 5.9.3.

## Authority and proposed transfer

- Component intent owns entities, identities, relationships, validity, lifecycle
  transitions, atomic effects and upgrade invariants. Existing product contracts
  remain in `specs/align/workspaces.md`, `goals-and-proposals.md`, `directives.md`,
  `local-agent.md`, `mcp.md` and `metrics.md`.
- SQLite representation, the Node driver, connection settings, filesystem modes
  and module packaging belong to target requirements in Flavors. Preserve the
  current physical names while retained clients query them directly.
- The first proposed executable boundary is the numbered migration coordinator.
  It owns version ordering, transaction boundaries, reference-check ordering and
  failure cleanup. A target adapter owns the actual database operations. The 22
  historical SQL bodies remain retained source during this transfer; they are
  neither reclassified as assets nor passed to generation. Qualifying the
  coordinator will leave the schema representation and SQL history open.
- Existing storage and typed clients remain authoritative until independent
  acceptance, two clean regenerative builds, actual consumer parity, the full
  application workflow and the hosted image checks pass.
- The sixteen qualified library registrations, source caches, public bindings and
  acceptance inputs remain unchanged while this contract is prepared.

## Additional retained-runtime baselines

All fixtures use owned scratch databases and synthetic records. They execute the
unchanged retained module with the actual SQLite driver. They exercise storage
semantics, not full business authorization or sign-in behavior.

| Baseline | Passing evidence | Limits |
| --- | --- | --- |
| Populated upgrades | All 22 starting versions; 2,440 preserved rows, 1,342 added-column checks and 16 approved-launch backfill checks | Each table present at the starting version has fixture data in two workspaces; this is not every possible row combination |
| Transactions and helpers | 13 cases; exact statement caching, callback and error identity, rollback, nesting, real lock release, 101-attempt busy exhaustion and concurrent busy callers | Observed thenable and foreign-realm Promise behavior is retained separately from the synchronous callback requirement |
| Constraints | 144 cases: 129 rejected and 15 allowed; 71 foreign-key groups, 17 cross-workspace cases, cascades, partial uniqueness, JSON-object events and append-only event fields | Shared columns can participate in several foreign keys; the probes do not claim causal isolation of all 71 constraints |
| Recovery and observers | Seven cases: failures at versions 2, 12 and 22 preserve earlier commits; a populated version-12 failure rolls back both rebuilds and sequence changes; a fresh process reopens all data; row and sequence changes are detected | Failure injection uses owned schema collisions; it does not simulate power loss |

The populated fixtures preserve existing column values and AUTOINCREMENT history,
including a deleted high sequence value of 9,000,000. Newly introduced columns
match their defaults. The version-13 backfill changes only previously approved
change requests to launched, preserving their approving person and decision time.
The version-14 read timestamp remains null rather than inferred from use.

The recovery fixture closes both handles before starting a fresh process. The new
process verifies the same row and sequence digest, schema version, connection
settings and fresh statement cache. Reopening tightens the fixture directory from
0755 to 0700 and its database from 0644 to 0600; WAL and SHM files are 0600.

Diagnostic report identities, recorded independently of generation:

- Populated upgrades: `sha256:45a9782626be18d416126742b22349f1a67f02e3ea2ea20c6431815669642889`.
- Transactions: `sha256:6a154fe83f118cd290015f5951df31aeefa1ac4fa388867e3236a3cb37d6960e`.
- Constraints: `sha256:00d5bc3996175785969f0cb0c4800b99550bc8ae2a787f5ecefd7df4ee116453`.
- Recovery: `sha256:e116d8735c49c7e71e5d059facd73cd7ca81b66e3bb0297584aec4b511fb39c6`.

The complete application workflow also passes 1,825 checks, zero failures and
zero skips with the new diagnostic documents present. The normal receipt update
records `sha256:629d7609a0b7f25b0b130e7df1a68f67d2341655c018aaa99dc92f1f4cbedd78`.
The current runtime and CI-pinned runtime each verify authority, locks and that
receipt, with only the two declared optional gates skipped. That baseline's
application and image inputs match the published sixteen-library checkpoint.

## Runtime compatibility requirements

The current `db.ts` opens one shared file through two connections. Auth uses a
5,000 ms busy timeout; the domain connection uses zero and retries a busy
`BEGIN IMMEDIATE` asynchronously. Domain callbacks run synchronously, with nested
calls joining the outer transaction. Return values, errors, rollback,
statement caching, process-wide connection reuse and the retry boundary are now
baselined. A same-realm native Promise returned by a callback is rejected and
rolled back. The original accepts a thenable or foreign-realm Promise and commits
before asynchronous assimilation. Preserve this observed distinction during a
compatibility transfer; a later change needs its own intent and acceptance review.

The database uses WAL, foreign keys and normal synchronous mode. Its directory
is 0700; the database and existing WAL/SHM files are set to 0600. Startup runs auth
migrations before domain migrations and waits for initialization before serving
routes. Keep those requirements distinct from domain DDL observations.

Each historical domain migration has its own immediate transaction. The version
advances only after the SQL and foreign-key check succeed. Foreign-key
configuration is restored when migration fails. Preserve row data, cross-workspace
references, cascade behavior, unique partial indexes, event immutability and
AUTOINCREMENT history through table rebuilds.

The original migration runner leaves schema version 23 unchanged and performs no
DDL. Keep that observed future-version no-op distinct from the operator script's
exact-version requirement. A failed version-22 migration restores foreign keys,
preserves version 21 and its prior row, and removes the newly created table by
rollback. These are captured compatibility observations, not a new server refusal.

## Acceptance checklist

- [x] Freeze retained migration data and source identities for the current checkpoint.
- [x] Inventory every schema version and the final tables, columns, indexes, foreign keys and trigger.
- [x] Check that all 23 empty starting schemas converge to the same final shape.
- [ ] Derive reviewed portable entity and upgrade semantics, with target mapping owned by Flavors.
- [x] Execute the original migration runner in isolated files for all 23 empty starting versions and match the schema inventory.
- [x] Cover stored-data upgrades from every historical version, including each table rebuild and launch backfill, using the populated fixtures and scope stated above.
- [x] Capture failed final-migration rollback, foreign-key restoration, current-version no-op and future-version no-op. The failed upgrade preserves version 21 and its fixture row, and rolls back the new version-22 table.
- [x] Capture process-wide connection reuse, separate auth/domain handles, WAL and synchronous settings, 5,000/0 ms busy timeouts, 0700 directories and 0600 database/WAL/SHM files.
- [x] Cover transaction callbacks, nesting, errors, busy retry, exhaustion, fresh-process reopen and statement-cache behavior.
- [x] Cover constraints with meaningful invalid and cross-workspace records, cascades, unique partial indexes, event immutability and sequence preservation, within the probe limits above.
- [x] Cover committed partial progress, populated table-rebuild rollback and ordinary retry after a migration failure.
- [x] Freeze the migration coordinator's portable interface and target adapter obligations, including cleanup-error precedence, before generation.
- [x] Freeze independent coordinator acceptance before generation: 645 observations in 21 batches and 13 controls, matching macOS and Linux Node 24.22.2. Schema-wide native acceptance remains separate.
- [ ] Review remaining schema/storage authority classes and the logical data contract before their release-authority transfer.
- [x] Complete normal coordinator qualification, public registration, consumer integration and full application/image parity.
- [ ] Complete the remaining schema and storage boundaries under their own accepted contracts.

### Migration coordinator preparation

The exact retained `migrate` function is extracted without modification from
`db.ts` lines 1107 through 1131 at checkpoint `bb2605c`. Its digest is
`sha256:e4c493e2e1a34e3810f2a13e17e94304abdff2555b2b99698e4dcb5e42eac12f`.
The normal attestation, static derivation, source-bound contract review and
standalone acceptance have completed. The source-free project selects JavaScript
and macOS, with the optional inherited build-system default removed through
ordinary acceptance. Both independent clean builds pass all 645 observations in
21 batches, and their generated test suites pass three and five cases. The
qualified projection is
`sha256:aa4019970b62fc7b81b7934b9c06c4de558a387c84cb50cf4848d69c22e26b45`;
the decision is
`sha256:ff577fe200c00850159d3e7f8e13d84fdbd354459988148a883ef1e585f9caaf`.
The separately admitted build passes three generated tests and all 21 independent
batches. Public registration preserves all sixteen earlier registry records and
the bytes, modes and modification times of 2,956 tracked child files. Parent and
child verification pass three gates with two declared optional skips. The target
adapter passes all 213 actual-consumer checks: 27 schema/runtime cases, 22 populated
upgrade paths, 13 transaction/helper cases, 144 constraints and seven recovery
cases. The 22 SQL bodies remain byte-for-byte unchanged. Web admission passes all
302 batches across eleven libraries. The source scope has 398 members with no
unmapped paths. The full build, test and package workflow passes all 1,825 checks
with zero failures or skips, including the unchanged 150 ms p95 latency gate.
The source identity is unchanged across all three phases:
`sha256:d2dbe6225b533cd493bd7a183bc6cd22a1451ea111b59d7dd4430d2f927c991c`.
The current receipt is
`sha256:5e61ae0fe5bebdf1b28e1ff2112135628f34d8d601ef99dcbd46444507da5547`.
The same 398 source members feed an isolated image snapshot. All 24 image checks
and ten additional header checks pass on image
`sha256:92cdc39975b11d2783f14ed96c92ffc7e7ac39ec96c60422fd86d097500a9c51`.
This checkpoint is local and awaits specific commit/publication approval.

The same 213 consumer cases also pass on Linux arm64 with Node 24.22.2 and SQLite
3.53.4. That run uses a read-only copy of the actual source and native packages,
owned temporary fixture storage, and no network. It is consumer compatibility
evidence, not a separate claim of Linux regenerative qualification or complete
authentication coverage.

The reviewed capability `storage-upgrade.apply-migrations` receives synchronous
store callbacks. It owns only numbered change ordering, one transaction per
change, reference-check and version-write ordering, cleanup and completion.
The target adapter supplies database operations and reference-error wording.
Historical SQL is excluded from the generation inputs and remains retained.
Connection management, auth, filesystem finishing and transaction callbacks are
outside this coordinator's authority.

The verifier executes that exact retained function with authored minimal schemas
and actual SQLite. It checks current and future no-ops, every operation's failure,
original error identity, broken references, committed partial progress, rollback,
reference restoration and finishing. A rollback error replaces the original
failure; an enabling error replaces either. These observations differ from the
transaction helper's best-effort rollback, which preserves its original error.

The profile and verifier were frozen before candidate generation. The profile has
identity `sha256:55dff8c03e2a9cd0378d6477c32db7272052a786193ce594421abfb64c5306e9`;
the verifier has identity
`sha256:a0f3bb77bf73c4092fe5e161688b21625c263d456e899a3f1cc5244895d19ec1`.
The repository helpers reproduce the same profile and all 13 controls pass.
This coordinator baseline uses minimal schema fixtures; the earlier full-module
historical-schema and populated-record observations remain distinct.

## Final table inventory

The counts below are observations of the SQLite target. The linked JSON retains
column definitions, foreign-key field pairs, index metadata and trigger text for
review. Index totals include automatic primary-key and uniqueness indexes.

| Table | Columns | Foreign-key constraints | Indexes | Triggers |
| --- | ---: | ---: | ---: | ---: |
| `v2_access_requests` | 11 | 0 | 3 | 0 |
| `v2_activity` | 12 | 2 | 2 | 0 |
| `v2_alignment_approvals` | 5 | 1 | 1 | 0 |
| `v2_alignment_revisions` | 9 | 1 | 2 | 0 |
| `v2_alignment_sessions` | 4 | 2 | 2 | 0 |
| `v2_alignments` | 12 | 3 | 2 | 0 |
| `v2_ask_mentions` | 8 | 1 | 1 | 0 |
| `v2_asks` | 15 | 3 | 4 | 0 |
| `v2_audit` | 6 | 0 | 1 | 0 |
| `v2_change_request_evidence` | 10 | 2 | 2 | 0 |
| `v2_change_request_revisions` | 12 | 1 | 1 | 0 |
| `v2_change_requests` | 21 | 2 | 4 | 0 |
| `v2_creation_codes` | 10 | 0 | 3 | 0 |
| `v2_deleted_sessions` | 3 | 1 | 1 | 0 |
| `v2_device_grants` | 2 | 2 | 1 | 0 |
| `v2_device_requests` | 14 | 1 | 3 | 0 |
| `v2_device_tokens` | 6 | 1 | 2 | 0 |
| `v2_devices` | 9 | 1 | 2 | 0 |
| `v2_directive_targets` | 3 | 2 | 3 | 0 |
| `v2_directives` | 10 | 2 | 2 | 0 |
| `v2_epochs` | 12 | 3 | 2 | 0 |
| `v2_events` | 6 | 0 | 5 | 1 |
| `v2_former_members` | 5 | 1 | 2 | 0 |
| `v2_goal_acks` | 5 | 2 | 1 | 0 |
| `v2_goal_holds` | 6 | 2 | 1 | 0 |
| `v2_goal_versions` | 13 | 1 | 1 | 0 |
| `v2_goals` | 16 | 2 | 3 | 0 |
| `v2_invites` | 12 | 1 | 3 | 0 |
| `v2_members` | 4 | 2 | 2 | 0 |
| `v2_oauth_goal_sends` | 5 | 2 | 2 | 0 |
| `v2_oauth_grants` | 14 | 2 | 2 | 0 |
| `v2_passkey_prompt_dismissed` | 2 | 1 | 1 | 0 |
| `v2_passkey_use` | 2 | 1 | 1 | 0 |
| `v2_pod_members` | 5 | 2 | 1 | 0 |
| `v2_pods` | 4 | 1 | 2 | 0 |
| `v2_rate_hits` | 2 | 0 | 2 | 0 |
| `v2_reallocation_approvals` | 6 | 1 | 1 | 0 |
| `v2_reallocation_revisions` | 7 | 1 | 1 | 0 |
| `v2_reallocations` | 13 | 1 | 3 | 0 |
| `v2_receipts` | 7 | 1 | 1 | 0 |
| `v2_request_targets` | 7 | 2 | 2 | 0 |
| `v2_requests` | 13 | 4 | 4 | 0 |
| `v2_sessions` | 18 | 4 | 3 | 0 |
| `v2_spend_rollups` | 14 | 1 | 1 | 0 |
| `v2_steering_events` | 8 | 2 | 2 | 0 |
| `v2_usage` | 18 | 1 | 2 | 0 |
| `v2_value_reports` | 8 | 2 | 2 | 0 |
| `v2_workspaces` | 6 | 0 | 1 | 0 |

## History checkpoints

Each row records the schema after that migration. The retained source also
contains data transformations; an empty schema cannot establish their parity.

| Version | Tables | Added tables | Changed tables |
| --- | ---: | --- | --- |
| 1 | 22 | `v2_alignment_approvals`, `v2_alignment_revisions`, `v2_alignment_sessions`, `v2_alignments`, `v2_audit`, `v2_device_grants`, `v2_device_requests`, `v2_device_tokens`, `v2_devices`, `v2_directive_targets`, `v2_directives`, `v2_epochs`, `v2_goal_versions`, `v2_goals`, `v2_invites`, `v2_members`, `v2_pod_members`, `v2_pods`, `v2_receipts`, `v2_sessions`, `v2_usage`, `v2_workspaces` | none |
| 2 | 24 | `v2_activity`, `v2_goal_acks` | `v2_goal_versions`, `v2_goals` |
| 3 | 24 | none | `v2_alignments`, `v2_audit`, `v2_goals`, `v2_invites`, `v2_sessions` |
| 4 | 25 | `v2_oauth_grants` | none |
| 5 | 27 | `v2_change_request_revisions`, `v2_change_requests` | none |
| 6 | 29 | `v2_former_members`, `v2_spend_rollups` | `v2_sessions`, `v2_workspaces` |
| 7 | 31 | `v2_passkey_prompt_dismissed`, `v2_passkey_use` | none |
| 8 | 34 | `v2_access_requests`, `v2_creation_codes`, `v2_rate_hits` | none |
| 9 | 35 | `v2_change_request_evidence` | `v2_change_request_revisions`, `v2_change_requests`, `v2_oauth_grants` |
| 10 | 36 | `v2_events` | none |
| 11 | 39 | `v2_ask_mentions`, `v2_asks`, `v2_value_reports` | `v2_events`, `v2_goal_versions`, `v2_goals` |
| 12 | 42 | `v2_goal_holds`, `v2_request_targets`, `v2_requests` | `v2_directives`, `v2_events`, `v2_receipts` |
| 13 | 42 | none | `v2_change_request_revisions`, `v2_change_requests`, `v2_events` |
| 14 | 42 | none | `v2_oauth_grants` |
| 15 | 46 | `v2_reallocation_approvals`, `v2_reallocation_revisions`, `v2_reallocations`, `v2_steering_events` | `v2_goal_versions`, `v2_goals`, `v2_workspaces` |
| 16 | 46 | none | `v2_sessions` |
| 17 | 46 | none | `v2_sessions` |
| 18 | 46 | none | `v2_request_targets` |
| 19 | 47 | `v2_deleted_sessions` | none |
| 20 | 47 | none | `v2_device_requests` |
| 21 | 47 | none | `v2_devices` |
| 22 | 48 | `v2_oauth_goal_sends` | none |

## Frozen identities

- Retained `db.ts`: `sha256:43959ae8034598b41d86cf0d77079654c81957a712b0ad05df537718cdaa8977`
- Retained `core.mts`: `sha256:aa3ce3dafef8b8ccb6ae18685ef82543a078562036596f3869d0b3dd926f4d06`
- Final observed schema: `sha256:da3d5c34300aa32a410ace14869321924b7813bc0fc124adf5901bc23dc4911b`

Only the named migration coordinator has qualified. The full schema, historical
SQL and remaining storage behavior retain source authority; the current consumer
transfer passes its complete parity checks. Checkpoint publication and the
remaining storage work stay open.
