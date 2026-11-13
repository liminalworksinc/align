# Public interface: server-goals.create-goals

## ADDED Requirements

### Requirement: server-goals.create-goals

# Goals and immutable versions

This Component owns the goal and immutable-version service. Other decision services retain separate authority.

Own goal creation, immutable content versions, readable projections, dependency graphs, parent reviews and target-share constraints. A goal has a fixed owner, level, team and visibility. Company goals have no team and are visible throughout the workspace; only a workspace owner creates them. A team goal defaults to workspace visibility. Stored pod visibility becomes team on the wire. The supplied policy services decide read, edit, create and binding permissions from authenticated facts.

Create version one with active status and preserve every prior immutable version. Limit a workspace to 1,000 goals. Validate title, measures, anchors, dependencies, limits and target share before writing. Sent measure identities are kept only once and only when present in the previous version. Preserve omitted field references. Clean and deduplicate anchor lists in order. Keep previous dependencies the editor cannot read, count them toward the maximum, and disclose only their number. Reject dependency cycles across the whole workspace graph, including unreadable goals, without naming hidden content.

Content equality uses the supplied hash service over the exact serialized content. Sort a copy of dependencies for hashing. Omit empty dependencies, empty limits and absent/null targets from the hash so older versions retain their identities. An unchanged request produces the existing no_change refusal. A conflicting sent or concurrently updated version produces stale_version, with the existing exact messages and no partial writes.

Active goal targets, every visibility counted, total at most 100. Validate creation with a target and any saved version that sets or raises an active target or reactivates a target-bearing goal inside the caller's transaction. Lowering, clearing or closing releases that share. Refusals disclose only sums.

Every successful version write updates the current goal conditionally on its old version, inserts its immutable version and hash/author, audits the actor, records a first-limit event when applicable, reviews current parents, and invokes the version directive before superseding approved unlaunched changes and reallocations. On achieved or dropped status, also supersede pending/countered changes, expire requests, release the hold and end governed alignment bindings, in that order. The caller owns transaction commit and rollback. Approval without launch never calls this write path.

Project readable goals in original order with safe owner names, team records, current content, readable dependencies, current parent review state and binding eligibility. A goal is bindable only while active and when the supplied policy allows it, including approved transfer facts. The feed obtains one current transfer set and allocation map, then hashes the serialized goals and steering switch for its sixteen-character version. Goal details preserve immutable version order, hide creator identities in those rows, show readable contribution goals and compute edit/propose flags from owner, workspace role and active state.

Preserve all 33 public runtime values, ten public types, function arities and default evaluation, exact SQL and service tuples, conditional field reads, object/reference behavior and failure identity. Storage, authorization, identifiers, clock, hashes, directives, retention names, allocation and steering remain explicit caller ports.

Keep both capacity checks: the early refusal after complete validation and the identical count/refusal inside the acquired write transaction, immediately before insertion. A failure at that second check performs no goal, immutable-version, audit or first-limit write. Keep the low-level insertion path used by a fresh sample workspace separate from this admission policy. Preserve the consuming runtime's existing one-server-per-data-directory guard. A service-level invariant gap alone does not establish public HTTP exploitability.

Two clean generations, distinct admission, full source review, both-host package and actual typed consumers, complete parent/image/current receipt and all remaining B15 services are required before retiring the boundary's source authority.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:efb5b1238a57cd2b5494`
