# Public interface: server-startup.create-startup

## ADDED Requirements

### Requirement: server-startup.create-startup

# Bound server startup

Capability `server-startup.create-startup` binds one synchronous server-startup
operation to caller-owned validation, configuration, process, path, storage,
warning and exit-registration resources. Concrete names, representations and host
calls belong to the selected target.

## Binding and public operation

Capture supplied resource handles without invoking them. Construction performs
no startup effects. Later changes to the supplied container's function properties
do not redirect an existing binding. Value providers remain current when an
operation consults them. Return only the target's startup operation, which works
as a detached function and returns no value. Binding and startup are synchronous.

The original module exports one startup operation. Internal ownership and cleanup
helpers do not become additional public capabilities.

## Startup admission and owner record

Validate first on every invocation. A successful validation may be followed by
the target's build-only early return; that return performs no ownership,
directory, cleanup, warning or exit-registration operation.

Otherwise resolve the owner record using the current data-directory provider.
Consult existence and read an existing record with the target's text and numeric
rules. An effective owner different from the current process is probed for
liveness. A successful probe counts as alive regardless of its returned value.
Apply the target's permission-error and other-error classification.

A live different owner refuses startup before any write. Preserve the existing
record, process, permissions and client files. Return the target's exact refusal
message through an ordinary error. Failure while resolving the message's
directory also propagates unchanged.

An absent, ineffective, current-process or dead owner permits the write sequence.
Create the record's parent recursively with the target's creation policy, write
the current process identity, then repair the owner record's permissions. Preserve
the target's exact resource order and host behavior for existing directories and
files. Add no exclusive-create or atomic-claim policy.

## Leftover cleanup and warnings

After owner-record permission repair, consult the separate client-directory
provider. If that directory does not exist, skip its enumeration. Otherwise read
the directory once, retain the supplied entry order and remove only names matching
the target's crashed-client-write format. Preserve unmatched entries. The target
controls removal options and ordinary host behavior for links and directories.

Then request warnings once, deliver each value unchanged in its supplied order,
and register one exit callback. Each completed startup invocation repeats this
sequence. Introduce no process-wide startup cache or warning deduplication.

## Exit cleanup

Each exit callback keeps the exact record path resolved by its startup call.
Later configuration changes do not redirect cleanup. Read that file and compare
its trimmed text with the target's current-process identity representation.
Unlink only on an exact textual match. A replacement, malformed value or alternate
numeric representation remains untouched.

Read or unlink failures during this callback are swallowed without logging.
The callback remains synchronous. Exit registration itself is part of startup
and its failures propagate normally. The registration resource's returned value
is not the startup result.

## Failure and acceptance boundary

Outside the defined liveness classification and exit cleanup, propagate the same
thrown resource value and stop at that operation. Preserve completed earlier
effects, including an owner record written before a later cleanup, warning or
registration failure. Add no rollback, retry, delayed work or extra cleanup.

The source reference contains 78 matching cases on macOS and Linux, with 13
rejected behavior controls. Private target acceptance adds one resource-binding
case, passes three package formats on both hosts and rejects 14 behavior and
13 ambient-resource controls per host. These are functional parity observations.

Configuration validation and warning policy, client-directory derivation,
database readiness and instrumentation's later bootstrap sequence retain their
existing owners. Complete regenerative qualification, actual public consumer and
type checks, application/image parity and a current parent receipt are required
before this boundary receives release authority.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:2631cc8e91c4c0f7a1c0`
