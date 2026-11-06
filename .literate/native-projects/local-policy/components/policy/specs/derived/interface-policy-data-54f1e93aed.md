# Public interface: policy.data

## ADDED Requirements

### Requirement: policy.data

JavaScript module policy/data exports data(), returning the following policy data object with these six properties and exact array orders. Consumers read these values as policy tables; do not add, omit, relabel or reorder list entries. No I/O. {"WS_ROLES":["owner","member","viewer"],"POD_ROLES":["lead","member"],"VISIBILITIES":["private","pod","workspace"],"WORKSPACE_ROLE_ACTIONS":{"owner":["workspace.read","workspace.manage","goal.create","session.share","session.stop_any","alignment.create","spend.read"],"member":["workspace.read","goal.create","session.share","alignment.create","spend.read"],"viewer":["workspace.read","spend.read"]},"POD_ROLE_ACTIONS":{"lead":["pod.manage_members","goal.create_in_pod","goal.bind_pod_goal"],"member":["goal.create_in_pod","goal.bind_pod_goal"]},"GOAL_READERS":{"private":{"wsRoles":[],"podRoles":[]},"pod":{"wsRoles":["owner"],"podRoles":["lead","member"]},"workspace":{"wsRoles":["owner","member","viewer"],"podRoles":[]}}}

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:bbd7201dd03071573ca1`
