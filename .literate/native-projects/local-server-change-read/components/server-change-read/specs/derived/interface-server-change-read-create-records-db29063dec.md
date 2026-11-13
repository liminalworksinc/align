# Public interface: server-change-read.create-records

## ADDED Requirements

### Requirement: server-change-read.create-records

# Change request records

Read change requests through the consuming service's existing visibility checks
and reshape its views into summaries and decision records. The consuming service
owns request storage, filtering, authorization, approvals and launch transitions.
This Component supplies no mutation or independent permission decision.

When the change-request table is absent, listing returns an empty array and a
single read returns null, without calling the request-view services. Otherwise
listing passes the requested state through, keeps upstream order, applies the
original nonnegative slice limit and returns summaries. A single read converts
only the supplied error class's status404 into null. That rule covers upstream
reads and detail projection; other errors retain identity. Listing has no such
error conversion.

Summaries preserve goal, state and launch facts, condition and requester
references, revision/base version, reason, all evidence links in revision order,
the current revision's snapshot, and creation/update timestamps. Keep evidence
source labels and added-person references as supplied. Detail records add the
decision actor/note/time, the original per-field before/after diff, resulting
launched version and launch/approval metadata. Approved, rejected and previously
approved superseded requests retain the original decision-record rules.

Preserve all three runtime exports, six public types, state-array identity,
function names, arities/defaults, native limit conversion, field/read ordering,
object/reference behavior and exact failure handling. Plain strings remain
untrusted data for the consuming protocol layer. This library does not certify
an evidence link, perform network access, or complete B15 or public tester gates.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:88b7b3d71d5cf20208f6`
