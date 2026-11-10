# Public interface: server-goal-activity.create-goal-activity

## ADDED Requirements

### Requirement: server-goal-activity.create-goal-activity

# Goal activity counts and private detail

Provide library capability server-goal-activity.create-goal-activity. Preserve
the existing goal activity views, derived from session bindings, usage times
and work-signal paths. Counts are available to each reader of the goal. Detail
is available to its owner, its team members and workspace owners. Return only
the reader's own session identities in detail. Keep other people's session
identities and all private file detail out of a count-only view.

Count distinct stored sessions whose goal binding or governance has an epoch
overlapping the fourteen-day window. A currently active session must be shared,
have no stopped-agent flag, currently follow the goal, and have usage or a bound
epoch start within ninety minutes. Retain per-harness counts and the original
latest-time aggregation. Classify the result through supplied activityEvidence.
This is reported activity. It does not establish delivery or acceptance of work.

For detail, keep the top four unexpired repo-relative work-signal paths, the
distinct hidden path-hash count after suppressing hashes with visible paths,
and the reader's own bound sessions. Preserve exact expiry and time boundaries.
Read no prompts, replies, task labels, commit subjects, token counts or costs.

The aggregate operation returns readable active goals, detail-bearing goals
first, then latest activity, then title. Cache team lookups, including misses,
for that one operation. Also count the reader's own shared sessions that have
no current bound or governing goal. Preserve workspace and person isolation.

Keep four runtime exports, two caller types, seven supplied resources and the
existing query and property-read order. Supplied goal visibility remains the
caller's authority. Preserve clock lookup positions, result fields and their
order, references, nullability, native failures and refusal identity. No new
ambient effects or persistence is introduced. Complete neighbouring services,
application migrations and stores, retention and public tester acceptance
remain consuming-project requirements.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:a6f58bff16c220ada7b1`
