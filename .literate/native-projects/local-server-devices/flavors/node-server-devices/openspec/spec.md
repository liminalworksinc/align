# Node-Server-Devices implementation Flavor

## ADDED Requirements

### Requirement: Node device pairing binding [authored:node-server-devices-v3]

# Node device pairing binding

## Package, resources and native behavior

Export `create_devices(resources)` from dependency-free CommonJS package
`server_devices`, containing exactly `create_devices.js` and `package.json`.
The export map is `{"./create_devices":"./create_devices.js"}`. The only export
is synchronous create_devices, with that name and length 1. CommonJS and ESM
imports expose the same factory. Root build/test/package adapters are separate.

Capture these 24 resources once, in order:

`createPublicKey, verify, randomInt, config, all, audit, get, LIVE_WS, run, tx,
V2Error, badRequest, conflict, event, newId, nowIso, secretToken, sha256hex,
retryAfterMs, take, takeAll, endSessions, readDate, readBuffer`.

Never enumerate resources, defer capture or replace a supplied function. Call
functions bare, with the original argument identity and order. V2Error is a
supplied constructor and must be used with new. readDate() and readBuffer() give
the live constructors at each original lookup. Preserve every static Date now,
parse and constructor site and every Buffer.from site, including lookup order
and native invalid-input behavior. Do not hold either constructor at factory
creation. No ambient application Date, Buffer, process, crypto import, network,
filesystem, environment, timers or randomness belongs in the runtime module.

Preserve JavaScript truthiness, nullish choices, short circuits, repeated property
reads, native iterators, Set insertion order, JSON and regex semantics, and exact
thrown values. Do not pre-read or normalize inputs, cache fields or services,
replace native errors, or tighten validation. In particular, native Buffer.from
must perform its own invalid-object property reads on the selected host. Do not
imitate another Node version's error path. All original supplied callback returns
and transaction results remain observable to the supplied transaction.

The selected JavaScript Flavor owns the Node host toolchain, compatible range
and executable/version probe. Use that selected host for builds and checks. The
library adds no third-party source dependency. Report genuine additional source
dependencies with normal locks/evidence; do not declare a second unresolved Node
source-package range for the already selected host. Preserve normal source,
dependency, SBOM and host gates. Invent no version and edit no generated SBOM.

Return the thirty own enumerable members in the exact order specified below.
Preserve every function name, length and async kind, every literal value and the
two caller-owned public TypeScript types. No new public runtime member is allowed.

## User and code helpers

userById runs Q01 with id. An absent row returns undefined. Otherwise return id,
name, email and emailVerified in order, with boolean coercion of emailVerified.
Do not require verification or return the row directly.

Use the exact user-code alphabet `BCDFGHJKLMNPQRSTVWXZ`. Generating a user code
makes eight successive randomInt(alphabet.length) calls and indexes that alphabet,
then joins the first four and last four characters with one hyphen. Add no other
randomness. normalizeUserCode calls input.toUpperCase(), removes every non A-Z
character using the native regex, then requires exactly eight characters all in
that alphabet. Otherwise return null. On success return four, hyphen, four.
Preserve native errors for non-string objects without that method.

The public-key helper calls readBuffer().from(value, "base64url"). Require raw
length exactly 32 and an exact base64url round trip equal to the original value.
On either failed test throw badRequest with the exact message
`public_key must be a base64url Ed25519 public key (32 bytes)`.
Only the subsequent createPublicKey call is caught: call it with
{key:{kty:"OKP",crv:"Ed25519",x:value},format:"jwk"}; any error from that call
becomes the same badRequest. Buffer lookup/decoding/round-trip errors occur
outside that catch and retain native identity.

## Authorize pairing

authorize(input, client, origin) is async even for early refusal. Validate
input.public_key first. Create one limit object with key
`device-authorize:${client}`, max 10 and windowMs 60 * 60 * 1000. Call takeAll
with a new single-element array holding that object. Only on a false result,
call retryAfterMs with another array holding the same limit object and refuse
with the pairing-limit error below. Do not spend entropy or read the clock first.

For the limit error, whole minutes are Math.max(1, Math.ceil(waitMs / 60000));
use "1 minute" only when exactly 1, else the number followed by " minutes".
Read config().hosted to select the exact message:

- Hosted: `Too many device pairings were started from this network in the last hour (the limit is 10). Try again in ${wait}.`
- Local: `Align on this computer has started 10 device pairings in the last hour, its limit for everyone who pairs here. Try again in ${wait}, or restart Align to clear it.`

Construct V2Error(429,"rate_limited",message,
{retry_after:Math.max(1,Math.ceil(waitMs/1000))}). Preserve native numeric behavior.

After successful limit take, obtain secretToken(32) as the device code, then sample
the live Date.now once. Await tx with a synchronous callback. Try at most ten
candidate user codes. For each run Q02; an existing code continues immediately,
without cleanup. For a free code, run Q03 with an ISO timestamp at held now minus
one hour, retaining approved rows and strict expiry comparison. Then run Q04 in
the exact bind order. input.device_name and input.public_key are read at this
write, independently of validation. Return the candidate code from the callback.
After ten collisions throw V2Error(503,"busy","Try again") inside the transaction.

After tx resolves, return device_code, user_code, verification_uri as origin plus
`/app/device`, expires_in 600 and interval 5, in order. Do not normalize the origin
or add a slash rule. Failures roll back supplied transaction writes.

## Token issuance and polling

The internal issuer obtains two successive secretToken(32) results, prefixing the
first with alnd_ and the second with alnr_. Construct at from the supplied nowMs.
Run Q05 then Q06 with SHA-256 of each token, device id, at and the respective ISO
expiry. Access lifetime is 3600 seconds; refresh is 30 * 24 * 3600 seconds. Run
Q07 for this device and strict expires_at < at. Retain rotated refresh rows until
they expire. Return access then refresh. No plaintext token is persisted here.

token(deviceCode, replaces = null) is async, name token and length 1. Hold live
Date.now and its ISO string before tx. The transaction must return an outcome so
poll bookkeeping commits before any resulting OAuth error is thrown outside it.
In its synchronous callback:

1. Q08 reads the request by sha256hex(deviceCode). Missing returns error
   invalid_grant. Consumed, or native Date.parse(expires_at) <= held now, returns
   expired_token, before poll bookkeeping.
2. If last_poll_at is truthy and the elapsed time is strictly below interval_s
   seconds, run Q09, setting last poll and increasing interval by 5, then return
   slow_down. Equality is allowed through. Otherwise run Q10 first.
3. Denied now returns access_denied; pending returns authorization_pending.
4. For an approved row, obtain userById only for truthy user_id. Missing user
   returns access_denied. Allocate newId("dv"). The stored replacement is the
   supplied replaces only when truthy and Q11 finds this person's live device;
   otherwise null. The naming helper still receives the original replaces.
5. Run Q12. Its name bind evaluates the naming helper below before reading the
   request public key and remaining binds. Preserve this evaluation order.
6. Parse request.ws_ids_json || "[]" without extra validation. Iterate it in
   order. For each ws, call LIVE_WS("ws_id") while constructing Q13, then bind ws
   and user.id. Only a found live membership runs Q14 and appends ws to granted.
   Keep duplicate ids if the supplied saved array has them.
7. Run Q15 to consume this request. Call audit(null,user.id,"device.paired",
   deviceId,at). For each granted ws call event("device_paired",
   {ws,user:user.id,props:{workspaces:granted.length},at}) in order.
8. Issue tokens with the held time. Return ok containing device_id, access_token,
   expires_in 3600, refresh_token and user {id,name,email}, in order.

After commit, use the native "error" in outcome membership test. On that branch,
read outcome.error once into the error-helper argument, retaining the original
held code for the constructor and its replaceAll message. Do not substitute a
truthiness check or repeatedly read the outcome field. An outcome containing error throws a new supplied V2Error with
status 400, code that error string and message replacing every underscore with a
space. Otherwise return its ok object. Refusals before or after bookkeeping must
retain their different durable effects. Do not throw the outcome error in tx.

## Name reservation and same-machine replacement

The distinct-name helper runs Q16 for the person's live names excluding replaces
or empty string, then appends held names into a Set. Return the requested name
when free. Otherwise return the first free suffix " (n)" for n starting at 2.
Do not reorder suffix search or count another person's devices.

The held-name helper runs Q17 with user id, except request id and the supplied
time's ISO value, mapping approved_name. Only other approved, non-null names
strictly unexpired at that time reserve a name.

At token polling, read held names first, then Q18 only for truthy raw replaces.
If the old live device belongs to the person, find the free requested name while
excluding it. If this free result equals request.device_name, or the old name is
not in that requested name's numeric family, return free. Otherwise test whether
held includes old.name or Q19 finds another live device holding old.name whose
replaces is absent or different. Return free when taken, else the old name.
Preserve this short circuit and the concurrent replacements exclusion in Q19.

Without that old device, preserve a truthy approved_name when Q20 finds no live
device holding it. Otherwise run distinct-name with replaces null and held names.
Do not recompute every approved name or ignore later collisions.

The numeric-family helper returns 1 for exact equality. Otherwise use the native
regex /^(.*) \((\d+)\)$/ on the other name; only an exact base match returns
Number of its captured digits. A different family returns null. Preserve native
leading-zero and numeric conversion behavior.

## Signed refresh and replay

refreshMessage is the three-argument arrow function with that name and length 3.
Return the exact string `align-refresh\n${deviceId}\n${sha256hex(refreshToken)}\n${ts}`,
with actual newline separators and no trailing newline. Hash through the supplied
function, retaining exact arguments. Do not sign or hash a different encoding.

refresh(input) is async. Its invalid-error helper constructs
V2Error(401,"invalid_grant","invalid grant",reason ? {reason} : undefined).
Hold live Date.now, then Q21 with input.device_id. Missing device refuses with
reason unknown_device. Parse input.ts using live Date.parse; NaN refuses without
reason, before signature work.

Initialize ok false. Inside one try call verify with algorithm null; a live
Buffer.from of refreshMessage(input.device_id,input.refresh_token,input.ts) in
utf8; the public-key helper on device.public_key; then a live Buffer.from of
input.sig in base64url. Preserve that argument order. Any failure in this whole
try sets ok false. Do not add canonical signature checks or turn these caught
errors into separate public refusals.

Next, a truthy revoked_at refuses. Only when ok may its reason be disclosed as
device.revoked_reason || "revoked". A bad signature discloses no reason. For an
unrevoked device, !ok refuses without reason. Only then enforce an absolute clock
distance strictly greater than five minutes. Equality is accepted. The minutes
are Math.round((signed time - held now) / 60000). Construct V2Error(400,
"clock_skew", `This device's clock is ${Math.abs(minutes)} minutes ${minutes > 0 ? "ahead of" : "behind"} the server's`,
{server_time:ISO of a new live Date at held now}). Nothing rotates on this path.

For a valid signature and clock, await tx with one synchronous callback. Q22
binds a fresh read of input.refresh_token through sha256hex, then input.device_id.
Missing token returns null. A truthy rotated_at revokes this device inside tx
with reason refresh_reuse and actor null, then returns null. Otherwise native
Date.parse(expires_at) <= held now returns null. On a live token run Q23, then
Q24, preserving each live input and Date lookup. Issue a new token pair, returning
access_token, expires_in and refresh_token. After commit, a falsy outcome throws
invalid without reason. Reuse revocation and session ending stay committed even
though refresh refuses. All other supplied failures propagate or roll back at
their original boundaries.

## Revocation and device-name handoff

The revoke-in-transaction helper first calls nowIso. Run Q25 with this at, reason
and device id, preserving COALESCE so existing timestamp/reason survive. Run Q26
to remove all this device's tokens. Run Q27 and pass its exact returned rows to
endSessions(rows,"device_signed_out",at), including suspended but not already
stopped sessions. Then audit(null,actor,"device.revoked",deviceId,at). This helper
does not make its own transaction.

revokeDevice(deviceId,reason,actor,replacedBy=null) is async with length 3. Await
tx with a synchronous callback that revokes and, only for truthy replacedBy,
performs name handoff. Its outer result remains undefined.

Handoff Q28 then Q29 reads the gone and next devices. Return for missing values,
different users or truthy next.revoked_at. Evaluate this guard in the original
short-circuit order: !gone, !next, next.user_id, gone.user_id, then
next.revoked_at. The inequality reads next.user_id before gone.user_id. Swapping
these operands changes supplied-row getter and failure order even though the
boolean relation is symmetric. Do not reverse or pre-read them. Apply the numeric-suffix regex to
next.name; no match returns. Q30 obtains the optional requested name for nextId.
If that equals next.name, retain the name the person explicitly asked for. Find
the gone name's number in the next suffix's base family. Return for null or a
number >= next's number. Q31 then checks any other live device of the same person
holding the gone name, excluding nextId; if found return. Only then Q32 passes
gone.name to nextId. Preserve all read and short-circuit order.

revokeDevicesOf(userId,reason,actor) is synchronous, inside the caller's tx.
Q33 finds unrevoked ids. For each row's id invoke the same revoke helper in order.
Return the original ids.length. Add no transaction or replacement handoff here.

## Access principal

deviceFromAccessToken is synchronous. Apply exactly the native regex
/^alnd_[A-Za-z0-9_-]{20,100}$/; a false test returns null before services. Q34 uses
sha256hex(tokenValue). Missing row, truthy revoked_at or native expiry <= live
Date.now returns null, preserving short circuits and clock lookup order. Then
userById(row.user_id); missing user returns null.

When last_seen_at is falsy or native elapsed time is strictly more than five
minutes, try only Q35 with nowIso and row.device_id. Swallow its error as best
effort; do not swallow later grant-read failures. Equality does not update.
Q36 calls LIVE_WS("g.ws_id") and binds row.user_id then row.device_id. Map ws_id
and construct a real Set in that order. Only live memberships and non-deleted
workspaces grant access. Return kind:"device", user:{id,name,email}, deviceId,
deviceName and grants. Do not expose emailVerified or return a JSON array for Set.

## Browser input, lookup and approval

userCodeOf reads body.user_code once. For a string use trim, otherwise empty.
Falsy text throws badRequest(EMPTY_CODE); length > 20 throws badRequest(LONG_CODE).
Return the held trimmed string. Do not return the normalized pairing code here.

workspaceIdsOf holds body.workspace_ids ?? []. Require an array and reject any
element that is not a string or whose trimmed length exceeds 64, using
badRequest(WORKSPACES_UNREADABLE). Then check raw array length > 50 and throw
badRequest(TOO_MANY_WORKSPACES). Only afterward trim each value, remove falsy
values and deduplicate with a Set, preserving first order. Fifty duplicates are
allowed but 51 duplicates refuse before deduplication. Do not reorder these checks.

The pending-by-code helper defaults its time from a live Date.now before its body.
Normalize the code. Query Q37 only for truthy normalization. Missing request,
non-pending state or native expiry <= the held time throws V2Error(404,"not_found",
"No device is waiting for that code. Check it, or run align login again.").

lookupRequest first take(`device-lookup:${userId}`,20,10*60*1000), then the pending
helper. Return device_name, requested_at, age_seconds as
Math.max(0,Math.round((a fresh live Date.now - live Date.parse(created_at))/1000)),
and expires_at. Do not reuse the earlier pending-check clock for this age.

For same-name devices, Q38 maps each name and its numeric-family result, keeps
non-null results, sorts numerically ascending and maps names back. Preserve
stable ties, repeated native property reads and all numeric-family behavior.

decideRequest first take(`device-decide:${userId}`,20,10*60*1000), then return tx
with one synchronous callback. Read the pending request inside it. A decision
exactly deny runs Q39 and returns {state:"denied"}, without requiring workspaces.
Otherwise empty wsIds throws badRequest("Choose at least one workspace for this device").
Iterate wsIds and run Q40, including each LIVE_WS("ws_id") lookup. A missing live
membership throws V2Error(404,"not_found",WORKSPACE_CHOSEN_NOT_YOURS) before any
approval write. Compute distinct name from requested name, replaces null, and held
names sampled with a fresh live Date.now. Q41 stores JSON.stringify of original
wsIds and that name. Return state:"approved", device_name, asked_as from the
request's original name and same_name from the helper, in order. Preserve repeated
field/iterator reads, direct-call duplicate ids and transaction result identity.

## Lists, workspace grants and ownership

listDevices runs Q42 by user. For each row spread its fields then append workspaces
from Q43 with that row's id. Hide deleted workspaces as Q43 declares; do not add
a membership filter or return only live devices. liveDevicesOf runs Q44 by user,
returning its rows directly, sorted case-insensitively by name then id, with no
revoked device. Last-seen ordering must not replace name ordering.

addWorkspaceToDevices is synchronous inside the caller's transaction. Iterate
deviceIds without copying or deduplicating. For each id, Q45 must find the same
person's unrevoked device; otherwise throw V2Error(404,"not_found",DEVICE_NOT_YOURS).
Then Q46 grants and audit(wsId,userId,"device.workspace_added",id,at). Audit each
input occurrence even for an ignored duplicate insert. Return the exact input
deviceIds array. Add no transaction or workspace membership check here.

grantWorkspace samples nowIso before awaiting its tx. Inside the synchronous
callback, Q47 first checks this person's live device. Otherwise throw a new
V2Error(404,"not_found", "This device is not one of your paired devices any more (it may have been signed out), so it was given nothing.").
Next Q48, with LIVE_WS("ws_id"), must find the person's live membership; otherwise
V2Error(404,"not_found",WORKSPACE_NOT_YOURS). Only then Q49 checks duplicate grant;
if found throw conflict("already_granted","This device already has this workspace").
Use addWorkspaceToDevices(userId,wsId,[deviceId],at), preserving its repeated
device check and audit. After commit return device_id and workspace_id.

deviceOwnedBy(deviceId, userId) is synchronous with length 2. Its first argument is
the device id and its second argument is the user id. Run Q50 with the first
argument deviceId followed by the second argument userId, then boolean-coerce the
found row. Do not reverse this public signature to match other user-first helpers.
It includes revoked devices. Do not turn this ownership helper into a live-device
or workspace-membership check.

## Runtime metadata and exact SQL

The following metadata is the public return order. Literal values and function
kinds are binding. The fifty SQL programs retain their literal whitespace and
ordered binds. Dynamic LIVE_WS expressions call the supplied function at every
original site. A Date expression in a bind means a new lookup of supplied
readDate at that site, preserving constructor/static behavior and errors.

```json
{
  "ACCESS_TTL_S": {
    "kind": "value",
    "value": 3600
  },
  "REFRESH_TTL_S": {
    "kind": "value",
    "value": 2592000
  },
  "CODE_TTL_S": {
    "kind": "value",
    "value": 600
  },
  "POLL_INTERVAL_S": {
    "kind": "value",
    "value": 5
  },
  "userById": {
    "kind": "Function",
    "length": 1,
    "name": "userById"
  },
  "normalizeUserCode": {
    "kind": "Function",
    "length": 1,
    "name": "normalizeUserCode"
  },
  "authorize": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "authorize"
  },
  "token": {
    "kind": "AsyncFunction",
    "length": 1,
    "name": "token"
  },
  "refreshMessage": {
    "kind": "Function",
    "length": 3,
    "name": "refreshMessage"
  },
  "refresh": {
    "kind": "AsyncFunction",
    "length": 1,
    "name": "refresh"
  },
  "revokeDevice": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "revokeDevice"
  },
  "revokeDevicesOf": {
    "kind": "Function",
    "length": 3,
    "name": "revokeDevicesOf"
  },
  "deviceFromAccessToken": {
    "kind": "Function",
    "length": 1,
    "name": "deviceFromAccessToken"
  },
  "userCodeOf": {
    "kind": "Function",
    "length": 1,
    "name": "userCodeOf"
  },
  "workspaceIdsOf": {
    "kind": "Function",
    "length": 1,
    "name": "workspaceIdsOf"
  },
  "WORKSPACES_PER_APPROVAL": {
    "kind": "value",
    "value": 50
  },
  "WORKSPACES_UNREADABLE": {
    "kind": "value",
    "value": "This approval doesn't say which of your workspaces the device may use, so nothing was approved. Tick your workspaces again."
  },
  "TOO_MANY_WORKSPACES": {
    "kind": "value",
    "value": "One approval can give a device at most 50 workspaces, so nothing was approved. Tick fewer workspaces."
  },
  "LONG_CODE": {
    "kind": "value",
    "value": "That code is too long. Enter the code shown by align login."
  },
  "EMPTY_CODE": {
    "kind": "value",
    "value": "Enter the code shown by align login."
  },
  "lookupRequest": {
    "kind": "Function",
    "length": 2,
    "name": "lookupRequest"
  },
  "decideRequest": {
    "kind": "AsyncFunction",
    "length": 4,
    "name": "decideRequest"
  },
  "WORKSPACE_CHOSEN_NOT_YOURS": {
    "kind": "value",
    "value": "A workspace you ticked is not one of yours any more (it was deleted, or you left it or were removed from it), so nothing was approved. Tick your workspaces again."
  },
  "listDevices": {
    "kind": "Function",
    "length": 1,
    "name": "listDevices"
  },
  "liveDevicesOf": {
    "kind": "Function",
    "length": 1,
    "name": "liveDevicesOf"
  },
  "DEVICE_NOT_YOURS": {
    "kind": "value",
    "value": "A device you chose is not one of your paired devices any more (it may have been signed out), so nothing was joined."
  },
  "addWorkspaceToDevices": {
    "kind": "Function",
    "length": 4,
    "name": "addWorkspaceToDevices"
  },
  "WORKSPACE_NOT_YOURS": {
    "kind": "value",
    "value": "This workspace is not one of yours any more (it was deleted, or you left it or were removed from it), so the device was given nothing."
  },
  "grantWorkspace": {
    "kind": "AsyncFunction",
    "length": 3,
    "name": "grantWorkspace"
  },
  "deviceOwnedBy": {
    "kind": "Function",
    "length": 2,
    "name": "deviceOwnedBy"
  }
}
```

Q01, supplied `get`:

```sql
SELECT id, name, email, emailVerified FROM ba_user WHERE id = ?
```

Binds in order: `id`.

Q02, supplied `get`:

```sql
SELECT 1 AS x FROM v2_device_requests WHERE user_code = ?
```

Binds in order: `c`.

Q03, supplied `run`:

```sql
DELETE FROM v2_device_requests WHERE expires_at < ? AND state <> 'approved'
```

Binds in order: `new Date(now - 3600_000).toISOString()`.

Q04, supplied `run`:

```sql
INSERT INTO v2_device_requests (id, device_code_hash, user_code, device_name, public_key, created_at, expires_at, interval_s, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
```

Binds in order: `newId("dr")`, `sha256hex(deviceCode)`, `c`, `input.device_name`, `input.public_key`, `new Date(now).toISOString()`, `new Date(now + CODE_TTL_S * 1000).toISOString()`, `POLL_INTERVAL_S`.

Q05, supplied `run`:

```sql
INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'access', ?, ?)
```

Binds in order: `sha256hex(access)`, `deviceId`, `at`, `new Date(nowMs + ACCESS_TTL_S * 1000).toISOString()`.

Q06, supplied `run`:

```sql
INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'refresh', ?, ?)
```

Binds in order: `sha256hex(refresh)`, `deviceId`, `at`, `new Date(nowMs + REFRESH_TTL_S * 1000).toISOString()`.

Q07, supplied `run`:

```sql
DELETE FROM v2_device_tokens WHERE device_id = ? AND expires_at < ?
```

Binds in order: `deviceId`, `at`.

Q08, supplied `get`:

```sql
SELECT * FROM v2_device_requests WHERE device_code_hash = ?
```

Binds in order: `sha256hex(deviceCode)`.

Q09, supplied `run`:

```sql
UPDATE v2_device_requests SET last_poll_at = ?, interval_s = interval_s + 5 WHERE id = ?
```

Binds in order: `at`, `r.id`.

Q10, supplied `run`:

```sql
UPDATE v2_device_requests SET last_poll_at = ? WHERE id = ?
```

Binds in order: `at`, `r.id`.

Q11, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL
```

Binds in order: `replaces`, `user.id`.

Q12, supplied `run`:

```sql
INSERT INTO v2_devices (id, user_id, name, public_key, created_at, last_seen_at, replaces) VALUES (?, ?, ?, ?, ?, ?, ?)
```

Binds in order: `deviceId`, `user.id`, `pairedName(user.id, r, replaces, nowMs)`, `r.public_key`, `at`, `at`, `replaced`.

Q13, supplied `get`:

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}
```

Binds in order: `ws`, `user.id`.

Q14, supplied `run`:

```sql
INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)
```

Binds in order: `deviceId`, `ws`.

Q15, supplied `run`:

```sql
UPDATE v2_device_requests SET state = 'consumed', device_id = ? WHERE id = ?
```

Binds in order: `deviceId`, `r.id`.

Q16, supplied `all`:

```sql
SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?
```

Binds in order: `userId`, `replaces ?? ""`.

Q17, supplied `all`:

```sql
SELECT approved_name FROM v2_device_requests WHERE user_id = ? AND state = 'approved' AND id <> ? AND approved_name IS NOT NULL AND expires_at > ?
```

Binds in order: `userId`, `exceptRequest`, `new Date(nowMs).toISOString()`.

Q18, supplied `get`:

```sql
SELECT name FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL
```

Binds in order: `replaces`, `userId`.

Q19, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ? AND (replaces IS NULL OR replaces <> ?)
```

Binds in order: `userId`, `old.name`, `replaces`, `replaces`.

Q20, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ?
```

Binds in order: `userId`, `r.approved_name`.

Q21, supplied `get`:

```sql
SELECT id, public_key, revoked_at, revoked_reason FROM v2_devices WHERE id = ?
```

Binds in order: `input.device_id`.

Q22, supplied `get`:

```sql
SELECT rotated_at, expires_at FROM v2_device_tokens WHERE token_hash = ? AND device_id = ? AND kind = 'refresh'
```

Binds in order: `sha256hex(input.refresh_token)`, `input.device_id`.

Q23, supplied `run`:

```sql
UPDATE v2_device_tokens SET rotated_at = ? WHERE token_hash = ?
```

Binds in order: `new Date(nowMs).toISOString()`, `sha256hex(input.refresh_token)`.

Q24, supplied `run`:

```sql
UPDATE v2_devices SET last_seen_at = ? WHERE id = ?
```

Binds in order: `new Date(nowMs).toISOString()`, `input.device_id`.

Q25, supplied `run`:

```sql
UPDATE v2_devices SET revoked_at = COALESCE(revoked_at, ?), revoked_reason = COALESCE(revoked_reason, ?) WHERE id = ?
```

Binds in order: `at`, `reason`, `deviceId`.

Q26, supplied `run`:

```sql
DELETE FROM v2_device_tokens WHERE device_id = ?
```

Binds in order: `deviceId`.

Q27, supplied `all`:

```sql
SELECT ws_id, session_key FROM v2_sessions WHERE device_id = ? AND state <> 'stopped'
```

Binds in order: `deviceId`.

Q28, supplied `get`:

```sql
SELECT user_id, name FROM v2_devices WHERE id = ?
```

Binds in order: `revokedId`.

Q29, supplied `get`:

```sql
SELECT user_id, name, revoked_at FROM v2_devices WHERE id = ?
```

Binds in order: `nextId`.

Q30, supplied `get`:

```sql
SELECT device_name FROM v2_device_requests WHERE device_id = ?
```

Binds in order: `nextId`.

Q31, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ?
```

Binds in order: `gone.user_id`, `gone.name`, `nextId`.

Q32, supplied `run`:

```sql
UPDATE v2_devices SET name = ? WHERE id = ?
```

Binds in order: `gone.name`, `nextId`.

Q33, supplied `all`:

```sql
SELECT id FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL
```

Binds in order: `userId`.

Q34, supplied `get`:

```sql
SELECT t.device_id, t.expires_at, d.name, d.user_id, d.revoked_at, d.last_seen_at FROM v2_device_tokens t JOIN v2_devices d ON d.id = t.device_id
     WHERE t.token_hash = ? AND t.kind = 'access'
```

Binds in order: `sha256hex(tokenValue)`.

Q35, supplied `run`:

```sql
UPDATE v2_devices SET last_seen_at = ? WHERE id = ?
```

Binds in order: `nowIso()`, `row.device_id`.

Q36, supplied `all`:

```sql
SELECT g.ws_id FROM v2_device_grants g JOIN v2_members m ON m.ws_id = g.ws_id AND m.user_id = ? WHERE g.device_id = ? AND ${LIVE_WS("g.ws_id")}
```

Binds in order: `row.user_id`, `row.device_id`.

Q37, supplied `get`:

```sql
SELECT * FROM v2_device_requests WHERE user_code = ?
```

Binds in order: `norm`.

Q38, supplied `all`:

```sql
SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL
```

Binds in order: `userId`.

Q39, supplied `run`:

```sql
UPDATE v2_device_requests SET state = 'denied', user_id = ? WHERE id = ?
```

Binds in order: `userId`, `r.id`.

Q40, supplied `get`:

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}
```

Binds in order: `ws`, `userId`.

Q41, supplied `run`:

```sql
UPDATE v2_device_requests SET state = 'approved', user_id = ?, ws_ids_json = ?, approved_name = ? WHERE id = ?
```

Binds in order: `userId`, `JSON.stringify(wsIds)`, `name`, `r.id`.

Q42, supplied `all`:

```sql
SELECT id, name, created_at, last_seen_at, revoked_at, revoked_reason FROM v2_devices WHERE user_id = ? ORDER BY created_at DESC
```

Binds in order: `userId`.

Q43, supplied `all`:

```sql
SELECT w.id, w.name FROM v2_device_grants g JOIN v2_workspaces w ON w.id = g.ws_id WHERE g.device_id = ? AND w.deleted_at IS NULL ORDER BY w.name
```

Binds in order: `d.id`.

Q44, supplied `all`:

```sql
SELECT id, name, created_at, last_seen_at FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY name COLLATE NOCASE, id
```

Binds in order: `userId`.

Q45, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL
```

Binds in order: `id`, `userId`.

Q46, supplied `run`:

```sql
INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)
```

Binds in order: `id`, `wsId`.

Q47, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL
```

Binds in order: `deviceId`, `userId`.

Q48, supplied `get`:

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}
```

Binds in order: `wsId`, `userId`.

Q49, supplied `get`:

```sql
SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?
```

Binds in order: `deviceId`, `wsId`.

Q50, supplied `get`:

```sql
SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ?
```

Binds in order: `deviceId`, `userId`.


#### Scenario: Preserve key-bound pairing, polling, rotating refresh and owned workspace grants

- **WHEN** the Node device target is selected
- **THEN** Preserve the exact public deviceOwnedBy(deviceId,userId) signature, first device then user, with Q50 binds in that order. Preserve exact name-handoff guard order: !gone,!next,next.user_id beforegone.user_id,thennext.revoked_at. Preserve postcommit native error membership test andhelderrorcode. Capture24 supplied resources once in order; return30 runtime values and2 caller types with exact metadata. Preserve50 SQL sites and binds,27 liveDate and3Buffer sites,actual supplied Ed25519 primitives/nativeBuffer errors,canonical public key and exact refresh message bytes,code normalization/generation,rate limits and modes,collision cleanup and ten attempts,held/live device naming with same-machine replacement,saved approvals,live member/workspace grants,poll bookkeeping committed beforeOAuth refusal,token lifetimes/one-time consumption,signed revocation reason privacy,five-minute skew equality,refresh rotation and reuse revocation committed before refusal,session ending and first revocation reason,name handoff,access regex/expiry/best-effort lastseen,realSet grants,browser text/caps/trim/dedup order,approval atomicity,list order andgrant/ownership distinctions. Preserve native input/property/effect/error and callback-result order. No new ambient IO,policy,validation,contentread or completion claim.
