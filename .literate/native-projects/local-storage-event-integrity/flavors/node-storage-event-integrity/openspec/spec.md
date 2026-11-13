# Node-Storage-Event-Integrity implementation Flavor

## ADDED Requirements

### Requirement: Node schema24 event attribution guard binding [authored:node-storage-event-integrity-v1]

# Node event attribution migration extension

Target Node 20 or later on macOS and Linux. Export the synchronous unary function
`extend_event_integrity_schema` from the dependency-free CommonJS package
`storage_event_integrity/extend_event_integrity_schema`. Its JavaScript function
name is exactly `extend_event_integrity_schema` and its arity is one. The package
contains exactly package.json and extend_event_integrity_schema.js, with package
name storage_event_integrity, type commonjs, and only the export
`./extend_event_integrity_schema` targeting `./extend_event_integrity_schema.js`.
The module exports exactly that named function. Add no dependencies, alternate
exports or extra package files. The ordinary root main.js and generated tests
serve the framework test/smoke protocol and are not product commands.

The input is an ordinary array of earlier SQLite program strings, possibly
frozen. Return a new ordinary mutable array with every prefix value unchanged
and one appended stable SQL string. Calls must not share a mutable result array.
No resources object or runtime effect is needed.

The appended program creates exactly one SQLite trigger named
`v2_events_attribution_guard` on the existing v2_events table. It fires before an
UPDATE mentioning actor or ws_id. It raises ABORT with the exact message
`v2_events attribution is immutable` when either attribution restriction below
is violated. Add no table, index, function, other trigger, PRAGMA, attachment or
other statement. Preserve the existing `v2_events_append_only` trigger exactly,
including its rejection of UPDATE mentioning id, name, at or props even when a
statement assigns the old value. Do not drop or recreate that trigger.

Actor updates are allowed only when the new value is SQLite-IS identical to the
old value or is NULL. A NULL actor cannot acquire another attribution. Account
deletion and retention must still clear identified actors to NULL, including on
already anonymous workspace events.

Workspace attribution updates are allowed when the new value is SQLite-IS
identical to the old value. A changed value is allowed only for the following
one-way privacy redaction, with every condition required:

- The old workspace value names an existing row of v2_workspaces by id.
- The new value is non-NULL and names no existing v2_workspaces row.
- The new text has exactly28 characters, starts with the exact lower-case wsx_
  prefix and has exactly24 lower-case base32 characters from a through z or2
  through7 as its suffix. No other character, suffix length or case is allowed.

A NULL or already anonymous old workspace value cannot acquire a new attribution.
A renamed identified workspace cannot become another identified workspace.
Handle SQL NULL explicitly so three-valued logic cannot permit a forbidden
transition. Keep valid simultaneous actor clearing and workspace redaction.
Multi-event workspace purge must succeed atomically and may use the same
anonymous id for all events of its workspace. A statement touching a forbidden
row must abort its other row changes as SQLite ABORT requires. Actor and workspace
restrictions both apply when one UPDATE mentions both columns.

This trigger does not assert uniqueness across separate anonymous redactions.
A per-row ban on every existing anonymous id would reject the second event of a
valid multi-row purge. The application retains its random anonymous id policy.
Retention DELETE operations remain available. These integrity rules grant no SQL
access or authorization to a caller.

The existing migration coordinator owns execution, foreign-key checks, version
updates and transaction rollback. Fresh stores and upgrades from each version0
through23 must reach24 with every prior row preserved, all earlier objects
unchanged, this one new trigger, and no foreign-key violations. A failed
migration must leave prior schema, rows, version and connection policy intact.
These are authored security changes. Do not describe them as unchanged behavior
already enforced by main or as operator security acceptance.


#### Scenario: One-way privacy redaction and append-only attribution

- **WHEN** the operator-requested schema24 correction is selected
- **THEN** Append exactly the new attribution trigger while preserving all23 predecessor programs, the old immutable-event trigger, account/retention actor clearing, multi-row workspace redaction, foreign keys and migration rollback. Label this as authored corrective intent.
