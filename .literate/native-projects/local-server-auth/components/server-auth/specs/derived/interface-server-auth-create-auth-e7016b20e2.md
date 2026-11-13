# Public interface: server-auth.create-auth

## ADDED Requirements

### Requirement: server-auth.create-auth

# Authentication configuration and sign-in lifecycle

Status: reviewed intent under the delegated Align work scope. Qualification,
admission and integration remain pending. This record is not operator security
acceptance or independent maintainer approval.

Capability `server-auth.create-auth` binds caller-owned identity, persistence,
delivery, clock and configuration providers to the complete existing authentication
surface. Its concrete factory, host resources, adapter framework, serialization
and packaging belong to the selected target.

This Component owns sign-in configuration, account-creation admission during code
sign-in, code-send admission, recent-sign-in requirements, absolute session caps,
passkey callbacks, delivery-failure cleanup, authentication instance reuse and
authentication migration orchestration. Authorization, account management,
workspace creation, captcha verification, code delivery implementation, durable
limits, domain migrations, request routing and the other identity modules retain
their current owners.

## Provider ownership

Every database, transaction, configured identity adapter, authentication plugin,
cryptographic operation, filesystem resource and delivery operation is supplied.
Do not create an alternate database, network transport, credential source or
identity provider. Shared authentication state remains caller owned. Operations
work detached from their returned namespace. Preserve the exact public constants,
function signatures, asynchronous behavior and configured adapter identities.

Construction installs the two request hooks through the supplied middleware
provider. Other effects occur only when their corresponding operations run.
Repeated configuration calls observe current configuration and produce fresh
options. Reuse only the deliberately shared authentication instance. Failed
construction of that instance leaves it eligible for a later retry.

## Sign-in methods and options

Preserve the public path, cookie prefix, local-only test provider and refusal
message. Enable the configured social providers independently. Email code sign-in
is available according to its provider. Its codes have six digits, five-minute
validity, three attempts and hashed storage. Only sign-in codes are delivered.
Include the configured captcha plugin before the email and optional test-provider
plugins, and include the passkey plugin last.

Use one configured public origin when hosted. Local operation trusts only the
three existing loopback names at this server's exact port. Preserve the local
passkey relying party, hosted origin handling, explicit account linking, encrypted
provider access and refresh tokens, secure hosted cookies and disabled routes.
The local password test provider remains disabled when hosted. Preserve the
existing account, session, verification, passkey and hosted limit model mapping.
Disable telemetry. The target defines the exact adapter option representation.

## Session limits and sensitive operations

A sign-in is recent when its supplied timestamp is finite and its age is no more
than the current recent-sign-in interval. Preserve the current inclusive boundary
and future-timestamp behavior. The session cap is the sign-in time plus the
configured maximum days, with ordinary target date behavior for invalid inputs.

Before every authentication request, read the signed session cookie. If it carries
a token, delete only sessions matching that token whose creation time is strictly
before the absolute-cap cutoff. Preserve the provider call and failure order.
Adding a passkey and explicitly linking an account require a recent sign-in when
a session exists. Missing sessions remain the adapter's responsibility. On these
routes, refuse a string passkey name only when its trimmed length exceeds 100.

On session creation and refresh, shorten an expiry only when it exceeds the cap.
Do not extend shorter expiries. A refresh needs both an expiry and the current
session's creation time. Preserve unchanged-input behavior and exact returned
data merging.

## Code-send admission

Normalize string email input by trimming and lowercasing. Refuse non-sign-in send
types before limit work, and leave empty or non-string addresses to the adapter.
Every address is limited to three sends per ten minutes. A hosted request also
uses the supplied client network key for ten sends per hour and a keyed durable
email counter for five sends per hour. A local request adds the configured
machine-wide hourly ceiling except for the configured local owner. An in-process
send without a request adds no client limit.

Within the supplied transaction, check durable room before taking in-memory
limits. Count durable sends only when both checks admit the send. On refusal,
derive the wait from the maximum of the durable and in-memory waits. Mention the
machine ceiling when it ties or exceeds that wait. Preserve current zero-wait
behavior. Round the displayed wait up to whole minutes, at least one, and the
retry header up to seconds, at least one. Preserve the existing refusal wording.

## Email codes, creation and delivery failures

A code must never take over an existing account whose email is unverified. Check
only a correct, live code before refusing it, so guesses continue through the
adapter's attempt accounting. A record is live at its exact expiry instant. Parse
the existing attempt suffix and compare the supplied hash using the original
rules. Delete a correct unverified account's verification before refusing sign-in.
Preserve malformed-attempt and provider-failure behavior.

Hosted code sign-in may create a user only for a live invite to a live workspace,
a usable email-bound creation code, or the configured first owner while the server
has no user. Preserve that precedence and effect order. Local code sign-in allows
creation. Other sign-in methods retain their existing creation rules. For a new
code-created user without a name, derive at most 100 characters from the email's
local part. Keep the original user data and existing nonempty names.

Delivery chooses the configured public origin first. Otherwise use an allowed
request Host or the server's own loopback address and current port. Pass the
original email and code to the supplied delivery provider. On failure, attempt to
delete the stored verification, suppress a deletion failure, and associate the
delivery failure with that exact request. The after hook fails that request with
the existing server-error answer. An in-process failure without a request throws
the existing delivery error directly. Other requests remain independent.

## Passkey and migration effects

After a successful registration result with string credential and user IDs,
record its audit through the supplied transaction. Do not audit errors or malformed
results. After successful passkey authentication with a string credential ID,
record its last-use time through the supplied transaction and exact database
operation. Preserve provider returns, error identities and partial effects.

Obtain migrations from freshly constructed authentication options, then await
their execution. Preserve failures and retry behavior. The complete configured
adapter owns its schema. A small substitute identity schema cannot establish
acceptance of this operation.

## Acceptance and authority transfer

Preserve all public operations and nested callbacks under local and hosted modes,
including populated databases, exact boundaries, provider failures and recovery.
Check the actual configured identity adapter, complete schemas and code sign-in
in addition to owned port traces. Exclude original implementation and private
acceptance commands from generation. Qualification requires distinct clean
generations, a separate admitted build and independent acceptance. Exact public
types, all callers, production assembly, complete application/image acceptance
and a current parent receipt remain required before this source loses authority.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:c24bd1f1caa1f61f5c06`
