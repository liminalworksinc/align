# Public interface: server-alignments.create-alignments

## ADDED Requirements

### Requirement: server-alignments.create-alignments

# Goal alignments and their recorded effects

An alignment records a contribution toward a goal. Working toward a goal also
makes the listed sessions follow it and counts their future usage there. Approval
requires consent for every affected goal and session owner. A contribution alone
moves no usage and sends no binding directive.

Preserve the two choices, six states, six actions and existing public types.
Each revision snapshots distinct approval requirements. A goal uses its supplied
effective approval set, including the requester rule and owner fallback. A session
owner has a singleton requirement. One person can satisfy several requirements,
and the first person who satisfies each remains recorded. Read legacy plain
person arrays as separate singleton requirements. The revision's author counts
only where that person belongs to a requirement.

Creation checks target and source visibility, source ownership, active goals,
contribution cycles, session ownership and stopped sharing. Working toward a goal
requires a session. A contribution requires a source goal or a session. Preserve
the existing session and note bounds and exact refusals. Approval checks for a
cycle again when all requirements become satisfied and refuses a session governed
by a different alignment.

Every action names the revision the person read. Preserve the ordering of
unknown revision, concurrent reread, state, stale revision, caller role and active
goal checks. A counter may keep or remove listed sessions, recomputes requirements
for a new revision and retains the old decision history. Decline and withdrawal
remain possible after a goal closes. Viewers can read their permitted records
and cannot act.

On approval, update each surviving session's governing goal, write its binding
directive and apply a pre-existing goal hold through the consuming services.
Record the source as reviewed against the target and audit the completing actor.
Revocation clears governance prospectively. Only epochs bound through that
alignment are ended and their shared sessions suspended. Past usage stays where
it was. Closing a target ends approved work-toward effects in the caller's
transaction while keeping the alignment approved on the record.

Preserve every read view, action flag, revision history and ordering. Another
person's full session key and private title stay hidden. Unreadable goals have
no id or title in labels or requirement references. Effects describe sessions
that still follow the goal and say when a closed goal or changed binding stopped
that effect. Keep decision refusals and who acted in the existing words.

All database, transaction, identity, clock, approval, policy, goal, session,
directive, hold and person lookups are explicit consuming-service resources.
Preserve their invocation order, transaction ownership, rollback and failure
identity. Add no ambient effects or permission substitute. Actual caller,
populated application-store, complete parent and image acceptance remain required.
This Component does not complete B15 or accept the public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:45a909da67c9a6c26b4e`
