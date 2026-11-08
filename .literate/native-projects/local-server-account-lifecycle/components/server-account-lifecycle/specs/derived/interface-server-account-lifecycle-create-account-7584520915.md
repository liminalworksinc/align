# Public interface: server-account-lifecycle.create-account

## ADDED Requirements

### Requirement: server-account-lifecycle.create-account

# Account and membership lifecycle

- Status: Reviewed for normal local promotion; qualification remains required.
- Owner: ADOPT-002/B13 under accepted ADR 0002.
- Preceding helper acceptance: complete. Preserve the reviewed 29-library checkpoint.
- Preserved sources: `account.ts`,
  `sha256:a0bb7cd866e1f7da68e2afbc7788328d80234d61f3a2b426db34762e483b64c7`;
  `lifecycle.ts`,
  `sha256:91ae47b8b28a4c47aa3aee27d614b794ca67d7a54f3ed3d760be66a6b2e943dd`.

Preserve all seven account operations and both membership lifecycle operations.
The Component owns their account rules, refusal decisions, cleanup obligations,
public results and externally observable effect order. The target owns database
and language mechanisms. Caller services retain authentication schema, store,
transactions, device/session/OAuth effects, retention, current time and errors.

Use two supplied-service factories so account operations can call the existing
membership-removal service through its explicit port. Do not silently replace
that port with a private internal implementation. The account and lifecycle
namespaces remain separately testable and compose through the host.

## Passkeys and the prompt

`listPasskeys(userId)` returns only that person's passkeys, ordered by creation
time then id. Include id, name, creation time and last-use time. An absent or
empty name becomes null under the target's existing value rules. Preserve stored
creation and last-use values. Do not synthesize a last-use time or mutate store
rows while listing.

`passkeyPromptDue(userId)` is true only when the person has no passkey and has
not dismissed the prompt. Once the first condition fails, do not perform the
dismissal lookup. There is no independent account-existence check.

`dismissPasskeyPrompt(userId)` uses the supplied transaction service. Record the
current time inside its callback. Insert a dismissal only when none exists;
keep an existing dismissal time. Return the insertion result from the transaction
callback, then wait for transaction completion and return no public value. The prompt does not become eligible again through this operation.

`renamePasskey(userId, id, name)` changes only a passkey owned by that person
inside the supplied transaction. Preserve the supplied name without new trimming,
length checks or normalization. Refuse through the supplied not-found service
when the transaction's result indicates no matching passkey. On success return
the supplied id and name in a fresh result object. Add no audit or timestamp.

`deletePasskey(userId, id)` checks ownership inside the supplied transaction. An
absent or foreign passkey produces no deletion or audit and is refused through
the supplied not-found service after transaction completion. For an owned
passkey, delete it, then audit `passkey.deleted` without a workspace, with this
person as actor, this passkey as object and the current time. Wait for completion
and return no public value. Caller-owned database constraints retain cascading
effects such as removal of last-use rows.

## Sign out everywhere

`signOutEverywhere(userId, also)` captures one current time before starting the
transaction. Inside its callback, end every web session belonging to that person.
If `also.devices` selects it, call the supplied person-device revocation service
with reason `signed_out_everywhere` and that same person as actor. If `also.apps`
selects it, call the supplied person-grant revocation service with the captured
time. Preserve session, device, app and audit order.

Record `account.signed_out_everywhere` without a workspace, with the person as
actor and object, using the captured time. Return the transaction's result with
the session count and each selected service's count; an unselected service has
count zero. Do not call either unselected service. All database changes belong to
the supplied transaction, including recovery from a later failure.

## Delete an account

`deleteAccount(principal, confirmEmail)` uses the principal's user id and the
target's existing canonicalization of the principal and confirmation emails.
Refuse a mismatch before querying ownership, reading time or opening a
transaction. Use the supplied bad-request service with the exact message
`Type your email address exactly to confirm`.

Before starting a transaction, refuse deletion while the person is the sole
owner of a live workspace that has other members. Preserve the ordered blocking
workspace names and target's exact conflict message. Capture one current time
after that precheck. Repeat the ownership check inside the transaction before
cleanup; the outer check alone cannot authorize a later state.

For each membership, in the store's existing enumeration order:

1. Soft-delete a live workspace when this person is its only member, using the
   supplied core service and the same supplied SQL handle, person and time.
2. Call the supplied membership-removal service with workspace and person.
3. Delete the membership.
4. Record departure with the captured time.
5. Audit `member.account_deleted` in that workspace, with the person as actor and
   object, using the captured time.

Then pseudonymise the person in every workspace returned by the supplied naming
service, including workspaces they left earlier. Keep each supplied workspace
value and service order. Preserve other people's history and already rolled-up
spend through the owning services.

Complete the following cleanup inside that same transaction, in the target's
existing order:

- Delete invitations for the canonical email.
- Clear matching actor and object identifiers from audit rows without a workspace.
- Delete the person's devices, device requests and OAuth grants.
- Delete verification entries associated with the canonical email under the
  target's existing identifier-suffix rule.
- Delete access requests for the canonical email. Delete unused creation codes
  bound to that email, clear the email from retained bound codes and clear this
  person's redeemer identifier wherever it occurs.
- Delete durable rate counters for the supplied OTP-email and access-email keys.
- Clear product-event actors matching the supplied event-actor key.
- Delete last-use entries for the person's passkeys and their prompt dismissal.
- Discover authentication tables other than the user table that have the target's
  person-reference column, then delete this person's rows from every such table.
  Preserve support for additional provider-owned authentication tables.
- Delete the user row. Verify that it is absent. If it remains, raise an ordinary
  error with exact message `account not deleted`.
- Audit `account.deleted` without workspace, actor or object, using the captured
  time. Return no public value after transaction completion.

Do not erase unrelated people, invitations, codes, email counters or provider
records. Preserve bound-code retention rules and audit/event anonymization.
Do not add a second authentication-provider deletion call or bypass the supplied
transaction. A failure preserves the exact supplied value and restores store
state according to the transaction owner's contract. Previously observed external
service calls remain observable; this Component does not promise rollback of
unrelated external systems.

## Membership lifecycle

`onMemberRemoved(wsId, userId)` runs within its caller's transaction. First revoke
that person's OAuth grants for the workspace. Select their shared sessions in
that workspace whose state is not stopped, then call the supplied session-ending
service with those rows, reason `member_removed` and the current time. Read time
and call that service even for an empty selection. Remove
their team memberships and workspace device grants. Preserve service/read/write
order and exact failures. This operation returns no public value and does not
start a transaction of its own.

`deleteMemberSessions(wsId, userId)` immediately deletes only that person's
shared sessions in that workspace. Caller-owned constraints retain the existing
cascades for epochs, usage, deliveries and receipts. Rolled-up spend remains.
Call the supplied orphan-directive cleanup service only when the deletion result
selects it under the target's existing value rules, then return that result.
Preserve its original value without coercion. This operation also relies on its
caller's transaction where atomic recovery is required.

## Acceptance and scope

Construction captures only declared services without invoking them. Public
operations remain detached callables, preserve the target's names and signatures
and use supplied error/refusal services without cloning or replacing their
results. Keep the complete public `PasskeyRow` type and all actual callers.

Source characterization contains 57 account and 15 lifecycle records per host,
with 25 and 12 rejected altered-source controls respectively. The independent
public preparation retains 29 account and ten lifecycle records. Source-specific
fault ordinals and calls outside required transaction preconditions remain
separate diagnostics. Prepared adaptive fault verification covers seven public
operations. A future candidate must expose every actual writing statement to
these public store-state and error-identity checks.

The original-free adapter, independent constructor/binding checks, meaningful
bad controls, portable verifier and actual private profile commands pass on both
hosts. Verify the actual locked import projection before qualification. Require two independent clean generations and a
distinct admission. Before retained source authority changes, verify populated
actual configured authentication/store behavior, both host families, actual
typed consumers, complete application/image acceptance and a current receipt.
Recorded device/session/OAuth/retention ports alone do not prove their full
composition. This library does not close all of B13, the other accepted native
boundaries, the public tester, operator security review or live smoke.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:60be664deef5b9702e86`, `evidence:bb37c113cfe32b275665`
