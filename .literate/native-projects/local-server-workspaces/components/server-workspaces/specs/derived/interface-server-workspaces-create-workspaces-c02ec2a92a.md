# Public interface: server-workspaces.create-workspaces

## ADDED Requirements

### Requirement: server-workspaces.create-workspaces

# Workspace membership and invitations

Status: reviewed intent under the delegated Align scope for the workspace part of accepted boundary B14. Qualification, separate admission and source transfer remain pending. This is authorized-policy self-review, without independent maintainer or deployed-tester security acceptance.

The component manages the caller's accessible workspaces, membership, team membership, invitations, restoration and audit projections. It preserves the current observable behavior of the reviewed workspace boundary. The separately named sample capability uses ordinary workspace creation and its transaction. Current storage, identity and authorization services remain explicit dependencies.

## Public contract

Provide a service factory through `server-workspaces.create-workspaces`. Constructing the service captures supplied services without reading their current configuration, clock, database or principals and without performing effects. Its public operations preserve their current synchronous or asynchronous shape, argument defaults, return values and failure identities.

| Operation | Required behavior |
| --- | --- |
| `principalIn`, `memberPrincipal` | Resolve current workspace membership and team roles. Device principals see only granted workspaces. An ungranted device receives a principal with no workspace role and an empty team map. |
| `need`, `enter` | Use current authorization decisions. Preserve decision status, code and message in the supplied error type, default workspace object and refusal before later work. |
| `workspacesFor`, `otherWorkspacesFor` | Preserve ordering, membership projections and device-grant filtering. Only device principals receive the ungranted-workspace list. |
| `createWorkspace` | Apply the per-person creation limit and asynchronous admission precheck before allocating the workspace. Spend a creation code, insert the workspace and owner, record the audit and events, and run any seed inside one transaction. Preserve returned identity and owner role. |
| `workspaceDetail` | Preserve the workspace, caller, membership and team projections, ordering, nullable team role and missing-workspace refusal. |
| `updateWorkspace` | Require management permission and at least one supplied field. Validate a supplied name before the transaction. Rename and steering changes share one transaction. Re-read the stored name after committing and preserve the steering service's return. |
| `deleteWorkspace` | Require management permission and invoke the one existing soft-delete service inside a transaction. |
| `deletedWorkspacesFor`, `deletedWorkspaceOwnedBy` | Preserve owner selection, newest-first ordering and the strict restore cutoff. A live workspace is `not_deleted`; an expired or inaccessible one is missing. Preserve returned object fields. |
| `restoreWorkspace` | Check ownership, restore eligibility and both creation caps before and inside the transaction. Restore, audit and return the original pre-transaction identity. |
| `setMemberRole` | Require management permission, check current membership again inside the transaction, suppress unchanged-role writes and protect the last owner. Preserve exact return and conflict behavior. |
| `removeMember` | Permit self-departure without a management check; require permission for removal of another person. Recheck membership and last-owner protection inside the transaction. Preserve membership cleanup, departure recording, audits and optional session deletion order. |
| `auditTrail` | Require management permission. Preserve the latest 200 entries, actor projection, former-member naming, nullable actor and legacy team-action spelling. |
| `createInvite` | Preserve permission and team checks, team-role defaults, viewer-lead refusal, throttling, normalized email, existing-membership refusal, an early cap check before secret allocation, the issue #76 cap recheck after acquiring the transaction lock, transaction effects, expiry and returned link/token. |
| `listInvites`, `deleteInvite` | Preserve team projection, ordering, withdrawal eligibility, audit timing and missing-invite refusal. |
| `previewInvite` | Preserve token validation, unused/unexpired/live-workspace lookup, case-normalized email comparison, team projection and the matching person's live-device projection. |
| `acceptInvite` | Preserve repeat-acceptance distinctions, token and email checks, hosted verification and recent-sign-in checks for device grants. Join membership, cancel departure, optionally join the extant team, consume the invite, audit, grant devices and record events in one transaction. Preserve membership races, missing-team mutation and returned device identities. |
| `createTeam` | Require management permission, allocate identity, insert and audit in one transaction, then return the created identity and name. |
| `setTeamMember`, `removeTeamMember` | Preserve workspace/team visibility, authorization, lead-only restrictions, workspace membership checks, viewer refusal, self-removal exception, transaction results and audits. |
| `memberName`, `nameTo` | Preserve current former-member naming and the exact reader-relative word `you`, including the short-circuit that performs no lookup for the reader. |

## Effect and failure contract

Evaluate supplied services and caller-owned values in the original order. Preserve current argument evaluation, property access, omitted/default values, returned reference identity, map ordering, callback behavior and promise rejection. Do not add defensive reads, validation, retries, normalization or effects absent from the reviewed source. A supplied error must propagate by identity unless the operation explicitly creates its documented error.

Transactions are supplied services with the existing synchronous callback contract. Mutation acceptance must use actual populated storage, rollback after injected failures and competing callers. A trace-only fixture cannot establish transactional atomicity or cap enforcement. Preserve observed behavior and report any reproduced disagreement with the product contract before changing it.

## Ownership

Component intent owns admission sequencing, membership and team rules, invitation lifecycle and observable projections. The target Flavor owns physical storage programs, JavaScript calling conventions, maps, clock/date conversion and the current error representations. External identity, authorization, retention, steering, device grants and session cleanup stay explicit service ports. No independent security primitive is generated.

## Acceptance before transfer

Keep the frozen original and private observations outside generation input. Observe all public operations, important private branches, effect failure positions and populated storage controls. Preserve exact failures and object/value distinctions. Qualify two distinct clean generations, separately admit another candidate and inspect its entire source. Test the admitted package and actual typed production consumers on macOS and Linux. Preserve public types, hoisted functions, the existing import cycle and unchanged callers. Finish the parent build, test, package, image and current-receipt gates before transferring release authority.

Native acceptance does not establish public deployment, real identity-provider browser behavior, actual operator security acceptance or live smoke.

## Baseline correction prerequisite

The frozen original contains the reproduced invitation-cap race tracked in Align issue #76. The corrected retained source is accepted and published in commit `9ca0ce303ec5db02488331944d06d453f7cdc4c6`: 1,846 complete workflow checks, all 36 new image/header/startup checks, current and CI readers, and exact-head forge checks pass. Native qualification must use this deliberately corrected baseline. Preserve the failing original and its observations as the defect control. Do not encode the original race as required behavior or claim this draft repairs the published source.

The physical storage draft specifies 42 distinct SQL statements, all 48 workspace/sample call sites and every ordered binding tuple. Storage remains a supplied service. The sample remains a separate capability and exact declared data asset.


## Measured acceptance scope

The private verifier preserves 806 corrected-source observations across all 26 public operations, 38 ordered capture and getter-failure records, ten populated workspace controls and six real independent-connection invite schedules. Exact source values, references, errors and property traces agree on macOS Node 26 and Linux Node 24. Its thirty-one batches must pass for two clean generations and a separately admitted generation. The sample has a separate Component and immutable asset; aggregate B14 closure requires both components and all actual consumer and parent gates.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:89e1161889b520937cf0`
