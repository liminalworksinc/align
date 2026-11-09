# Public interface: goal-limits.create-goal-limits

## ADDED Requirements

### Requirement: goal-limits.create-goal-limits

# Goal limit content and identity

Authored proposal for the complete 107-line goal-limits helper in B15. Approval and the other goal services have separate authority. This helper alone does not complete the boundary.

A goal version may carry up to five limits. Each has an identity, one of `must`, `must_not` and `out_of_scope`, nonblank cleaned text of at most 160 JavaScript string units and either no source or a manual/meeting source. A source title may be empty and has at most 120 units; its date must be a real calendar day in the exact four-digit-year `YYYY-MM-DD` format. Keep the existing exact refusal messages and stop at the first refusal.

Clean text by replacing control characters with spaces, delegating prose cleanup, collapsing whitespace and trimming. Delegate the final blank-text decision. Parse stored limit JSON, using an empty list for a falsy stored string. Generate new identities from eight supplied random bytes represented by the supplied base32 service, taking its first twelve characters and prefixing `lim_`.

An omitted request keeps the exact previous limit array by reference. A present request must be an array of at most five objects. Parse every requested object in order before allocating identities. Preserve all existing request validation, normalized values and error wording.

Reserve all distinct nonempty requested identities that exist in the previous array before allocating any result. A reserved requested identity is used only once. Otherwise find the first unused, unreserved previous limit whose type and cleaned text match exactly and whose source has identical JSON serialization. Reuse its identity. Generate a new identity only if neither rule supplies a truthy one. Return fresh result records in request order with only `id`, `type`, `text` and `source`. Do not mutate either input. No database write, approval, version change, agent launch, environmental lookup or network belongs here.

Preserve the public constants and five operations, supplied service failures, conditional property reads, short-circuit order, identity/reference behavior and mutable runtime array identity behind the readonly type. Qualification must cover real calendar boundaries, Unicode cleaning through the supplied ports, request parsing, reservation/reuse collisions, exact refusal text, failure identity and property order. Full typed callers and actual parent/image gates remain required before transfer.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:5dcf2d0795cd01363f4a`
