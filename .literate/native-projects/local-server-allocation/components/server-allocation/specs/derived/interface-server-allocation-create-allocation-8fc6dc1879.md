# Public interface: server-allocation.create-allocation

## ADDED Requirements

### Requirement: server-allocation.create-allocation

# Workspace agent-time allocation

Provide server-allocation.create-allocation as a portable library through the
synchronous create_allocation(resources) factory. The consuming application owns
the database, principal, goal conversion, goal visibility, spending permission
and current clock. Preserve allocation, weekStart, weeklyAllocation and
feedAllocation, with AllocationRow and FeedAllocation types kept at the caller.

Agent time means fresh tokens: input, output and all three cache-write fields.
Exclude cache reads. Include every model and accounting basis, priced or not.
Attribute usage to its uploaded epoch's goal and include retained daily rollups.
Use all shared workspace usage as the denominator, including unreadable,
missing-goal and unallocated usage. List prices are estimates rather than bills.

The window report preserves half-open time ranges, total tokens, estimated list
price, unpriced requests and per-goal session counts. Name only readable goals.
Combine other goal usage into one private row without names or targets, and
unbound usage into one unallocated row. Active readable goals with targets also
appear when they have no usage. Preserve target eligibility, exact rounding,
gap meaning, output fields and ordering.

Calendar reports use Monday 00:00 UTC, six weeks by default, clamped to one
through twenty-six weeks, oldest first including the current calendar week.
The goals feed uses a trailing seven-day window, rounded whole-percent shares,
the report's one-decimal gaps and current goal holds. A feed gap is null when
there is no target or no shared usage. Keep the distinction between display
rounding and the gap used for steering. These observations do not establish an
improvement in allocation outcomes across real weeks.

Preserve the original permission boundaries and supplied resource calls,
errors and refusal identity. In particular, feedAllocation retains its original
goal-readership check without adding the report's spending permission call.
Preserve all exact function signatures, defaults, synchronous return kinds,
Map results, resource/property/query order and live clock lookups. The selected
target defines the SQL and package contract. Do not infer delivery, provider
billing or actual operator security acceptance from these reports.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:e01701b73c8236b9ce62`
