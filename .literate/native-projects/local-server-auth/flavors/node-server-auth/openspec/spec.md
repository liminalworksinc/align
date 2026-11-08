# Node-Server-Auth implementation Flavor

## ADDED Requirements

### Requirement: Node authentication module binding [authored:node-server-auth-v4]

# Node authentication target

Status: reviewed intent under the delegated Align work scope. Qualification,
admission and integration remain pending. This record is not operator security
acceptance or independent maintainer approval.

Target Node 24 or later on macOS and Linux. The application supplies the locked
Better Auth and passkey adapters at version 1.7.10. The generated library depends
only on explicit supplied resources and standard JavaScript language behavior.

Export synchronous, arity-one `create_auth` at `server_auth/create_auth` for
capability `server-auth.create-auth`. Use the dependency-free JavaScript library
layout: `source/server_auth/package.json` has name `server_auth`, type `commonjs`
and exactly `{"./create_auth":"./create_auth.js"}` as its exports map. The adjacent
CommonJS module exports the named factory through `module.exports`. Static relative
internal modules are allowed. Add no package dependencies, root export or alternate
factory. Keep the normal `source/main.js --litai-test` adapter for generated tests.

## Construction and host bindings

Read and capture the following resource properties exactly once, in this order:

```text
createHash, randomBytes, chmodSync, existsSync, readFileSync, writeFileSync,
path, passkey, betterAuth, APIError, createAuthMiddleware, getSessionFromCtx,
isAPIError, getMigrations, emailOTP, genericOAuth, config, hostAllowed,
clientNet, captchaPlugin, emailSignInEnabled, githubConfigured,
googleConfigured, localCodesPerHour, localOwnerEmail, publicOrigin,
RECENT_SIGN_IN_MS, sessionMaxDays, testIdpEnabled, testOAuthUrl,
liveCodeFor, audit, authDb, dbDir, get, LIVE_WS, run, sql, tx, nowIso,
rand32, durableCount, durableRetryAfterMs, durableRoom, otpEmailKey,
retryAfterMs, takeAll, sendSignInCode, globalState, readEnvironment,
readDate, readURL
```

These are the original 48 runtime imports plus four explicit host resources.
Do not call or validate resources while capturing them. Then call
`createAuthMiddleware` with the before callback and with the after callback, in
that order. Capture their exact returned handles for the option hooks. Do not
run the callbacks during construction. Property and middleware failures escape
unchanged. Later container changes do not replace captured handles.

Call imported function providers detached. Keep the supplied `path` object and
call its `join` method with that object as receiver. Preserve receivers on returned
hash builders, authentication adapters, cookies, headers and logging objects.
`globalState` is the caller's shared object. `readEnvironment`, `readDate` and
`readURL` are zero-argument functions called detached at each
place where the source would resolve its respective current host value. Do not
cache their results or use ambient process, filesystem, network or global state.
Call a resolved Date's `now` with that constructor as receiver; construct dates
and URLs using the resolved constructor. Ordinary input getters, coercion,
nullish fallback, method lookup and
error identity are observable.

Return exactly four constants and nine functions. Constants are:

| Name | Value |
| --- | --- |
| `AUTH_BASE_PATH` | `/api/v2/auth` |
| `TEST_OAUTH_PROVIDER` | `align-test` |
| `COOKIE_PREFIX` | `align_v2` |
| `CANNOT_SIGN_IN` | `This email can't sign in here yet. Ask a workspace owner to invite you.` |

| Function | Parameters in exact order | Arity | Kind |
| --- | --- | --- | --- |
| `isRecentSignIn` | signedInAt, optional now | 1 | Function |
| `reauthMessage` | what | 1 | Function |
| `sessionCap` | createdAt | 1 | Function |
| `passkeyParty` | none | 0 | Function |
| `tooManyCodesMessage` | waitMs | 1 | Function |
| `machineCeilingMessage` | waitMs, max | 2 | Function |
| `authOptions` | none | 0 | Function |
| `getAuth` | none | 0 | Function |
| `migrateAuth` | none | 0 | AsyncFunction |

For machineCeilingMessage, the first argument is the wait duration in milliseconds;
the second is the machine-wide code ceiling displayed in the message. Preserve
that order for detached public calls and internal refusals. These parameter
names describe argument meaning and order. Ordinary JavaScript coercion and
invalid-input behavior stay as specified; add no runtime validation.

`isRecentSignIn(signedInAt, now = current Date.now())` parses through a newly
resolved Date and accepts finite timestamps with `now - timestamp <=
RECENT_SIGN_IN_MS`. `sessionCap(createdAt)` constructs an outer Date around an
inner parsed time plus `sessionMaxDays() * 86400000`, retaining lookup and call
order. Recent-sign-in copy is exactly `Sign in again to ${what}. This needs a
sign-in from the last 15 minutes.` Code wait copy is `Too many codes were sent.
Try again in ${minutes}.`, where minutes is the ceiling of wait/60000, minimum
one, with ordinary JavaScript behavior for non-finite inputs. Machine-ceiling copy
is exactly `Align on this computer has sent ${max} sign-in codes in the last hour,
its limit for everyone who signs in here. Try again in ${minutes}, or restart Align
to clear it (ALIGN_LOCAL_CODES_PER_HOUR sets the limit).`

## Secret, origins and instance reuse

The authentication secret reads current `BETTER_AUTH_SECRET`. A truthy value is
returned without trimming, using the source's separate conditional and return
reads. Otherwise hosted mode throws `BETTER_AUTH_SECRET must be set when hosted`.
Local mode uses `path.join(dbDir(), ".auth-secret")`. If absent, write
`randomBytes(32).toString("hex")` with mode 0600. Always chmod it to 0600, read
UTF-8 and trim. Preserve effect order and filesystem failures.

`passkeyParty` reads publicOrigin before config. Hosted with a truthy public origin
uses its URL hostname and the unchanged origin. Otherwise use rpID `localhost`
and origin `http://localhost:${PORT || "3100"}`. After evaluating the callback header argument, the delivery-origin helper reads
publicOrigin first; otherwise use an allowed truthy Host prefixed by `http://`, or
`http://127.0.0.1:${PORT || "3100"}`. Preserve absent-header behavior and exceptions.

`getAuth` uses `globalState.__alignV2Auth ??= betterAuth(authOptions())`. Preserve
the nullish assignment, exact instance identity and failure/retry behavior.
`migrateAuth` awaits `getMigrations(authOptions())`, extracts runMigrations and
awaits it detached. It returns undefined.

## Exact adapter configuration

Build fresh options in the original effect order: config().hosted, publicOrigin,
googleConfigured and githubConfigured, captchaPlugin, emailSignInEnabled,
testOAuthUrl, passkeyParty, authDb and authentication secret. Read provider
environment credentials only for configured providers. Keep supplied plugin
results by identity. Plugin order is optional captcha, optional emailOTP,
optional genericOAuth, then passkey.

The emailOTP options are `otpLength:6`, `expiresIn:300`, `allowedAttempts:3`,
`storeOTP:"hashed"`, `disableSignUp:false`, `rateLimit:{window:60,max:10}` and
the delivery callback. A configured test OAuth URL supplies one genericOAuth
config with providerId and clientId `align-test`, the existing public local-fixture
clientSecret `align-test-secret`, authorize/token/userinfo paths under that URL
and scopes `["email"]`. This fixed value belongs only to the loopback test IdP.

Passkey options use the selected rpID/origin, rpName `Align`, residentKey `required`,
userVerification `preferred`, modelName `ba_passkey` and the afterVerification
callback. Its string clientData.id triggers the last-use operation.

The returned options preserve these fields, with nested paths exactly as listed:

- appName `Align`; supplied database; public basePath and secret.
- Hosted with a truthy origin: baseURL is that origin and trustedOrigins is its
  one-element array. Otherwise baseURL has allowedHosts `localhost`, `127.0.0.1`
  and `[::1]` with this exact current port, protocol `http`; trustedOrigins is empty.
- The social provider record, plugin array, disabled paths and two middleware
  handles, plus databaseHooks.session.create.before, session.update.before and
  user.create.before described by the Component.
- emailAndPassword enables `testIdpEnabled() && !hosted`, autoSignIn true,
  minPasswordLength 8 and maxPasswordLength 128.
- account modelName `ba_account`, encryptOAuthTokens true, accountLinking enabled
  true and disableImplicitLinking true. User modelName `ba_user`.
- Session modelName `ba_session`, expiresIn 604800, updateAge 86400,
  freshAge `RECENT_SIGN_IN_MS / 1000`. Verification modelName `ba_verification`.
- rateLimit enabled true, window 60, max 100, storage database when hosted and
  memory otherwise, modelName `ba_rate_limit`. Custom rules use window 60:
  sign-in/email 10, sign-up/email 10, sign-in/social 20, code send 3, code sign-in
  10, passkey/generate-authenticate-options 20 and passkey/verify-authentication 10.
- telemetry enabled false. Advanced cookiePrefix is the public prefix and
  useSecureCookies is hosted. Hosted ipAddressHeaders is `["fly-client-ip"]`;
  local disableIpTracking is true. Generate `u_${rand32(15)}` for model names
  matching `/user$/`; otherwise return rand32(20).
- logger level error. onAPIError.onError returns without logging an API error
  whose statusCode is less than 500; otherwise call ctx.logger.error with the
  original Error's message or `API error`, followed by the original error.

Disabled paths are, in order: `/get-access-token`, `/refresh-token`, `/account-info`,
`/unlink-account`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`,
`/passkey/list-user-passkeys`, `/passkey/update-passkey`, `/passkey/delete-passkey`,
`/email-otp/check-verification-otp`, `/email-otp/verify-email`,
`/email-otp/request-password-reset`, `/email-otp/reset-password`,
`/forget-password/email-otp`, `/email-otp/request-email-change`,
`/email-otp/change-email`. The exact before, after, session, user, email delivery
and passkey callbacks are part of this surface, not opaque adapter behavior.

## Request callbacks and database contracts

The before hook computes the absolute cutoff before reading the signed cookie,
even when no token exists. Resolve the outer Date constructor, then current
Date.now with its constructor receiver, then sessionMaxDays; construct the cutoff
from that time minus the configured days. Next get the signed cookie using the
configured sessionToken cookie name and context secret. With a truthy token, call adapter.deleteMany with
model `session`, where token equals it and createdAt is strictly `lt` the cutoff
Date. Sensitive routes are the two passkey registration endpoints with action
`add a passkey`, and `/link-social` with action `link an account`. Their refusals
use APIError FORBIDDEN, code reauth_required and the public message. A too-long
string name uses BAD_REQUEST, bad_request and `A passkey name is at most 100
characters`.

Preserve all send-limit keys, comparisons, transactions and ordering in the
Component. Type refusal uses BAD_REQUEST, bad_request, `Only sign-in codes are
sent`. Limit refusal uses TOO_MANY_REQUESTS, rate_limited, the public wait message
and `Retry-After` string seconds. Hosted network uses the fly-client-ip header
with nullish default `unknown`; local owner exemption compares normalized email
to localOwnerEmail exactly. Limits retain exact durations 600000 and 3600000.

An unverified account's verification identifier is `sign-in-otp-${email}`. Hash
with createHash("sha256").update(code).digest("base64url"). Use the last colon
as the attempt separator; no suffix means zero. Attempts >= 3 and mismatching
hashes return to the adapter. A verification is expired only when expiresAt is
strictly earlier than the current Date; exact equality remains live. A correct,
live code deletes the verification, then throws
FORBIDDEN, email_unverified and `This account's email address is not verified, so
an email code can't sign in to it.`

Delivery failures are tracked in an instance-owned WeakSet keyed by the original
request. Attempt verification deletion and suppress only its rejected promise.
Without a request throw `The sign-in code could not be delivered`. The after hook
throws INTERNAL_SERVER_ERROR, email_failed and `The sign-in email could not be
sent. Try again later.` for a tracked send request. Successful passkey registration
audits `passkey.added`, with null workspace, returned user ID, returned credential
ID and nowIso, inside tx. Skip Error instances and non-string IDs.

The database statements and parameter ordering remain exact:

1. Hosted invite admission finishes current Date.toISOString first, then calls
   LIVE_WS("ws_id") and get with
   `SELECT 1 AS x FROM v2_invites WHERE email = ? AND accepted_at IS NULL AND expires_at > ? AND ${livePredicate}`,
   email and the captured timestamp. A false result proceeds to
   liveCodeFor(sql,email), then the normalized current ALIGN_FIRST_OWNER_EMAIL,
   and only when the normalized setting is nonempty and matches to
   get("SELECT 1 AS x FROM ba_user LIMIT 1").
2. Passkey use runs the single-line statement
   `INSERT INTO v2_passkey_use (passkey_id, last_used_at) SELECT id, ? FROM ba_passkey WHERE credentialID = ? ON CONFLICT (passkey_id) DO UPDATE SET last_used_at = excluded.last_used_at`,
   nowIso and the supplied credential ID, inside tx. Preserve the transaction
   callback's exact run result and the outer asynchronous undefined result.

Session callback caps preserve data spreads, untouched-result undefined and Date
objects. The user callback applies only to `/sign-in/email-otp`, lowercases
String(user.email), follows admission precedence and throws FORBIDDEN,
cannot_sign_in with the public refusal. Missing names use the original local part
slice; present names leave the input unchanged. Do not add validation or cleanup.

## Independent acceptance

Preserve all 264 owned source observations and the 12 actual adapter/schema/
request observations on each host. These are private acceptance inputs, never
generation prompts. Construction, dynamic-host and provider-failure controls
remain additional required verifier work. Use the real locked configured adapters
for complete schema, populated migration and code-sign-in checks. Keep original
source, private commands and evidence outside generation requests. The original
source remains authoritative until ordinary regenerative qualification and actual
parent consumer, type, application/image and receipt acceptance all pass.

## Provider signatures and callback fidelity

`config` is a captured zero-argument function that returns an object with a
`hosted` property. Resolve hosted mode through a fresh detached `config()` call
every time this contract reads hosted configuration. The captured function itself
has no hosted property. The original callable providers remain callable; `path`,
`sql` and `globalState` retain their supplied object identities, and
`RECENT_SIGN_IN_MS` remains the supplied numeric interval.

In authOptions, read config().hosted and publicOrigin first. Then call
googleConfigured and, when true, read the current GOOGLE_CLIENT_ID and
GOOGLE_CLIENT_SECRET and finish that provider entry. Only then call
githubConfigured and, when true, read the current GITHUB_CLIENT_ID and
GITHUB_CLIENT_SECRET. Resolve the environment separately at each original
credential-property access. Continue with captchaPlugin, emailSignInEnabled,
testOAuthUrl, passkeyParty, the port read, authDb and secret, in the original
order. Preserve the conditional calls inside secret and passkeyParty as well.
The disabledPaths array is created once for this factory and remains the same
mutable array across option calls. Other fresh option records retain their
original freshness and provider result identities.

Middleware before and after callbacks are asynchronous and have arity one.
Database session-create before is asynchronous with arity one; session-update
before and user-create before are asynchronous with arity two. The email delivery
callback is an asynchronous `sendVerificationOTP` with arity two. Its first
argument supplies email, otp and type; its second argument is the exact supplied
callback context. Passkey afterVerification is asynchronous with arity one.
The configured generateId and onAPIError.onError callbacks are synchronous with
arity one and two respectively. The send-limit, passkey-audit and passkey-use
transaction callbacks are synchronous. Their exact immediate return values
remain observable to the transaction provider.

The email delivery callback refuses a type other than sign-in with the specified
BAD_REQUEST answer before delivery and outside its catch boundary. Its delivery
try includes origin resolution and the sendSignInCode call. Resolve delivery
headers from the callback request's headers, with the callback's own headers as
the nullish fallback. A missing callback context is supported. On a caught
failure, use that same context's internalAdapter.deleteVerificationByIdentifier
with the original email identifier and suppress only the returned promise's
rejection. Preserve the optional context chain and synchronous lookup failures.
Then track that exact context's request, or throw the direct delivery error when
it has no request. Cleanup uses the callback adapter supplied to this operation.

The user-create callback lowercases String(user.email) without trimming it.
Pass that lowercase value through admission. When a missing name needs a default,
use the lowercase value's local part and slice it to 100 characters. Spread the
original user record into the returned data and override only that default name.
Session-create uses createdAt's nullish fallback to a new current Date, including
ordinary invalid and zero values; it retains the original conditional expiry
check. Session-update reads its supplied context and returns undefined unchanged
when expiry or creation time is absent.

Construct ordinary refusals with the two specified APIError arguments. Only a
rate-limit refusal supplies the third Retry-After headers argument. Preserve
failed option construction, callback execution and shared-instance retry
behavior without adding provider calls or alternate adapter lookups.

## Passkey plugin shape and awaited last-use work

The passkey plugin receives an options object with exactly these top-level keys:
`rpID`, `rpName`, `origin`, `authenticatorSelection`, `schema`, `authentication`.
`authenticatorSelection` contains residentKey and userVerification as specified.
`schema` contains `passkey`, whose modelName is ba_passkey.
`authentication` contains the asynchronous `afterVerification` callback.
The callback is nested at `options.authentication.afterVerification`.

That callback has one destructured argument supplying `clientData`. Read
clientData.id directly and preserve its ordinary lookup failures. When that id
is a string, await the complete last-use operation and propagate its failure.
The last-use operation first calls nowIso outside the transaction. It then
awaits tx with a synchronous callback that returns the exact run result for the
specified passkey statement, the already captured timestamp and credential ID.
The outer last-use operation and afterVerification resolve to undefined.
An id with another type performs no last-use work. All configured plugin fields
and nesting are part of the public adapter contract at version 1.7.10.

## Exact send-limit provider protocol

All limit records have the shape `{key, max, windowMs}`. durableRoom,
durableCount, durableRetryAfterMs, takeAll and retryAfterMs each take two
arguments: an array of these records, then the same numeric current time.
otpEmailKey takes the normalized email and returns the durable key.

The first in-memory record has key `otp-email:${email}`, max 3 and windowMs
600000. With a request, read current config().hosted. Hosted adds key
`otp-client:ip:${clientNet(request.headers.get("fly-client-ip") ?? "unknown")}`,
max 10 and windowMs 3600000. Local compares the email to localOwnerEmail; a
different email adds the ceiling record with key `otp-client:local`, max from
localCodesPerHour() and windowMs 3600000. Preserve that ceiling record's identity
for later retry lookup. Without a request, this stage reads no client config.

After the request stage, independently call config().hosted to choose the
durable array. Hosted supplies one record with otpEmailKey(email), max 5 and
windowMs 3600000; local supplies an empty array. Finish these reads before tx.

Await tx with a synchronous callback. In that callback, read current Date.now
once and pass that time to every limit provider. Call durableRoom with the
durable array even when it is empty. Only when room succeeds call takeAll with
the complete in-memory array. When both admit the send, call durableCount with
the durable array even when empty, then return `{wait: 0, ceilingWait: 0}`.

On either refusal, compute wait as the maximum of durableRetryAfterMs for the
durable array and retryAfterMs for the complete in-memory array, in that order.
When a ceiling exists, compute ceilingWait with retryAfterMs for a one-element
array containing that exact ceiling record; otherwise ceilingWait is zero.
Return `{wait, ceilingWait}` from the transaction callback. Consume the object
returned by the awaited transaction. Only after it completes, throw a rate-limit
answer when wait is strictly greater than zero. Use the machine wording only
when the ceiling exists, ceilingWait is positive and ceilingWait is at least
wait. Provider argument arrays, clock, calls with empty arrays, short circuiting,
callback return values and this transaction boundary are observable behavior.

## Exact request guards and passkey audit arguments

The unverified-email branch runs only for path `/sign-in/email-otp`, a nonempty
normalized string email and a string body.otp. Missing or non-string otp leaves
this branch without account, verification or hash work. Preserve the already
normalized email. The unverified-account and live-correct-code rules remain as
specified above.

For `/passkey/verify-registration`, read the result at ctx.context.returned.
A truthy result that is not an Error and has string result.id and result.userId
is auditable. Read id and userId in that order after the type checks. Await tx
with a synchronous callback. Inside that callback call nowIso, then call audit
with exactly these five positional arguments:

| Position | Value |
| --- | --- |
| 0 | null workspace |
| 1 | captured userId |
| 2 | `passkey.added` |
| 3 | captured id |
| 4 | the timestamp just returned by nowIso |

Return the exact audit result from the transaction callback. The after hook
awaits the transaction and resolves to undefined. Preserve property lookup,
provider return and rejection behavior throughout this operation.

## Exact callback access and short circuit boundaries

Sensitive recent-sign-in routes finish after the session check and optional
passkey-name check. They return undefined immediately and never read email,
type or otp. The name lookup reads ctx.body once. Other routes read ctx.body
once, apply its nullish fallback to one empty object, and retain that body for
the remainder of the callback. The string email guard reads body.email for the
type check and again for normalization. Later type and otp reads use the same
captured body, even if the context's body getter changes. Preserve callback
property reads, order and thrown getter identity.

For verification expiry, compare the supplied expiresAt value directly with a
new current Date using JavaScript's less-than operator. Do not parse or wrap
expiresAt in another Date. Resolve the Date constructor once for that comparison,
after reading expiresAt. Ordinary relational coercion, numeric-string values,
null values, valueOf calls and Symbol.toPrimitive's numeric hint are observable.
Keep the original short circuit when verification is absent and the subsequent
last-colon, attempt-count and code-hash guards.

Delivery cleanup has an optional chain at the callback context only. A nullish
context skips the complete cleanup expression. A present context must supply
context.internalAdapter and its deleteVerificationByIdentifier method. Missing
or null nested objects, missing methods and synchronous method throws propagate
immediately. Call catch on the method's returned promise and suppress only that
promise's rejection. A non-promise return whose catch cannot be called fails.
Do not add optional segments, alternate adapters or a catch around this lookup.
Only after cleanup completes does the callback read the request to track a
failure or throw the specified direct delivery error. Owned errors preserve
their exact identity.

Session-update reads ctx with an optional chain only at ctx and at the outer
session property: a nullish ctx produces absent createdAt; a present ctx must
have a non-null context. A nullish context.session produces absent createdAt.
A present context.session must have a non-null session object whose createdAt
is read directly. Missing nested objects fail before inspecting the supplied
session's expiresAt. Do not add optional segments that turn those failures into
undefined. Keep the existing expiry and createdAt guard after that lookup.

Hosted email-code admission constructs a new current Date and finishes
toISOString before reading LIVE_WS or querying the invite. Keep that captured
timestamp as the invite query's final argument. After a failed invite and failed
liveCodeFor lookup, resolve the current first-owner environment field, apply its
existing falsy default, trim and lowercase. The resulting setting must itself
be nonempty before comparing to the email. Query ba_user only if the nonempty
setting equals the normalized email. Empty or whitespace-only owner settings
cannot admit even an empty email and must not query ba_user. Preserve short
circuits, failures and the existing refusal.

Before entering the delivery-origin helper, evaluate the callback request's
headers and its nullish fallback to callback headers. These getter reads happen
even when publicOrigin will return a truthy value. Only after evaluating the
argument does the helper read publicOrigin. A truthy origin avoids inspecting
the headers object's get method, but does not avoid evaluating that argument.
A throwing request or headers getter remains inside delivery's try boundary
and proceeds through the same cleanup and request-tracking behavior. Keep each
original request lookup; do not cache the callback request across this operation.

All 264 owned source observations and 68 binding records remain required.
They comprise the original 175 observations, 48 callback precision observations
and 41 session/coercion/context observations. The 35 private qualification
batches and original reference commands remain private acceptance data, excluded
from generation requests. Actual configured-provider checks on both hosts,
separate admitted generation, typed consumers, app/image checks and current
receipts remain necessary.

## Session expiry conversion and before-hook lookup order

Session-create first computes the cap from createdAt with its existing nullish
fallback. It then reads expiresAt for the truthiness guard. When truthy, resolve
a fresh Date constructor, read expiresAt again and construct a Date from that
value before comparing to the cap. A valid ISO-string expiry beyond the cap must
produce the capped result. Keep invalid-date, zero, null, numeric, string and
custom coercion behavior. Do not compare the supplied expiry directly to a Date.
The returned spread reads the original session fields and overrides expiresAt
with the cap. The fresh Date construction and its host lookup are observable.

Session-update retains its exact context chain and reads createdAt before the
session's expiry guard. After the expiry and creation-time guards, compute the
cap, resolve a fresh Date constructor and construct a Date from a fresh expiresAt
read before comparing. Preserve the same ISO-string capping and coercion rules
as session-create. Do not omit that conversion or cache the expiry across its
original guard, conversion and spread reads.

Recent-action selection reads ctx.path exactly once to obtain the action for
that selection. Do not select the action through repeated ctx.path reads. The
later send-path and sign-in-path checks each read ctx.path fresh at their own
points; do not cache path across the callback. The sensitive route returns
after its session/name work. The send branch also returns after its type guard,
empty-email check and awaited limit operation. It never falls through to the
sign-in-path check. Provider calls may perform their own context reads; preserve
the original supplied context object and let those reads occur normally.

The send-limit request stage first reads ctx.request for its truthiness guard.
Only when truthy does it call config().hosted for client-mode selection. Hosted
then reads ctx.request again before reading headers and the fly-client-ip value.
Local client selection does not perform that second request read. Do not capture
ctx.request into a helper argument before the guard and reuse it for the later
hosted lookup. Keep the independent durable config read after this stage and
the original body/email short circuits before it.

Verification-value parsing first reads value to call lastIndexOf with a colon.
With no colon, read value again for the stored hash and use zero attempts. With
a colon, read value and finish slice(0,index) for the stored hash before reading
value again for slice(index+1) and Number conversion of the attempt count. Only
after both have been computed does the attempts guard precede code hashing.
Do not reverse stored-hash and attempts reads. A changing or throwing value
getter remains observable, along with the original hash/deletion decisions.

Independent acceptance compares every existing expected result unchanged.
The source reference, private batches and expected results stay outside
generation requests. Configured-provider acceptance, source review, typed
consumers, full app/image and current receipt gates remain required.


#### Scenario: Complete authentication configuration and callback surface

- **WHEN** the Node target is selected
- **THEN** Capture the 52 declared resources once, preserve four constants, nine functions and all nested callback behavior, and retain caller ownership of adapters, persistence, delivery, configuration and shared state. Resolve hosted configuration through the supplied function, preserve exact asynchronous callback signatures and synchronous transaction callbacks, current credential-read order, callback-context cleanup, lowercase default names and cutoff work before cookie reads. Use the exact passkey option nesting, awaited last-use work, two-argument array-and-clock limit providers, stable limit keys, guarded string OTP, and ordered registration audit arguments. Preserve each public parameter in its declared order, including machineCeilingMessage(waitMs, max).
