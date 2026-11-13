# Public interface: goal-approval.create-approval

## ADDED Requirements

### Requirement: goal-approval.create-approval

# Goal approval and launch sets

Status: authored proposal for the approval helper inside accepted boundary B15. Its source is preserved both in the complete twelve-file custody and in a separately attested one-file intake. The other eleven files remain unconverted. B14 full-parent acceptance is still running. No approval helper generation, qualification, registration or transfer has occurred.

Compute who may consent for a goal from current membership whenever asked. Include its owner and every lead of its owning team. For a company goal, also include workspace owners. Keep only current workspace members whose workspace role is owner or member. A viewer or a person who has left cannot approve. Deduplicate this set and sort it using the target's ordinary string ordering.

For a request, count the requester as an approver only when they own the goal and remain in its approval set. In that case preserve the entire base set. Otherwise remove the requester. If anybody remains, use that filtered set. If nobody remains, use the current workspace owners other than the requester. The fallback can be empty; a request then stays open.

The launch set for an approved change is the union of that effective set and current workspace owners, deduplicated and sorted. Calculating this set records no decision, changes no goal version and sends no agent update. Approval and launch transitions remain with their consuming decision services.

Expose synchronous `approvalSet(goal)`, `effectiveSet(goal, requesterId)` and `launchSet(goal, requesterId)`. Each operation reads current storage through its supplied query service. Preserve separate queries and their order. Do not cache membership, combine queries, add validation or substitute a new failure. Preserve supplied failure identity, caller-owned property reads and current return values.

Keep the complete original helper and all private source observations outside generation input. Before transfer, require independent source characterization on both actual runtimes, resource/calling checks, meaningful altered controls, two clean generations, a distinct admitted generation, full generated-source inspection, actual typed consumers and the complete parent/image/current-receipt gates. This helper alone does not complete B15, authenticate a caller or qualify a decision transition.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:28865f18a23b4e134b60`
