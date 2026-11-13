# Public interface: server-spend.create-spend

## ADDED Requirements

### Requirement: server-spend.create-spend

# Private-safe spending totals

Provide library capability server-spend.create-spend. Preserve spending totals
by goal, team and session, including retained daily rollups. Usage belongs to
the goal of its uploaded epoch, so later binding changes do not move history.
Keep unallocated usage separate. For every numeric field, totals include each
row and the unallocated amount. Keep five billing bases separate and route
unrecognized bases into unknown. Estimates remain labelled estimates, and
subscription usage is not described as money spent.

Require the existing spending-read permission before the aggregate read.
Optional from/to bounds form a half-open interval. Refuse nonempty reversed or
equal bounds. Preserve supplied database, permission and refusal interfaces.

For goal and team groupings, combine unreadable or missing goals into one
unnamed private bucket. For session grouping, name only the caller's own
sessions. Combine other sessions into one bucket and retained rollups into a
separate older-sessions bucket. Unallocated usage stays separate for every
grouping. Retain existing response values, field order, labels, sorting,
nullability and numeric addition semantics.

The goalSpend helper returns one goal's current raw-usage totals and model
breakdown. It does not add a permission or goal-visibility check, inspect
retained rollups or validate date order. Its existing caller owns visibility
and the immutable evidence snapshot boundary. Do not silently broaden it.

Preserve two synchronous functions and the caller's Sums and SpendBy types.
Keep exact query texts, parameter order, property-read and supplied-call order,
native failure positions and returned refusal identity. The caller owns actual
storage, policy, goal conversion, retained-rollup lifecycle and route-level
validation. No ambient IO, clock or new persistence is introduced. Complete
metering reconciliation, real application stores, retention and live tester
acceptance remain separate requirements.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:59d1d73f06dbd845ae22`
