# Public interface: server-changes.create-changes

## ADDED Requirements

### Requirement: server-changes.create-changes

# Proposed goal changes and launch decisions

A goal reader who does not own the goal can propose changes. The goal's effective
approval set decides them. Approval keeps the resulting content on the request;
launch publishes it through the same goal-version path used for an owner's edit.
Keep separate approval, launch and not-yet decisions, including a combined
approve-and-launch transaction with full rollback. Only launch creates a goal
version and reaches agents. The launch set also includes workspace owners.

Preserve the six request states, ten actions, four launch states, seventeen public
runtime values and five public types. Keep base-version and seen-revision guards,
one open request per goal and requester, and the exact validation and refusal
ordering. Countering creates a new revision against the request's base version.
The requester alone accepts its counter, withdraws, rebases or acknowledges an
optional condition. A condition records a person's confirmation; it never gates
approval or launch and never becomes a directive.

Keep dependency privacy at proposal, counter, rebase, approval, launch and read
sites. A new dependency must be readable by those who decide on it. A counter
retains dependencies its author cannot read. A later change to the approval set
or visibility is checked again when a person decides. Preserve cycle checks
against current goals, and the distinction between rebasing the request's own
changes and sending new changes. A refusal names no hidden goal or person.

Each revision records its server-computed snapshot at the revision's time.
Evidence links remain self-reported or agent-reported links. Eligible participants
can add them only to the current open revision, with existing duplicate and size
bounds. Only an adder can remove their own unfrozen link. Approval without links
is allowed and explicitly recorded. Preserve old snapshots and links after
revision or state changes. Never label evidence verified.

Read views, dependency choices, loops, diffs, conditions and action flags retain
their existing shapes and ordering. Only readable dependencies are named; hidden
ones are counted. Waiting-on-me follows the same decision predicates. Viewers
can read permitted goals and never act. Keep decision records and refusals in the
existing words and identify the actor correctly for the reader.

All database, transaction, policy, approval, identity, clock, goal-version,
snapshot, evidence, event and wording effects are supplied resources. The goal
service retains version publication, directive emission and superseding related
requests. Preserve exact invocation and write order, exception identity and
transaction ownership. Add no ambient effects, retry or permission substitute.
Actual caller, populated application-store, complete parent and image acceptance
remain required. This Component does not complete B15 or accept the public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:37d8d076d577c38641b0`
