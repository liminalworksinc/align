# Node-Sqlite-Storage implementation Flavor

## ADDED Requirements

### Requirement: Node SQLite storage resource binding [authored:node-sqlite-storage-contract-v1]

# Node SQLite storage binding


The JavaScript library module `storage_runtime/create_store` exports
`create_store(context)` with one required parameter. It returns the existing
database adapter surface below. It uses caller-supplied real resources and no
runtime package dependencies. Target the application's Node 24 or newer runtime
on macOS and Linux.

## Resources

The context contains these ordinary production dependencies, rather than test
selectors:

| Member | Role |
| --- | --- |
| `dataDir()` | Read the application's current data directory |
| `shared` | The caller's shared process storage object |
| `DatabaseSync` | The actual Node SQLite constructor |
| `join(...parts)` | The Node path join function |
| `existsSync(path)` | The Node filesystem existence function |
| `mkdirSync(path, options)` | The Node directory creation function |
| `chmodSync(path, mode)` | The Node permission function |
| `random()` | The caller's current random fraction |
| `setTimeout(callback, milliseconds)` | The actual scheduling resource |
| `schemaVersion` | The existing core schema version |
| `changePrograms()` | The qualified schema program provider |
| `applyMigrations(resources)` | The qualified migration coordinator |
| `count(number, noun)` | The qualified wording function |

Capture supplied references and the schema version at binding. Call
`changePrograms` once, retaining its returned program array. If its length differs
from `schemaVersion`, throw an Error with the existing diagnostic:
`lib/v2/core.mts SCHEMA_VERSION is <expected>, but there are <count> migrations`.
No storage or filesystem operation precedes this check. Do not read ambient
configuration, environment, filesystem, database, scheduling or entropy sources.
Ordinary JavaScript language primitives remain available.

## Public surface

Each operation retains the shown function name and required arity and works as a
bare function. The `sql` record contains the exact `run`, `get` and `all` function
objects, in that declaration order.

| Name | Required arity | Result |
| --- | --- | --- |
| `dbDir` | 0 | Current configured directory joined with `v2` |
| `dbFile` | 0 | Current database directory joined with `align.sqlite` |
| `openDb` | 0 | The shared connection bundle |
| `authDb` | 0 | The bundle's authentication connection |
| `all` | 1 | Actual driver row array |
| `get` | 1 | Actual driver row or `undefined` |
| `run` | 1 | Driver change count converted to a JavaScript number |
| `exec` | 1 | `undefined` after direct execution |
| `tx` | 1 | A native Promise for callback completion |
| `migrate` | 0 | Synchronous completion with `undefined` |
| `LIVE_WS` | 1 | Existing query condition text |
| `audit` | 5 | `undefined` after recording the event |

`all`, `get` and `run` accept one SQL string followed by the original bound values.
Keep native null-prototype rows, `Uint8Array` blobs, nulls, absent-row semantics
and statement read options, including `setReadBigInts(true)`. Do not serialize
rows or convert a native driver failure into a new error.

## SQLite resources and cache

Use `shared.__alignV2Db` for existing cross-bundle connection compatibility. Its
bundle has exactly `file`, `domain`, `auth` and `stmts`; `stmts` is an actual Map
from exact SQL text to actual StatementSync resources. Keep the same bundle and
handles across service bindings that share this object. Keep nesting state per
binding, rather than adding it to the shared bundle.

Initialize only when no cached bundle is available. Create the database directory
recursively with mode `0700`, then explicitly apply that directory mode. Open
authentication first and application second against the same file. Each constructor receives `enableForeignKeyConstraints: true` and its explicit numeric `timeout` option, 5000 for authentication and 0 for application. Preserve these constructor options as well as the subsequent connection settings. Keep these connection settings:

| Setting | Authentication | Application |
| --- | --- | --- |
| Journal mode | WAL | WAL |
| Foreign keys | Enabled | Enabled |
| Busy timeout | 5,000 ms | 0 ms |
| Synchronous mode | NORMAL | NORMAL |

After opening each connection, protect the database and its `-wal` and `-shm`
sidecars in that order. For each existing path, attempt mode `0600`; catch a
per-file failure and continue to the next path. Directory setup failures propagate.
Publish the bundle only after both connections and their initialization steps
succeed. Preserve a constructor failure and permit a later fresh initialization.
Do not silently reopen a caller-closed cached connection.

Prepare SQL once per exact string, store it in the shared Map, and call the actual
statement methods with their original receiver. Keep the same statement for
different parameter values and for `get` versus `all` of the same SQL text.
Call the actual application's connection for direct execution. Preserve every
driver result and error identity.

## Transaction binding

The application write boundary uses SQLite's immediate transaction mode. Commit
on a permitted successful callback result and attempt rollback on callback or
commit failure. Suppress a rollback failure while retaining the original failure.
Restore local depth even when work or cleanup fails. Nested calls from this
binding execute inside the existing boundary.

A busy start has a numeric `errcode` exactly equal to 5, or its diagnostic text contains case-insensitive `SQLITE_BUSY` or `database is locked`. Obtain that diagnostic with string conversion of the error's message when non-nullish, otherwise the thrown value itself. Primitive thrown strings follow that same rule. Generic `busy` or `locked` words and string code `5` do not qualify. Allow one initial attempt and at most one hundred
retries. Each retry requests 25 milliseconds plus the current random fraction
times 25 milliseconds, then yields through the supplied scheduler. Other start
errors propagate immediately. These are requested scheduling values, rather than
a guaranteed wall-clock deadline.

Preserve native JavaScript asynchronous return semantics. A callback result that
is a Promise of this module's normal Promise constructor fails with
`tx() callbacks must be synchronous` and rolls back. Returning a nested call's
Promise follows that same rule. Ordinary thenables and foreign-realm Promises
follow the existing post-commit Promise assimilation behavior. A handled nested
rejection leaves a successful outer return in control of the outer commit.
These details are compatibility obligations, not a new asynchronous callback API.

## Migration and query binding

The coordinator receives the following exact resource contract. These are
bindings to actual resources, not a second migration algorithm.

| Member | Value or operation |
| --- | --- |
| `changeCount` | Number of captured schema programs |
| `readVersion()` | Numeric conversion of the actual `user_version` field |
| `setReferences(enabled)` | Enable or disable SQLite foreign keys |
| `begin()` | Begin an immediate SQLite transaction |
| `apply(version)` | Execute the captured program at one-based ordinal `version` |
| `brokenReferences()` | Number of rows from the actual foreign-key check, never the row array |
| `referenceError(version, broken)` | An Error using the qualified count formatter and reported ordinal |
| `writeVersion(version)` | Set SQLite `user_version` to the supplied ordinal |
| `commit()` | Commit the SQLite transaction |
| `rollback()` | Roll back the SQLite transaction |
| `complete()` | Protect the cached connection bundle's file and its two sidecars |

Completion uses the cached bundle's `file` even if current configuration now
points elsewhere. The path helpers still reflect current configuration. Preserve
user-version values, reference counts, immediate transaction boundaries and
failures. Successful completion and the no-op case both protect that same opened
file; completion does not create the newly configured directory.

The reference-error callback calls the qualified formatter with the broken count
and `broken reference`, then returns the existing Error diagnostic
`migration <version> left <formatted count>`. Preserve singular and plural forms.
The qualified coordinator owns a stored version at or above the current count:
the server adapter completes without changing that version or inventing a
future-version refusal. The operator command's separate strict version check
remains with its own owner.

`LIVE_WS(expression)` identifies an ID in `v2_workspaces` whose `deleted_at` is
null. Its returned SQL preserves the caller's exact expression as the leading
text and the source reference's whitespace and capitalization. Support bound
parameters, qualified columns and compound expressions without quoting or
normalizing the expression. Preserve SQL null semantics. No retained SQL program
body is provided as generation authority; derive this target representation
from the predicate intent and physical field mapping.

The `audit(ws, actor, action, objectId, at)` operation writes one row to
`v2_audit`, mapping its arguments in order to `ws_id`, `actor_id`, `action`,
`object_id` and `at`. Use one prepared parameterized insertion with one placeholder
per field through the same statement cache and driver write path. Preserve nulls,
exact text and thrown driver values. Do not serialize an event, interpolate its
values into query text, add a transaction, or return the driver's change count.

## Integration boundary

The existing TypeScript adapter retains its `Sql`, `SQLInputValue`, `StatementSync`
and connection-bundle types through a mechanical resource binding. It forwards
all twelve public functions and the `sql` value. The callback resources above
come from actual built-ins and the existing qualified libraries. No original
connection, transaction, permission, migration-composition or predicate algorithm
remains in that typed binding after transfer.

Preserve normal generated-test diversity using real contexts and operations.
Fixture selectors and extra arguments do not belong in the public constructor.
The frozen forty-three-case reference and thirteen negative controls are independent
acceptance inputs. Two clean generations, separate admission, actual caller
compatibility and the complete parent gates remain mandatory.


#### Scenario: Existing database consumers

- **WHEN** the Node SQLite target is selected
- **THEN** Preserve all thirteen public exports through real resource ports, shared connections, exact statement caching, transaction outcomes, qualified migrations, query predicates and audit writes.
