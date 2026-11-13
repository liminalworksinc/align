# Public interface: server-workspace-admission.create-access

## ADDED Requirements

### Requirement: server-workspace-admission.create-access

# Workspace creation, public access and disposable-domain decisions

Preserve all nine public functions, the three access arrays and the Creator
type. Keep decisions, public messages, service order, transaction boundaries,
observable configuration reads and supplied failures. Language, clocks,
environment lookup, regex/object receivers, packaging and immutable asset
assembly belong to the selected target.

## Workspace creation

`needsCode(email)` returns false outside codes mode. In codes mode the first
owner is exempt only when a nonempty configured first-owner email matches the
argument's lowercase value and the server has no workspace rows at all. Read the
raw first-owner value, use an empty string for a falsy value, then apply native
trim and lowercase behavior. An empty normalized owner skips both email
lowercasing and the workspace lookup. A different normalized email skips the
workspace lookup. Only an exact match reads whether any workspace exists. Deleted
workspace rows prevent the exemption. This operation itself does not branch on
hosted mode. Read current mode and current first-owner configuration at their
existing operation points. Keep short-circuit behavior and supplied store errors.

Creation checks first read hosted configuration. Local mode returns immediately.
Hosted creation expects caps to exist and reads their fields directly. It does
not skip cap checks for absent caps; native property-access failure propagates.
The restore and member checks below separately return when caps are absent.
Hosted closed mode fails with 403 `creation_closed`: `New workspaces can't be
created on this server right now. Contact its operator.` Otherwise read current
caps and count live workspaces. A workspace is live when it is not soft-deleted.
A person owns a live workspace when a membership row links that person to the
workspace with role `owner`. The workspace creator field does not establish
current ownership. Count those memberships joined to live workspaces.
At or above the global cap, fail with 403 `workspace_cap`. Next count live
workspaces owned by the person and refuse at or above that cap with 403
`owned_workspace_cap`. Only after both checks, call the supplied disposable-email
refusal. Then refuse a missing required code with 403 `creation_code_required`:
`Creating a workspace here needs a creation code. Request access to get one.`

Keep the existing cap messages, including the supplied pluralization result and
the suffix `Contact the operator of this Align server to raise it.` Global
creation says `This server has reached its limit of <count>.` Personal creation
says `You already own <count>, the limit for one account here.` Its count is
the current live owned-workspace count, including when greater than the cap. A refusal stops
later service calls. Do not spend a code, call captcha or create a workspace in
these checks.

`precheckCreation(request, creator, code)` runs the creation checks first, then
reads hosted configuration again. If local, it completes. If hosted, a non-null
code must satisfy the supplied code-pattern test. Only the literal null value
skips that test; preserve the supplied pattern behavior for other values. On rejection use 403
`creation_code_invalid`: `That creation code isn't valid. It may be mistyped,
used, expired, revoked or for another email address.` Finally await the supplied
captcha operation with the exact request. Preserve pending completion and its
exact rejection value. No transaction is opened here.

`admitCreation(creator, code, workspaceId)` runs the creation checks again inside
the caller's transaction. Then read hosted configuration and code necessity at
their existing points. Return false for local mode or an exemption. Otherwise
call the supplied redemption operation with the exact SQL handle, current
server secret, supplied code, the creator's email only when verified (empty
otherwise), creator ID and workspace ID. A falsy redemption result produces the
same invalid-code refusal. A truthy result returns true. Preserve service
failures and never add a transaction or repeat redemption.

`checkRestoreCaps(userId)` reads current caps and returns if absent. Count live
workspaces, then this person's live owned workspaces. At or above either cap
return the supplied 409 conflict with `workspace_cap` or `owned_workspace_cap`.
The global message begins `Restoring it would take this server past its limit
of <count>.` The personal message is `You already own <count>, the limit for one
account here, so this one can't be restored.` The personal count is the current
live owned-workspace count. Append the same operator suffix.
Do not apply creation mode, captcha, disposable-address or creation-code checks.

`checkMemberCap(workspaceId, countInvites)` reads caps and returns if absent.
When caps exist, obtain the current member-check timestamp before store reads,
including when invite counting is false. Count current members. When requested,
also count unaccepted invites whose expiry is strictly after that timestamp.
Refuse when their sum is at least the cap, with 403 `member_cap` and `This
workspace has reached its limit of <count>, counting open invites.` plus the
operator suffix. No membership or invite is changed.

`sessionCapError(max)` returns a new supplied public error object with status
403, code `session_cap` and `This device has shared <count> in the last 24 hours,
the limit here.` plus the operator suffix. It returns the object without
throwing it. Preserve constructor identity and the supplied pluralizer's result.
Use the supplied pluralizer with unit `workspace` for every global or owned
workspace count, unit `member` for the member cap, and unit `new session` for
sessionCapError. Pass only the number and singular unit, leaving optional
pluralizer arguments omitted.

## Public access requests

Keep these public arrays and their order:

- `TEAM_SIZES`: `1`, `2-10`, `11-50`, `51-200`, `201+`.
- `INTERESTS`: `try`, `evaluate`.
- `VIAS`: `form`, `value_card`.

The target preserves their existing public type declarations, runtime mutability
and stable identity. All validation calls receive the same exposed array
objects. Do not freeze them, copy them per operation or replace them with
getters that return fresh arrays.

`createAccessRequest(request, client, body)` obtains email through the supplied
required-string parser at maximum 320 and lowercases its result. Reject an email
that does not have non-space, non-`@` content on both sides of one `@` and a dot
in its domain, with the supplied bad request `Enter an email address`. Then
parse name (required, 100), company (optional, 100), team size (optional, exposed
TEAM_SIZES), use case (required, 500), interest (exposed INTERESTS) and via
(optional, exposed VIAS, default `form`) in that order. Preserve parser failures.

The literal body field names, in parser order, are `email`, `name`, `company`,
`team_size`, `use_case`, `interest` and `via`. The underscore names are the
public wire keys. Pass those exact strings to the supplied parsers with the
same body object. Do not substitute camel-case names.

Read current hosted configuration. Only when hosted, invoke the supplied
disposable-address refusal. Prepare limits in client-then-email order: the
literal client key `access-client:<client>`, maximum five per hour, and the
supplied keyed email value, maximum three per day. Check durable room before
captcha. A refusal creates the supplied 429 `rate_limited` error: `Too many
requests were sent. Try again later.`

Await captcha with the exact request, then await the caller-supplied transaction.
Its supplied callback is synchronous. Inside it, check durable room again before
counting either limit. Keep all mutations inside that callback and await the
outer transaction completion; do not add an asynchronous callback or another
transaction. Count limits
once, then look for a pending request with the normalized email. Update the
existing row's name, company, team size, use case and interest if present. Its
identity, creation time and pending status stay. Otherwise obtain a new `ar`
identity and current timestamp, insert one pending request, then record
`access_requested` with exactly the interest and via properties. Via is an event
property, never a stored request column. An update emits no creation event.

Complete with the public object `{received: true}` after transaction completion.
Preserve one pending row per email, exact falsy/null stored optional fields,
supplied rejection objects, rollback on every actual write failure and the
caller-owned transaction boundary. No cleanup, counter or event can be omitted
because a test happens to inspect only the final response.

## Disposable-domain decisions

Use the exact immutable domain asset identified below. The predicate recognizes
an address's domain or any proper suffix with at least two labels. Preserve the
existing input quirks: start after the last `@` (use the whole string if absent),
trim domain whitespace, lowercase it and remove exactly one trailing dot before
examining label suffixes. Single-label candidates are never checked. Preserve
ordinary target string failures instead of adding input validation.

`isDisposable(email)` returns a boolean and makes no public-error call.
`refuseDisposable(email)` returns normally for false, otherwise throws the
supplied 403 `disposable_email` error: `Use a work or personal email address, not
a disposable one.` Do not apply this check at sign-in or to unrelated operations.

The asset is `lib/v2/disposable-domains.json`, SHA-256
`1b36130a488aae7a4fefc689f9c9b936dc679a7537edda2c3e1003e53814f894`,
containing 10,083 domains. Preserve its exact bytes, metadata and ownership as a
B23 data input. Declare an exact pinned immutable asset through the normal
Component asset selector and overlay mechanism. Generation receives metadata;
it must not recreate, shorten, normalize or rewrite the asset.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:2d6b7df0e9d921ae1d5c`, `evidence:9c866fb6b561f9b58e79`, `evidence:de893cad951d2c908b3c`, `evidence:fa9c241f184efebb4916`
