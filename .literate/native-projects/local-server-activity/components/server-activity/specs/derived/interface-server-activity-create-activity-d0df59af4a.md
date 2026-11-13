# Public interface: server-activity.create-activity

## ADDED Requirements

### Requirement: server-activity.create-activity

# Activity ingestion and visible feed

Provide `server-activity.create-activity`, a library that accepts caller-supplied
persistence, policy, formatting and clock resources. It records in-flight work
signals from a device's own shared sessions and reads the visible workspace feed.
These are reported signals, with the existing one-hour claim and 24-hour other
lifetimes. They do not establish completion, delivery or accepted work.

Preserve the complete public ingestion and feed behavior: validation, permission,
transaction ownership, refused-item indices and reasons, session and epoch
association, exact stored text and timestamps, expiry, privacy, ordering and the
raw-row cursor. The caller owns principal and device identities, database lifecycle,
workspace and goal visibility, supplied text cleaning, retention names and clocks.
Client consent for sharing text or relative paths remains the caller's concern.

Ingestion is asynchronous and atomic for the complete supplied batch. Invalid
items fail the transaction; skewed, old or unshared items are individually refused
and the remaining batch continues. The feed is synchronous. It advances over all
raw rows selected before visibility filtering, so hidden rows cannot trap a reader
on the same page. Preserve original refusal and supplied-effect identities, order
and synchronous versus asynchronous outcomes.

The Node target owns the two-file import surface, explicit host resource capture,
exact SQL and binds, live Date access, JavaScript property observations and method
metadata. No ambient persistence, network, subprocesses, environment reads or
independent policy decisions belong in the library.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:e2bb0d383760ca4bad21`
