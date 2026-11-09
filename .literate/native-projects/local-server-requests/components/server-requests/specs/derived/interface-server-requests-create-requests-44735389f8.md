# Public interface: server-requests.create-requests

## ADDED Requirements

### Requirement: server-requests.create-requests

# Typed agent requests and goal holds

Let a goal's approvers and workspace owners send replan, checkpoint or switch-goal
requests to its shared sessions. Preserve the sender, quoted note, target sessions,
goal version at sending and each session's answer. A safe request that reached an
agent without being declined remains distinct from a developer's acceptance.
A switch of goal always requires the developer's acceptance through the existing
binding path. The request service does not itself move a binding.

Preserve request sending, cancellation, closure expiry, receipt transitions,
session expiry and privacy on the web and device wire. Keep the twenty-request
hourly limit across workspaces, twenty-session selection limit and280-character
note/reason bound, with existing validation, refusal and read/effect order.
Viewers cannot send, cancel, hold or release. Other goal readers see aggregate
counts and their own session rows; titles remain private to each session owner.

A goal hold reaches every session currently on the goal and every session that
joins it later. Releasing reaches every session reached by that particular hold,
including those that moved away, together with current sessions. Keep repeated
hold, release, cancellation and delivery behavior, audit and directive positions,
transaction ownership, native failures and exact public names and types.

Every database, policy, identity, clock, directive, event, validation and person
lookup is an explicit consuming-service resource. Route-level receipt validation,
recent-sign-in checks and enforcement on the device remain with their existing
owners. Add no ambient IO, network, permission substitute, retry or hidden cache.
This Component does not close B15 or accept the public tester.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:3cb6ee0c9c8bdb1fd4f0`
