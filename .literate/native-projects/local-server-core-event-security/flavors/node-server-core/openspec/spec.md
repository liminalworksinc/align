# Node-Server-Core implementation Flavor

## ADDED Requirements

### Requirement: Node core and product-event resource binding [authored:node-server-core-complete-public-types-v8]

# Node core and event bindings

Target Node 24 or later on macOS and Linux. Export exactly the two named
synchronous factories below, each with arity one:

| Capability | Module | Factory |
| --- | --- | --- |
| `server-core.create-core` | `server_core/create_core` | `create_core` |
| `server-core.create-events` | `server_core/create_events` | `create_events` |

Use the framework's dependency-free JavaScript library layout. The generated
artifact has `source/server_core/package.json`, named exactly `server_core`,
with `type: commonjs` and exactly this exports map:

```json
{"./create_core":"./create_core.js","./create_events":"./create_events.js"}
```

The two CommonJS files live beside that package manifest and export their named
factory through module.exports. Their locked import paths remain
`server_core/create_core` and `server_core/create_events`. Add no root,
compatibility or alternate factory export and no nonempty dependencies,
devDependencies, optionalDependencies or peerDependencies. The package contains exactly these five files:
package.json, create_core.js, create_core.d.ts, create_events.js and
create_events.d.ts. Each JavaScript factory module is self-contained and has no
local require or import. Keep SQL strings and other private constants inside
those factory modules. Add no helper JavaScript module or other package file.
The declaration files retain their existing type-only relationship. Keep `source/main.js` as the normal non-product
`--litai-test` adapter for generated behavior tests. Private acceptance also
checks other JavaScript module formats; those controls do not change this
production layout.

## Resources and construction

`create_core(resources)` reads these container properties exactly once, in this
order: `serverSecret`, `hmac`, `runtimeSettings`, `identifierTools`, `readDate`,
`readFetch`, `readAbortSignal`, `readConsole`, `readURLSearchParams`. Capture the
values. Afterward capture `runtimeSettings.testIdpEnabled`,
`runtimeSettings.validMaxDays`, `runtimeSettings.sessionMaxDays`, then
`identifierTools.rand32`, once each in that order. Do not invoke or validate any
handle. Construction/property failures escape unchanged. Later container or
namespace mutations must not replace the captured aliases or handles.

`serverSecret`, `hmac` and the four captured namespace members are the exact
public aliases, without wrappers. `readDate`, `readFetch`, `readAbortSignal`,
`readConsole` and `readURLSearchParams` are zero-argument resolver functions called
without a receiver. Each returns the current host value at the exact point where
the retained source resolves that global. Do not resolve them during construction
or cache their results between or within operations. Preserve lookup before
argument evaluation. A Date constructor lookup and a Date.now lookup are distinct
resolutions. Changes to these providers between calls must take effect.

Call a resolved `Date.now` with its Date constructor as receiver. Instantiate the
resolved Date with the original operands, then call that instance's
`toISOString`. Call resolved fetch without a receiver. Call resolved
`AbortSignal.timeout` and `console.error` with their containing objects as
receivers. Construct the resolved URLSearchParams with the original record and
preserve ordinary template conversion of the result.

`create_events(resources)` reads exactly once, in order: `secret`, `eventActor`,
`recordEvent`, `sql`, `get`, `tx`. Capture these values without invoking or
validating them. Provider functions are called without artificial receivers.
Keep the SQL object unchanged. Construction/property failures escape unchanged;
later container changes do not replace captured handles.

Return distinct operation namespaces from separate constructions. Core data is
fresh per instance, with the within-instance shared references specified below.
All owned operation functions preserve their public names, arities, synchronous
or asynchronous kind and detached behavior. The six aliases retain the supplied
function identity and provider-controlled metadata. The tables appended below
specify the exact public surface.

## JavaScript and database rules

Use ordinary JavaScript nullish fallback, truthiness, coercion, getter access,
own-enumerable property order, object spread, JSON serialization/parsing and
method behavior at the described positions. Do not eagerly convert inputs, add
type validation or normalize ordinary failures. Port errors retain identity
except for the explicitly mapped email errors. Non-finite dates and malformed
stored JSON retain the supplied host's ordinary behavior.

For every SQL call preserve the database object as method receiver. Use the
exact statement strings and parameter sequences listed below. A successful
`run` means strictly `=== 1`; a string, bigint, boolean, larger number or other
truthy value is not success. `get` and `all` outputs remain caller owned. No
operation owns a database transaction except the explicit wrapper's `tx` call.

## Data and event behavior

Expose schema version 22, code prefix `alc_`, code validity 14 days and restoration
window 30 days. `CODE_RE` is `/^alc_[a-z2-7]{32}$/` and `NOTE_REF_RE` is
`/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/`. Expose all current event rules, estimates,
once-per-workspace/person names and request statuses exactly as appended.

Keep event tables, nested arrays, exported arrays and regular expressions mutable.
Both LOI note rules reference the exported NOTE_REF_RE object. The estimate rule
references exported ESTIMATES. All three harness rules share one array. Runtime
mutations affect later validation. Preserve RegExp.test lastIndex behavior for
mutable replacement rules. Mutating exported CODE_RE affects later redemption.

`eventActor(secret, userId)` calls captured hmac with `secret` and the ordinary
template conversion prefixed by `ale.`. `codeHash(secret, code)` uses `alc.`.

`recordEvent(db, name, o = {})` reads `o.props` and uses a nullish empty object.
Resolve the property key once, with the same JavaScript ToPropertyKey semantics
as the earlier bracket lookup, and consult only an own property of EVENT_PROPS.
An inherited property never supplies a rule. Preserve ordinary access to an own
data property or an own getter, including its receiver and exactly one getter
invocation. Preserve the shared mutable table and its existing public keys. This
own-key restriction is an explicitly authored security correction: inherited
names such as toString, __proto__, constructor and the other prototype methods
must fail before reading a date or making a database call. Existing declared
own-key names keep their current property validation and write behavior.
A missing own property or a falsy own rules value throws a new Error whose message is
the exact template interpolation `Unknown event ${name}`. Use template-literal
string-hint coercion, including a second conversion after the property-key
lookup. Do not replace that conversion with concatenation's default hint.
Do not substitute explicit String(name) either: a primitive symbol retains
the original template conversion's TypeError.
Visit Object.entries(props) in its ordinary order. Look up each rule with
ordinary `rules[key]`. The string rule `count` accepts Number.isInteger(value)
with value >= 0. Select a RegExp rule using exactly `rule instanceof RegExp`
against the library realm's intrinsic RegExp constructor. A regular expression
from another realm fails that test. For a matching rule accept only strings
whose `rule.test(value)` succeeds, preserving its receiver and state. An array
rule accepts through includes. Every other value is refused with
an Error with the exact template interpolation `Event ${name} can't carry ${key}`.
Preserve string-hint name conversion here too. Missing props are allowed.
Inherited props are ignored. Preserve property/prototype behavior and toJSON.

After validation, resolve the `run` method and evaluate parameters in order:
name, `o.ws ?? null`, `o.actor ?? null`, `o.at ?? new Date().toISOString()`,
JSON.stringify(props). Insert with ON CONFLICT DO NOTHING. Return strict success.
The exported once lists do not replace the database's uniqueness constraints.

## Creation codes

`insertCreationCode(db, secret, o, now = Date.now())` samples a missing default
clock before its body. Draw rand32(15) for the `cc_` id, then rand32(20) for the
`alc_` code. Capture email as `o.email ? o.email.trim().toLowerCase() : null`,
including the repeated getter access. Calculate expiry using ordinary
`now + (o.days ?? 14) * 86400000`, preserving addition/coercion before passing it
to Date. Do not clamp zero, negative, fractional or runtime string values.

Insert parameters are id, codeHash(secret, code), captured email,
`o.requestId ?? null`, ISO time from now, calculated expiry. Resolve/evaluate in
that order. Record `code_created` afterward, with source selected by a fresh
truthiness read of `o.requestId` and a fresh ISO conversion of now. Return own
fields, in order, id, code, email, expires_at.

`listCreationCodes(db)` constructs the current ISO time before calling all. Map
the returned array in its supplied order. Spread each row's own enumerable
properties, then set state to used for truthy redeemed_at, otherwise revoked for
truthy revoked_at, otherwise expired for `expires_at <= currentISO`, otherwise
live. The comparison is JavaScript relational comparison, not Date.parse. Preserve
spread/getter order and all other row fields. Add no sort.

`revokeCreationCode(db, id, now = Date.now())` passes ISO(now), id to the guarded
update and returns strict success. `redeemCreationCode(db, secret, code, email,
userId, wsId, now = Date.now())` evaluates its default before checking CODE_RE.test.
A pattern refusal returns false without SQL, hash or date construction. Otherwise
construct ISO(now) and update with parameters at, userId, wsId,
codeHash(secret, code), at, email.toLowerCase(), in order. Do not trim email.
Return strict success.

`liveCodeFor(db, email, now = Date.now())` forwards email unchanged and ISO(now)
to get; return ordinary boolean coercion of its result.

## Access requests

`listAccessRequests(db, status)` selects the status query only for a truthy status,
passing that value unchanged. Otherwise use the unfiltered query. Return the
exact all result. `accessRequest(db, id)` returns the exact get result.

`approveAccessRequest(db, secret, id, days = 14, now = Date.now())` evaluates
defaults before lookup. Read accessRequest(db, id). Return null for a falsy row or
status strictly different from pending. Otherwise read its email and id, create
the code bound to that email/request with days and now, update approval using
ISO(now), code.id, the original lookup id, then record access_approved at a fresh
ISO(now). Return `{request: originalRow, code}` in that property order.

`declineAccessRequest(db, id, now = Date.now())` constructs at, updates the pending
request and returns false unless changes is strictly one. On success record
access_declined at that same timestamp, then return true.

`undoApproval(db, requestId, codeId)` gets the original request's optional
decided_at, revokes codeId with revokeCreationCode's fresh default clock, then
resets the request to pending. Only afterward, when the original at is truthy,
delete the latest event by descending id for access_approved, then code_created,
matching that at. Return undefined. No owned transaction or error recovery.

## Workspaces

`workspaceSummaries(db)` returns the exact all result for the existing left-join
query. Its SQL orders by created_at and id and aggregates member and owner counts;
application code adds no sorting, copying or identity fields.

`softDeleteWorkspace(db, wsId, actor, at)` first updates the still-live workspace.
Unless changes is strictly one, return false immediately. Otherwise delete its
OAuth grants, insert the audit with parameters wsId, actor, workspace.deleted,
wsId, at, and return true. Keep device grants.

`purgeWorkspace(db, wsId)` first selects device requests with nonnull ws_ids_json.
For each row in supplied order, JSON.parse its text and call includes(wsId).
When truthy, compute the ordinary filtered array excluding every value strictly
equal to wsId, JSON.stringify that result, and capture row.id, in that order.
Store those prepared [JSON text, id] pairs in order. Complete this preflight for
all rows before any db.run or rand32 call. Keep the ordinary method behavior and
exact error from unexpected parsed values. A malformed later row must leave
earlier rows and every other table unchanged, even for a direct helper caller.
This is an explicit security correction to the prior partial-write behavior.

After preflight, run the existing SQL writes in this exact order: delete OAuth
grants, delete change-request evidence, clear creation-code ws_id, delete device
grants, delete audit rows, replace event workspace ids with `wsx_` plus a fresh
rand32(15), update each prepared device request using its prepared JSON and id,
then delete the workspace and return strict success. Preserve every existing SQL
string, parameter order and changed-row comparison. Do not query workspace
existence early or introduce a transaction. Later SQL or entropy failures still
propagate by identity and rely on the caller's transaction for rollback.

## Email

`postEmail(api, msg, what)` is an async function. Inside its try, resolve current
fetch before evaluating api.url and request arguments. Use method POST; headers
authorization as `Bearer ${api.key}` and content-type application/json; body as
JSON.stringify of own fields from, to, subject, text from api.from, msg.to,
msg.subject, msg.text in that order; signal as current
AbortSignal.timeout(10000); redirect error. Await fetch.

Only this fetch/argument/await region has the mapping catch. On failure resolve
current console and call error with `${what} failed:` and `error?.name ?? 'unknown'`.
After successful logging throw a new Error with
`The ${what.toLowerCase()} could not be sent`. Preserve raw failures from logger
lookup, logging, name access and message conversion.

Outside that catch, evaluate and await `res.body?.cancel().catch(() => undefined)`.
Missing/null body is allowed. The supplied cancellation rejection handler is
anonymous, synchronous, has arity zero and returns exactly undefined. Its return
is observable to the caller-owned promise port; do not substitute null, the
error, or another value. A rejected cancellation promise is ignored. Body
getter, cancel lookup/call and catch lookup/call failures escape unchanged. Read
res.ok only afterward. If falsy, resolve current console and log
`${what} failed: HTTP`, res.status, then throw the same new mapped Error text.
Logging/status/message failures escape. Do not inspect another response field.

`codeEmail(origin, name, code, {local = false} = {})` returns own fields subject,
text. Subject is `Your Align workspace creation code`. Construct the sign-in link
from origin verbatim, `/app/sign-in?`, and current URLSearchParams constructed
from `{email: code.email ?? ''}`. For truthy local append exactly
` (a local address: it opens only on the computer Align runs on; if it doesn't open for you, ask whoever runs Align for its address)`.
The exact plaintext is the appended observed template. Preserve repeated code
field reads, expires_at.slice(0, 10), blank lines and absence of a trailing newline.

The plaintext joins these lines with `\n`. Braced fields below denote ordinary
template interpolation, with a separate property read at each occurrence:

```text
Hi {name},

Thanks for asking to try Align. You can now create a workspace.

1. Sign in as {code.email}: {signIn}
2. Under "Create a workspace", enter a name and this creation code: {code.code}

The code works once, only for {code.email}, until {code.expires_at.slice(0, 10)}.

If you didn't ask for access to Align, ignore this email.
```

## Bound event wrapper

`actorOf(userId)` calls secret() then eventActor(secretResult, userId), preserving
the order and exact failures. `event(name, o = {})` resolves captured recordEvent
and passes captured sql, name, then a new object with keys ws, actor, props, at.
Its ws is o.ws ?? null; actor is o.user ? actorOf(o.user) : null, including the
second user read; props is o.props and at is o.at. Return the exact provider value.

`noteFirstMcpRead(wsId, userId, client)` calls the captured get without a receiver
with the existing first_mcp_read query and wsId. For a truthy result return
undefined without secret, hash, event or transaction calls. Otherwise call tx
without a receiver with an anonymous zero-argument synchronous callback. That
callback returns the exact result of the bound event behavior for first_mcp_read
with wsId, userId and `{client}`. The callback's return value belongs to tx even
though this public helper returns void. Do not use a block callback that discards
the event result, coerce that result, or return the transaction from the helper.
Attach `.catch(() => undefined)` to the returned promise immediately, then return
undefined without awaiting it. The anonymous synchronous rejection handler has
arity zero and returns exactly undefined, observable to its supplied promise
port. Do not change either callback's return behavior.
Initial get, synchronous tx, and catch-property/call failures escape unchanged.
The attached handler swallows asynchronous transaction/callback rejection.

## Effects and acceptance

Generated library modules may use ordinary language intrinsics and static imports
of their own relative modules. Do not use dynamic import(). Access host clock, URL, network, abort and logging only through
the captured explicit resolvers. Access secrets, entropy, settings and database
only through the explicit providers. No ambient environment, filesystem, process,
network, console, timer, entropy, dynamic code, package import or background task.
The existing callback transaction is the sole deliberate fire-and-forget path.
Private VM checks are functional guards, not a security sandbox.

Preserve all source observations through private independent acceptance. Source
and private acceptance code/data are excluded from generation. Build and generated
self-tests do not replace the private oracle. Keep every observation when grouping
them into the qualification profile's maximum of 64 cases. Require two clean
generations, then separate admission before consumer integration.


## Observed public surface

Original namespace `lib/v2/core.mts` has these exact enumerable own keys in order:

```json
[
  "CODE_DAYS",
  "CODE_PREFIX",
  "CODE_RE",
  "ESTIMATES",
  "EVENT_PROPS",
  "NOTE_REF_RE",
  "ONCE_PER_PERSON",
  "ONCE_PER_WORKSPACE",
  "REQUEST_STATUSES",
  "RESTORE_DAYS",
  "SCHEMA_VERSION",
  "accessRequest",
  "approveAccessRequest",
  "codeEmail",
  "codeHash",
  "declineAccessRequest",
  "eventActor",
  "hmac",
  "insertCreationCode",
  "listAccessRequests",
  "listCreationCodes",
  "liveCodeFor",
  "postEmail",
  "purgeWorkspace",
  "rand32",
  "recordEvent",
  "redeemCreationCode",
  "revokeCreationCode",
  "serverSecret",
  "sessionMaxDays",
  "softDeleteWorkspace",
  "testIdpEnabled",
  "undoApproval",
  "validMaxDays",
  "workspaceSummaries"
]
```

| Owned function | Arity | Kind |
| --- | --- | --- |
| `accessRequest` | 2 | `Function` |
| `approveAccessRequest` | 3 | `Function` |
| `codeEmail` | 3 | `Function` |
| `codeHash` | 2 | `Function` |
| `declineAccessRequest` | 2 | `Function` |
| `eventActor` | 2 | `Function` |
| `insertCreationCode` | 3 | `Function` |
| `listAccessRequests` | 2 | `Function` |
| `listCreationCodes` | 1 | `Function` |
| `liveCodeFor` | 2 | `Function` |
| `postEmail` | 3 | `AsyncFunction` |
| `purgeWorkspace` | 2 | `Function` |
| `recordEvent` | 2 | `Function` |
| `redeemCreationCode` | 6 | `Function` |
| `revokeCreationCode` | 2 | `Function` |
| `softDeleteWorkspace` | 4 | `Function` |
| `undoApproval` | 3 | `Function` |
| `workspaceSummaries` | 1 | `Function` |

Original namespace `lib/v2/events.ts` has these exact enumerable own keys in order:

```json
[
  "actorOf",
  "event",
  "noteFirstMcpRead"
]
```

| Owned function | Arity | Kind |
| --- | --- | --- |
| `actorOf` | 1 | `Function` |
| `event` | 1 | `Function` |
| `noteFirstMcpRead` | 3 | `Function` |

The following values are exact. The two note-rule strings below name the same exported regular-expression object, rather than literal string rules. The regular expressions are specified above.

```json
{
  "CODE_DAYS": 14,
  "CODE_PREFIX": "alc_",
  "ESTIMATES": [
    "same_day",
    "two_to_three_days",
    "about_a_week",
    "longer",
    "would_not_be_decided"
  ],
  "EVENT_PROPS": {
    "access_requested": {
      "interest": [
        "try",
        "evaluate"
      ],
      "via": [
        "form",
        "value_card"
      ]
    },
    "access_approved": {},
    "access_declined": {},
    "code_created": {
      "source": [
        "request",
        "operator"
      ]
    },
    "code_redeemed": {},
    "workspace_created": {
      "kind": [
        "blank",
        "sample"
      ]
    },
    "invite_sent": {
      "role": [
        "owner",
        "member",
        "viewer"
      ]
    },
    "invite_accepted": {
      "role": [
        "owner",
        "member",
        "viewer"
      ]
    },
    "device_paired": {
      "workspaces": "count"
    },
    "first_session_captured": {
      "harness": [
        "claude-code",
        "codex"
      ]
    },
    "member_first_session_captured": {
      "harness": [
        "claude-code",
        "codex"
      ]
    },
    "first_session_bound": {
      "harness": [
        "claude-code",
        "codex"
      ],
      "authority": [
        "own",
        "pod",
        "alignment"
      ]
    },
    "second_member_joined": {},
    "first_change_request": {},
    "first_approval": {},
    "first_directive": {
      "kind": [
        "goal_version",
        "binding_changed",
        "binding_suspended",
        "stop",
        "resume",
        "request",
        "hold",
        "release"
      ]
    },
    "first_mcp_read": {
      "client": [
        "app",
        "device"
      ]
    },
    "loi_sent": {
      "note_ref": "shared NOTE_REF_RE object"
    },
    "loi_signed": {
      "note_ref": "shared NOTE_REF_RE object",
      "verified_original": [
        "yes"
      ]
    },
    "first_ask": {},
    "first_limit": {},
    "value_card_viewed": {},
    "value_reported": {
      "estimate": [
        "same_day",
        "two_to_three_days",
        "about_a_week",
        "longer",
        "would_not_be_decided"
      ]
    },
    "follow_up_clicked": {},
    "first_request": {
      "type": [
        "replan",
        "checkpoint",
        "switch_goal"
      ]
    },
    "first_hold": {},
    "first_launch": {}
  },
  "ONCE_PER_PERSON": [
    "member_first_session_captured",
    "value_card_viewed",
    "value_reported",
    "follow_up_clicked"
  ],
  "ONCE_PER_WORKSPACE": [
    "workspace_created",
    "code_redeemed",
    "first_session_captured",
    "first_session_bound",
    "second_member_joined",
    "first_change_request",
    "first_approval",
    "first_directive",
    "first_mcp_read",
    "loi_sent",
    "loi_signed",
    "first_ask",
    "first_limit",
    "first_request",
    "first_hold",
    "first_launch"
  ],
  "REQUEST_STATUSES": [
    "pending",
    "approved",
    "declined"
  ],
  "RESTORE_DAYS": 30,
  "SCHEMA_VERSION": 22
}
```

## Exact SQL statements

Statement text, including whitespace, is observable through the supplied SQL port. Use these exact strings. Their operation, guard, parameter and effect order is specified above.

Statement 1:

```sql
INSERT INTO v2_creation_codes (id, code_hash, email, request_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
```

Statement 2:

```sql
INSERT INTO v2_events (name, ws_id, actor, at, props) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
```

Statement 3:

```sql
UPDATE v2_creation_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND redeemed_at IS NULL
```

Statement 4:

```sql
UPDATE v2_creation_codes SET redeemed_at = ?, redeemed_by = ?, ws_id = ?
       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND (email IS NULL OR email = ?)
```

Statement 5:

```sql
UPDATE v2_access_requests SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'pending'
```

Statement 6:

```sql
UPDATE v2_workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL
```

Statement 7:

```sql
DELETE FROM v2_oauth_grants WHERE ws_id = ?
```

Statement 8:

```sql
DELETE FROM v2_change_request_evidence WHERE ws_id = ?
```

Statement 9:

```sql
UPDATE v2_creation_codes SET ws_id = NULL WHERE ws_id = ?
```

Statement 10:

```sql
DELETE FROM v2_device_grants WHERE ws_id = ?
```

Statement 11:

```sql
DELETE FROM v2_audit WHERE ws_id = ?
```

Statement 12:

```sql
UPDATE v2_events SET ws_id = ? WHERE ws_id = ?
```

Statement 13:

```sql
SELECT id, ws_ids_json FROM v2_device_requests WHERE ws_ids_json IS NOT NULL
```

Statement 14:

```sql
DELETE FROM v2_workspaces WHERE id = ?
```

Statement 15:

```sql
INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, ?, ?, ?)
```

Statement 16:

```sql
SELECT id, email, request_id, created_at, expires_at, revoked_at, redeemed_at, ws_id FROM v2_creation_codes ORDER BY created_at DESC, id
```

Statement 17:

```sql
SELECT 1 AS x FROM v2_creation_codes WHERE email = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
```

Statement 18:

```sql
SELECT * FROM v2_access_requests ORDER BY created_at, id
```

Statement 19:

```sql
SELECT * FROM v2_access_requests WHERE status = ? ORDER BY created_at, id
```

Statement 20:

```sql
SELECT * FROM v2_access_requests WHERE id = ?
```

Statement 21:

```sql
UPDATE v2_access_requests SET status = 'approved', decided_at = ?, code_id = ? WHERE id = ?
```

Statement 22:

```sql
UPDATE v2_access_requests SET status = 'pending', decided_at = NULL, code_id = NULL WHERE id = ?
```

Statement 23:

```sql
DELETE FROM v2_events WHERE id = (SELECT id FROM v2_events WHERE name = ? AND at = ? ORDER BY id DESC LIMIT 1)
```

Statement 24:

```sql
SELECT w.id, w.name, w.created_at, w.deleted_at, COUNT(m.user_id) AS members, COALESCE(SUM(m.role = 'owner'), 0) AS owners
     FROM v2_workspaces w LEFT JOIN v2_members m ON m.ws_id = w.id GROUP BY w.id ORDER BY w.created_at, w.id
```

Statement 25:

```sql
UPDATE v2_device_requests SET ws_ids_json = ? WHERE id = ?
```

Statement 26:

```sql
SELECT 1 AS x FROM v2_events WHERE name = 'first_mcp_read' AND ws_id = ?
```

## Public type contracts

The application and operator bridge must preserve these eight existing public types exactly. SQLInputValue remains the imported type from node:sqlite; do not replace or broaden the installed Node declaration. These are type contracts, without additional runtime exports or an additional package module. EventName retains the exact keyof union of the specified EVENT_PROPS table.

```typescript
import type { SQLInputValue } from "node:sqlite";

export interface Sql {
  run(sql: string, ...params: SQLInputValue[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[];
}

export type EventName = keyof typeof EVENT_PROPS;

export type EventProps = Record<string, string | number>;

export interface NewCode {
  id: string;
  code: string;
  email: string | null;
  expires_at: string;
}

export interface CodeRow {
  id: string;
  email: string | null;
  request_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
  ws_id: string | null;
}

export type RequestStatus = "pending" | "approved" | "declined";

export interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  company: string | null;
  team_size: string | null;
  use_case: string;
  interest: "try" | "evaluate";
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  code_id: string | null;
}

export interface EmailApi {
  url: string;
  key: string;
  from: string;
}
```

Also preserve the public values' inferred types: SCHEMA_VERSION, CODE_PREFIX, CODE_DAYS and RESTORE_DAYS keep their exact literal types. ESTIMATES keeps its readonly literal tuple; EVENT_PROPS keeps its readonly literal keys, nested readonly choice tuples and RegExp rule types, including the shared readonly harness tuple. ONCE_PER_WORKSPACE and ONCE_PER_PERSON remain readonly EventName arrays; REQUEST_STATUSES remains a readonly RequestStatus array. CODE_RE and NOTE_REF_RE remain RegExp values. Type-level readonly annotations do not freeze runtime objects. Preserve the existing function parameter, optional/default parameter and return types in the typed bridge. Normal compilation of all unchanged application and operator callers must verify this boundary before integration.


This revision has two explicit security changes: the own-key event-name
restriction and device-request JSON preflight before destructive purge effects.
All other transaction ownership, exported values, public types, provider aliases,
SQL statements and bound-event behavior remain in force. Historical observations accepting inherited names are retained as
evidence of the defect. They are intentionally replaced by authored refusal
requirements, rather than claimed as behavior already enforced by main. The
separate storage attribution migration has separate authority and qualification.


## Public provider alias declarations

Both the resource argument and the returned namespace must preserve these exact
six current-main provider signatures. These are aliases by runtime identity,
with no wrappers. Do not infer their types from the permissive verifier doubles.
Use the NodeJS.ProcessEnv type supplied by normal Node declarations. Keep the
public .d.ts self-contained apart from normal Node types and its stated sibling
type-only relationship. The signatures are:

```ts
serverSecret(dataDir: string, env?: NodeJS.ProcessEnv): string;
hmac(secret: string, payload: string): string;
testIdpEnabled(env?: NodeJS.ProcessEnv): boolean;
validMaxDays(v: string): boolean;
sessionMaxDays(env?: NodeJS.ProcessEnv): number;
rand32(bytes?: number): string;
```

In particular validMaxDays takes one string and returns boolean. serverSecret
takes a required data directory plus optional environment. rand32 accepts an
omitted byte count. The environment overrides stay accepted on all three setting
and secret aliases. Use these signatures in CoreResources and the factory result.
Do not replace them with no-argument functions, unknown, any, or broad index
signatures. Strict declaration compilation with actual main callers is a
separate admission gate in addition to the runtime qualification observations.


## Complete current-main public function types

The public soft-delete function accepts a nullable audit actor, exactly as the
actual current-v2 caller. Its declaration is:

```ts
softDeleteWorkspace(db: Sql, wsId: string, actor: string | null, at: string): boolean;
```

This applies to the returned namespace as well as any named public declaration.
Do not narrow actor to string. Runtime behavior already forwards the supplied
value to SQL unchanged and needs no algorithm change. The earlier six-alias
type gate is supplemented by a strict parameter-tuple and return-type comparison
for every one of the24 core helper functions against actual current-main exports.
The separately owned creation compatibility additions and the unused historical
helper schema constant have their explicit existing caller owners. Every other
function's parameters, defaults, optionality and return type must remain exact.
No widening to any, unknown or broad callable types may hide a mismatch.
Both generated candidates must pass this complete type gate before integration.


#### Scenario: Whole core and bound event namespaces

- **WHEN** the Node core target is selected
- **THEN** Preserve every original runtime export and public type, existing qualified alias identity, shared mutable data, exact database statements and caller-owned transactions, code/request/workspace/email behavior and effect order, bound-event callback and rejection rules, explicit constructor capture and current host resolvers.

#### Scenario: Inherited event names are refused

- **WHEN** the supplied name resolves only through the event table prototype
- **THEN** Reject with the unchanged Unknown event diagnostic, preserve key conversion semantics and perform no date, database or network effect.

#### Scenario: Malformed device JSON stops all purge writes

- **WHEN** any stored device-request value fails parsing or the existing includes/filter sequence
- **THEN** Propagate the exact failure before db.run or entropy, preserving every table even for a direct helper caller.

#### Scenario: Public aliases accept real caller arguments

- **WHEN** a typed caller supplies current-main provider functions and calls their six aliases
- **THEN** Strictly compile the unchanged optional and required parameters and exact return types without any.
