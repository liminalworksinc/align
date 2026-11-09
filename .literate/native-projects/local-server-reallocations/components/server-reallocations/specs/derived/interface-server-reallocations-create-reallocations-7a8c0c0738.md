# Public interface: server-reallocations.create-reallocations

## ADDED Requirements

### Requirement: server-reallocations.create-reallocations

# Target reallocation proposals

Let people propose changing the target share of several goals together, obtain
one effective approval for every changed goal, then make a separate launch
decision. Approval alone writes no goal version. Launch writes decreases before
increases, preserving the consuming service's target-capacity checks and each
goal's approver as its version authority.

Preserve creation, approval, approve-and-launch, counter, counter acceptance,
decline, withdrawal, not-yet, launch and superseding behavior. Refuse stale goal
versions and unread proposal revisions in the existing order. A counter starts a
new revision, and approval belongs to that revision. The requester approves their
own eligible goals by asking; a counter author does likewise by countering.

Anyone able to read a goal named by any revision may read the proposal. Hide an
unreadable goal's identity, numbers and people. Keep the original approval flags,
action availability, history, waiting-on-me grouping and refusal messages. Viewers
have no actions. Preserve the live state/action arrays, the fifty-goal limit,
public names and types, exact SQL, transactions, references, property and effect
order, errors and failure identity.

Database access, policy, identity, clock, goal versions, person names, validation
and target-fit decisions are explicit consuming-service resources. Do not add
ambient IO, a second permission model, retries, hidden caches or recovery. This
Component does not close B15 or accept the public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:3f6faf0940222e7973f4`
