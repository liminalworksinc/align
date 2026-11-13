# Public interface: policy.can-read-goal

## ADDED Requirements

### Requirement: policy.can-read-goal

JavaScript module policy/can_read_goal exports can_read_goal(principal, goal), returning a boolean. PolicyPrincipal has userId and wsId strings, wsRole null or owner/member/viewer, and pods: a JavaScript ReadonlyMap from opaque team-id strings to lead/member. GoalObject has kind goal, ownerId string, visibility private/pod/workspace, and podId string or null. Identifiers are opaque, case-sensitive strings, including empty, Unicode and prototype-like strings. Do not validate or normalize identifiers. wsId supplies context but is not itself a condition in these functions. Preserve arguments and Map state; no I/O or hidden state. A principal with null wsRole cannot read any goal, even their own. Otherwise its owner can read it. Workspace goals are readable by all three workspace roles. Pod-visible goals are readable by a workspace owner or by a lead/member in the goal's nonempty podId. Private goals are readable only by their owner. A null or empty podId grants no team membership. These rules apply to all combinations of visibility and podId.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:bbd7201dd03071573ca1`
