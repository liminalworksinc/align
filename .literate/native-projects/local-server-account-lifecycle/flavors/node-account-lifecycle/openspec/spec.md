# Node-Account-Lifecycle implementation Flavor

## ADDED Requirements

### Requirement: Node account and membership lifecycle binding [authored:node-account-lifecycle-contract-v1]

# Node account and membership binding

- Status: Reviewed for normal local promotion; qualification remains required.
- Owner: ADOPT-002/B13. The preceding sign-in-effects local acceptance is complete.
- Producing behavior: the account and membership lifecycle Component contract.

## Proposed package and factories

Use the normal dependency-free JavaScript library layout on Node 24 or later,
with macOS and Linux acceptance. The required import coordinates are:

| Capability | Module | Synchronous named factory |
| --- | --- | --- |
| `server-account-lifecycle.create-account` | `server_account_lifecycle/create_account` | `create_account(resources)` |
| `server-account-lifecycle.create-lifecycle` | `server_account_lifecycle/create_lifecycle` | `create_lifecycle(resources)` |

Each factory has arity one. The production artifact has the CommonJS package
`source/server_account_lifecycle/package.json`, named `server_account_lifecycle`,
with this exact exports map:

```json
{"./create_account":"./create_account.js","./create_lifecycle":"./create_lifecycle.js"}
```

Each advertised module exports only its named factory. Static relative internal
modules are permitted. Public implementation modules import no builtins or
external packages, add no nonempty dependency declarations and use no ambient
database, clock, filesystem, network, environment, console or dynamic imports.
Retain the framework's normal non-product `source/main.js` smoke adapter.

## Resource ownership

The account factory reads these 21 container properties once each:

```text
all, get, run, tx, audit, LIVE_WS, sql, softDeleteWorkspace,
revokeDevicesOf, revokeGrantsOfPerson, actorOf,
badRequest, conflict, notFound, nowIso, onMemberRemoved,
accessEmailKey, otpEmailKey, noteDeparture, pseudonymise, workspacesNaming
```

The lifecycle factory reads these six container properties once each:

```text
all, run, nowIso, revokeGrantsFor, endSessions, deleteOrphanDirectives
```

Capture supplied values without enumeration, unrelated property reads, eager
validation, nested provider reads or service calls. Capture failures escape
unchanged. Later caller-container replacements do not replace captured handles.
Call supplied functions without an artificial receiver. Preserve arguments,
returned identities and thrown/rejected values. The SQL handle is opaque to the
account library: retain it and pass that exact value to softDeleteWorkspace.

The host owns the public SQL services and transaction implementation. Do not
give generated candidate code the fixture's raw database connection, world
object, original implementations or private acceptance commands. The candidate
adapter supplies only these declared ports. Transactions retain callback results
and failures; the library neither substitutes a transaction nor catches and
recreates its failure.

The original runtime import graph contains
`lifecycle.ts -> sessions.ts -> workspaces.ts -> lifecycle.ts`. Its presence is
recorded by private source preparation; that syntax graph alone does not prove
initialization behavior. The host binding must
resolve the cyclic session service when it is called, through a synchronous
forwarding function or equivalent function-valued resource. Constructing the
lifecycle namespace must not eagerly read an uninitialized replacement alias or
invoke endSessions. Preserve bare-call arguments, return and failure identity.
Actual parent module loading and service composition must verify this binding
before source retirement. No new product fallback belongs in that host binding.

## Public namespaces and types

The account namespace has exactly seven own public functions:

| Name | Arity | Kind | Existing public result |
| --- | ---: | --- | --- |
| `listPasskeys` | 1 | synchronous | `PasskeyRow[]` |
| `passkeyPromptDue` | 1 | synchronous | `boolean` |
| `dismissPasskeyPrompt` | 1 | async | `Promise<void>` |
| `renamePasskey` | 3 | async | `Promise<{id: string; name: string}>` |
| `deletePasskey` | 2 | async | `Promise<void>` |
| `signOutEverywhere` | 2 | async | `Promise<{sessions: number; devices: number; apps: number}>` |
| `deleteAccount` | 2 | async | `Promise<void>` |

The lifecycle namespace has exactly two own public functions:

| Name | Arity | Kind | Existing public result |
| --- | ---: | --- | --- |
| `onMemberRemoved` | 2 | synchronous | `void` |
| `deleteMemberSessions` | 2 | synchronous | `number` |

Functions preserve their public names, detached-call behavior and parameter order.
Account parameter lists are `(userId)`, `(userId, id, name)`, `(userId, id)`,
`(userId, also)` and `(principal, confirmEmail)` as applicable. Both lifecycle
operations take `(wsId, userId)`. `also` keeps required boolean `devices` and
`apps` fields. deleteAccount retains the existing host `WebPrincipal` public type.

The consuming account module retains this exact public declaration:

```typescript
export interface PasskeyRow {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}
```

Preserve existing runtime stored values even where a provider value is looser
than that declaration. In particular, do not synthesize dates, coerce values or
silently change the declared creation-time type. Preserve exact public value/type
exports through bidirectional namespace/type comparisons and unchanged callers.

## JavaScript and store semantics

Use ordinary JavaScript property, getter, short-circuit, truthiness, method,
iteration and exception behavior at the documented operation points. Do not add
validation or normalization. listPasskeys uses the returned rows' ordinary map
behavior and produces objects with id, `name || null`, created_at and last_used_at
in that order. Only name gets that fallback. Prompt lookup short-circuits after
finding a passkey.

dismissPasskeyPrompt's callback returns the supplied insertion result. The public
async operation awaits the transaction and discards its value. deleteAccount's
transaction callback returns undefined, and its public async operation also
discards the transaction result after waiting. renamePasskey
awaits its update result, refuses a falsy result through `notFound()`, then returns
the supplied id/name. deletePasskey's callback checks ownership, returns zero for
absence, otherwise deletes, audits and returns one; its public async operation
uses the callback result and returns no successful value. Do not replace that
ownership decision with the delete statement's affected-row count.

signOutEverywhere reads time before the transaction. Inside the callback, delete
sessions before reading `also.devices`; read `also.apps` after the device branch.
Keep supplied service counts without coercion and preserve callback/result
identity where the async boundary permits it. Failure inside a later branch
still belongs to the caller's transaction.

For deleteAccount, read `principal.user.id`, then separately
`principal.user.email.trim().toLowerCase()`, then
`confirmEmail.trim().toLowerCase()`. Preserve those receiver and read positions.
Perform outer ownership refusal, time read, transaction entry and inner refusal
in that order. The sole-owner refusal uses `conflict("last_owner", message)`:

```text
You are the only owner of ${names}, which ${verb} other members. Make someone else an owner, or delete the workspace, first.
```

Names are joined with comma-space in the store's workspace-name order. The verb
is `has` for one blocking workspace and `have` otherwise. Missing/foreign passkeys
use the supplied `notFound()` result. Email mismatch calls the supplied
`badRequest` with the Component's exact message. Throw these returned values
unchanged; do not create replacement error classes or lookalike objects.

Use the actual caller-owned SQLite schema: ba_user, ba_session, ba_passkey,
ba_verification and the existing v2 membership, workspace, passkey-use, prompt,
audit, invitation, device/request, OAuth, access-request, creation-code, rate-hit
and product-event tables. Preserve joins, ownership filters, ordering,
foreign-key effects and null tests. The caller owns provisioning; missing-table
or schema failures propagate instead of triggering invented schema creation.

Keep these existing cleanup details:

- The live-membership test uses the supplied LIVE_WS expression. Only a truthy
  live value with no other member selects soft deletion. Each membership still
  gets member-removal, deletion, departure and audit in order.
- Invitation/access/code email comparisons retain SQLite lower semantics. Delete
  unused bound codes only for `redeemed_at IS NULL`; clear email from retained
  matching codes and clear redeemed_by wherever it matches this user.
- Verification deletion retains the SQLite identifier suffix `'-' || email`
  with identifier length greater than email length. Do not require an invented
  purpose prefix or use substring email matching.
- Evaluate otpEmailKey before accessEmailKey at their deletion point. Evaluate
  actorOf at the event-anonymization point. Do not hoist these calls before earlier
  store effects.
- Discover tables with the literal `ba_` prefix, excluding ba_user, and include
  each whose inspected column name is exactly `userId`. Preserve store enumeration
  order and failures for provider table names. Do not hard-code only today's
  authentication tables.
- Keep last-use cleanup before deletion of provider user tables, then remove and
  verify ba_user, followed by the actorless account.deleted audit.
- Lifecycle removal revokes scoped OAuth grants, reads non-stopped scoped
  sessions, reads time, ends those sessions even when the selection is empty,
  then deletes pod membership and
  scoped device grants. It has no tx resource and must not open a new transaction.
- deleteMemberSessions calls orphan cleanup only for a truthy deletion result and
  returns that result unchanged. Its caller owns transaction preconditions.

Equivalent private SQL plans and choices among the supplied SQL methods are
permitted when they preserve public results, relevant intermediate store state,
service order, failure identity and the declared store contract. Do not make the
original source's statement formatting or 28-write cleanup plan a requirement.

## Evidence required before transfer

Keep the original-free candidate adapter and resource-construction verifier for
both factories. The independent preparation currently has 29 account and ten
lifecycle public records, plus seven adaptive fault operations. Discover and
exercise every actual prepared writing statement, including zero-change writes,
using SQLite write actions across run/get/all rather than SQL keyword matching.
Test meaningful alternate method/extra-step plans, all-table rollback, exact
error identity and real positive cleanup state. Existing reference diagnostics
are retained separately and do not prescribe a candidate's private plan.

Select the ordinary profile after these adapters, controls, four supported verifier
package forms and canonical production package pass on both hosts. Ordinary
promotion creates the locked interfaces. Verify their actual framework import
projection on both hosts before starting any qualification generation. The profile must cover
both capabilities and every operation, require at least two independent clean
generations, then use a distinct admitted generation. Private original algorithms,
oracle commands and fixture internals remain outside generation inputs.

Before retiring either source file, verify actual configured authentication/store
composition, current qualified dependencies, the cyclic host binding, all original
public types/callers, full application workflow, immutable image and current
receipt. Source-independent captured schemas and recorded external ports are
necessary preparation; they do not alone prove configured-provider integration.
The separate main-auth intake review and the full 31-boundary/public tester gates
remain outside this helper's completion claim.


## Supplied service signatures and physical store names

These are caller-owned services. Every listed service is synchronous except tx,
which returns a Promise for its callback result. Capture each service once and
call it as a bare function. Preserve its actual returned value or exact failure;
the nominal types below do not authorize extra validation or coercion.

| Resource | Caller-owned contract |
| --- | --- |
| all | `(statement: string, ...params: SQLInputValue[]) => Row[]`; ordinary map/filter/iteration behavior remains observable. |
| get | `(statement: string, ...params: SQLInputValue[]) => Row or undefined`; missing rows are undefined. |
| run | `(statement: string, ...params: SQLInputValue[]) => number`; returns the changed-row count directly. |
| tx | `<T>(callback: () => T) => Promise<T>`; caller owns serialization, commit and complete rollback on callback failure. |
| audit | `(workspace: string or null, actor: string or null, action: string, object: string or null, at: string) => void`. |
| LIVE_WS | `(workspaceIdExpression: string) => string`; this is a function that produces a SQL predicate, not a SQL string or boolean value. |
| sql | Opaque caller-owned SQL handle; pass this exact handle to softDeleteWorkspace without reading or calling its members. |
| softDeleteWorkspace | `(sqlHandle, workspaceId: string, actorId: string, at: string) => unknown`; synchronous, supplied result ignored. |
| revokeDevicesOf | `(userId: string, reason: string, actorId: string) => number`; returned count preserved. |
| revokeGrantsOfPerson | `(userId: string, at: string) => number`; returned count preserved. |
| actorOf | `(userId: string) => string`; use its returned actor key only at event anonymization. |
| badRequest | `(message: string) => supplied public error`; throw that exact returned value. |
| conflict | `(code: string, message: string) => supplied public error`; throw that exact returned value. |
| notFound | `() => supplied public error`; throw that exact returned value. |
| nowIso | `() => string`; read only at the operation points already specified. |
| onMemberRemoved | `(workspaceId: string, userId: string) => void`; supplied membership service, called inside account deletion's transaction. |
| accessEmailKey, otpEmailKey | `(email: string) => string`; use the exact returned keys. |
| noteDeparture | `(workspaceId: string, userId: string, at: string) => unknown`; synchronous, result ignored. |
| pseudonymise | `(workspaceId: string, userId: string, at: string) => unknown`; synchronous, result ignored. |
| workspacesNaming | `(userId: string) => iterable of workspace strings`; preserve values and order. |
| revokeGrantsFor | `(workspaceId: string, userId: string) => number`; synchronous, lifecycle ignores its result. |
| endSessions | `(rows: {ws_id: string; session_key: string}[], reason: string, at: string) => number`; pass the selected rows unchanged, including an empty array; ignore its result. |
| deleteOrphanDirectives | `() => unknown`; synchronous, result ignored. |

SQLInputValue uses the existing SQLite port's supported values. These ports bind
parameters separately; they do not accept an invented query-builder object or
return a driver statement wrapper. They all address the same caller-owned store.
The library does not create, rename, migrate or provision any table.

Call LIVE_WS with the workspace-id SQL expression while constructing the
membership read inside account deletion's transaction. Use its returned predicate
for the projected membership liveness. Evaluate it even when the read later
returns no memberships, and propagate its exact thrown value before that read or
any cleanup. Do not interpolate the function object. The sole-owner checks use
the workspace row's existing deleted_at value and do not call LIVE_WS.

Use the physical names below exactly. Application tables use the `v2_` prefix,
including v2_workspaces, v2_members, v2_passkey_use and
v2_passkey_prompt_dismissed. The authentication passkey creation column is
createdAt, exposed publicly as created_at; last_used_at comes from the supplied
v2_passkey_use rows. No alternate suffix-style table names are provided.

The following declarative metadata describes existing caller-owned tables and
foreign keys. It contains no account rows, credentials, original query algorithm
or schema-provisioning program. Common tables exist in both modes; mode-specific
tables are additional or differing provider metadata. Dynamic provider discovery
must still handle future ba_ tables. Preserve SQLite's existing prefix matching,
including its case behavior and a literal underscore, and require the inspected
column name to be exactly userId. A differently cased or snake-case column is not
the declared provider person-reference column. Preserve metadata/preparation
failures for provider names, without replacing supplied failures.

Application schema version: 22. Authentication package version: 1.7.10.

### Common tables in local and hosted mode

### ba_account

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `accountId` | TEXT | 1 | 0 |
| `providerId` | TEXT | 1 | 0 |
| `userId` | TEXT | 1 | 0 |
| `accessToken` | TEXT | 0 | 0 |
| `refreshToken` | TEXT | 0 | 0 |
| `idToken` | TEXT | 0 | 0 |
| `accessTokenExpiresAt` | date | 0 | 0 |
| `refreshTokenExpiresAt` | date | 0 | 0 |
| `scope` | TEXT | 0 | 0 |
| `password` | TEXT | 0 | 0 |
| `createdAt` | date | 1 | 0 |
| `updatedAt` | date | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"userId","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### ba_passkey

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `name` | TEXT | 0 | 0 |
| `publicKey` | TEXT | 1 | 0 |
| `userId` | TEXT | 1 | 0 |
| `credentialID` | TEXT | 1 | 0 |
| `counter` | INTEGER | 1 | 0 |
| `deviceType` | TEXT | 1 | 0 |
| `backedUp` | INTEGER | 1 | 0 |
| `transports` | TEXT | 0 | 0 |
| `createdAt` | date | 0 | 0 |
| `aaguid` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"userId","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### ba_session

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `expiresAt` | date | 1 | 0 |
| `token` | TEXT | 1 | 0 |
| `createdAt` | date | 1 | 0 |
| `updatedAt` | date | 1 | 0 |
| `ipAddress` | TEXT | 0 | 0 |
| `userAgent` | TEXT | 0 | 0 |
| `userId` | TEXT | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"userId","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### ba_user

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `name` | TEXT | 1 | 0 |
| `email` | TEXT | 1 | 0 |
| `emailVerified` | INTEGER | 1 | 0 |
| `image` | TEXT | 0 | 0 |
| `createdAt` | date | 1 | 0 |
| `updatedAt` | date | 1 | 0 |

Foreign keys: `[]`.

### ba_verification

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `identifier` | TEXT | 1 | 0 |
| `value` | TEXT | 1 | 0 |
| `expiresAt` | date | 1 | 0 |
| `createdAt` | date | 1 | 0 |
| `updatedAt` | date | 1 | 0 |

Foreign keys: `[]`.

### v2_access_requests

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `email` | TEXT | 1 | 0 |
| `name` | TEXT | 1 | 0 |
| `company` | TEXT | 0 | 0 |
| `team_size` | TEXT | 0 | 0 |
| `use_case` | TEXT | 1 | 0 |
| `interest` | TEXT | 1 | 0 |
| `status` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `decided_at` | TEXT | 0 | 0 |
| `code_id` | TEXT | 0 | 0 |

Foreign keys: `[]`.

### v2_audit

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `seq` | INTEGER | 0 | 1 |
| `ws_id` | TEXT | 0 | 0 |
| `actor_id` | TEXT | 0 | 0 |
| `action` | TEXT | 1 | 0 |
| `object_id` | TEXT | 0 | 0 |
| `at` | TEXT | 1 | 0 |

Foreign keys: `[]`.

### v2_creation_codes

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `code_hash` | TEXT | 1 | 0 |
| `email` | TEXT | 0 | 0 |
| `request_id` | TEXT | 0 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `expires_at` | TEXT | 1 | 0 |
| `revoked_at` | TEXT | 0 | 0 |
| `redeemed_at` | TEXT | 0 | 0 |
| `redeemed_by` | TEXT | 0 | 0 |
| `ws_id` | TEXT | 0 | 0 |

Foreign keys: `[]`.

### v2_device_grants

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `device_id` | TEXT | 1 | 1 |
| `ws_id` | TEXT | 1 | 2 |

Foreign keys: `[{"id":0,"seq":0,"table":"v2_workspaces","from":"ws_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":1,"seq":0,"table":"v2_devices","from":"device_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_device_requests

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `device_code_hash` | TEXT | 1 | 0 |
| `user_code` | TEXT | 1 | 0 |
| `device_name` | TEXT | 1 | 0 |
| `public_key` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `expires_at` | TEXT | 1 | 0 |
| `interval_s` | INTEGER | 1 | 0 |
| `last_poll_at` | TEXT | 0 | 0 |
| `state` | TEXT | 1 | 0 |
| `user_id` | TEXT | 0 | 0 |
| `ws_ids_json` | TEXT | 0 | 0 |
| `device_id` | TEXT | 0 | 0 |
| `approved_name` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"user_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_devices

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `user_id` | TEXT | 1 | 0 |
| `name` | TEXT | 1 | 0 |
| `public_key` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `last_seen_at` | TEXT | 0 | 0 |
| `revoked_at` | TEXT | 0 | 0 |
| `revoked_reason` | TEXT | 0 | 0 |
| `replaces` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"user_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_events

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | INTEGER | 0 | 1 |
| `name` | TEXT | 1 | 0 |
| `ws_id` | TEXT | 0 | 0 |
| `actor` | TEXT | 0 | 0 |
| `at` | TEXT | 1 | 0 |
| `props` | TEXT | 1 | 0 |

Foreign keys: `[]`.

### v2_invites

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `ws_id` | TEXT | 1 | 0 |
| `token_hash` | TEXT | 1 | 0 |
| `email` | TEXT | 1 | 0 |
| `role` | TEXT | 1 | 0 |
| `created_by` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `expires_at` | TEXT | 1 | 0 |
| `accepted_at` | TEXT | 0 | 0 |
| `accepted_by` | TEXT | 0 | 0 |
| `team_id` | TEXT | 0 | 0 |
| `team_role` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"v2_workspaces","from":"ws_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_members

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `ws_id` | TEXT | 1 | 1 |
| `user_id` | TEXT | 1 | 2 |
| `role` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"user_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":1,"seq":0,"table":"v2_workspaces","from":"ws_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_oauth_grants

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `ws_id` | TEXT | 1 | 0 |
| `user_id` | TEXT | 1 | 0 |
| `client_id` | TEXT | 1 | 0 |
| `client_name` | TEXT | 1 | 0 |
| `redirect_host` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `last_used_at` | TEXT | 0 | 0 |
| `refresh_hash` | TEXT | 1 | 0 |
| `prev_refresh_hash` | TEXT | 0 | 0 |
| `refresh_exp` | INTEGER | 1 | 0 |
| `kid` | TEXT | 1 | 0 |
| `scope` | TEXT | 1 | 0 |
| `last_read_at` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"v2_members","from":"ws_id","to":"ws_id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":0,"seq":1,"table":"v2_members","from":"user_id","to":"user_id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":1,"seq":0,"table":"v2_workspaces","from":"ws_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_passkey_prompt_dismissed

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `user_id` | TEXT | 0 | 1 |
| `dismissed_at` | TEXT | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_user","from":"user_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_passkey_use

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `passkey_id` | TEXT | 0 | 1 |
| `last_used_at` | TEXT | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"ba_passkey","from":"passkey_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_pod_members

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `ws_id` | TEXT | 1 | 0 |
| `pod_id` | TEXT | 1 | 1 |
| `user_id` | TEXT | 1 | 2 |
| `role` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"v2_members","from":"ws_id","to":"ws_id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":0,"seq":1,"table":"v2_members","from":"user_id","to":"user_id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":1,"seq":0,"table":"v2_pods","from":"ws_id","to":"ws_id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"},{"id":1,"seq":1,"table":"v2_pods","from":"pod_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_rate_hits

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `key` | TEXT | 1 | 0 |
| `at` | INTEGER | 1 | 0 |

Foreign keys: `[]`.

### v2_sessions

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `ws_id` | TEXT | 1 | 1 |
| `session_key` | TEXT | 1 | 2 |
| `user_id` | TEXT | 1 | 0 |
| `device_id` | TEXT | 0 | 0 |
| `harness` | TEXT | 1 | 0 |
| `repo_key` | TEXT | 1 | 0 |
| `repo_alias` | TEXT | 0 | 0 |
| `title` | TEXT | 0 | 0 |
| `started_at` | TEXT | 1 | 0 |
| `state` | TEXT | 1 | 0 |
| `stopped_at` | TEXT | 0 | 0 |
| `governing_goal_id` | TEXT | 0 | 0 |
| `governing_alignment_id` | TEXT | 0 | 0 |
| `agent_stopped` | INTEGER | 1 | 0 |
| `conflicts` | INTEGER | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `updated_at` | TEXT | 1 | 0 |
| `ended_reason` | TEXT | 0 | 0 |

Foreign keys: `[{"id":0,"seq":0,"table":"v2_alignments","from":"ws_id","to":"ws_id","on_update":"NO ACTION","on_delete":"NO ACTION","match":"NONE"},{"id":0,"seq":1,"table":"v2_alignments","from":"governing_alignment_id","to":"id","on_update":"NO ACTION","on_delete":"NO ACTION","match":"NONE"},{"id":1,"seq":0,"table":"v2_goals","from":"ws_id","to":"ws_id","on_update":"NO ACTION","on_delete":"NO ACTION","match":"NONE"},{"id":1,"seq":1,"table":"v2_goals","from":"governing_goal_id","to":"id","on_update":"NO ACTION","on_delete":"NO ACTION","match":"NONE"},{"id":2,"seq":0,"table":"v2_devices","from":"device_id","to":"id","on_update":"NO ACTION","on_delete":"SET NULL","match":"NONE"},{"id":3,"seq":0,"table":"v2_workspaces","from":"ws_id","to":"id","on_update":"NO ACTION","on_delete":"CASCADE","match":"NONE"}]`.

### v2_workspaces

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 0 | 1 |
| `name` | TEXT | 1 | 0 |
| `created_by` | TEXT | 1 | 0 |
| `created_at` | TEXT | 1 | 0 |
| `deleted_at` | TEXT | 0 | 0 |
| `steering` | TEXT | 1 | 0 |

Foreign keys: `[]`.

### Additional or differing tables: local

None.

### Additional or differing tables: hosted

### ba_rate_limit

| Column | SQLite affinity | notnull | Primary-key position |
| --- | --- | ---: | ---: |
| `id` | TEXT | 1 | 1 |
| `key` | TEXT | 1 | 0 |
| `count` | INTEGER | 1 | 0 |
| `lastRequest` | bigint | 1 | 0 |

Foreign keys: `[]`.



## Provider metadata identifier protocol

Submit each discovered provider table name unchanged in the raw identifier slot
of the caller-owned SQLite metadata statement, `PRAGMA table_info(<table-name>)`.
This is the existing metadata port protocol. The supplied SQL service parses the
raw identifier and owns any preparation failure. Preserve its exact thrown value
through transaction rollback when a discovered name cannot be prepared there.
Quoting or repairing the identifier changes this protocol's accepted inputs.
Skipping an unpreparable provider table also changes account deletion's result.
The same raw provider identifier is used for its selected person-row deletion.
Future provider tables with valid identifiers and the exact userId column remain
supported. Business-query aliases and equivalent private SQL plans otherwise keep
the permissions already declared by this target.


#### Scenario: Complete account and membership namespaces

- **WHEN** the Node target is selected
- **THEN** Capture21account and6lifecycle resources once without effects; preserve all9operations, explicit member-removal composition, transaction callback results, exact failures, opaque SQL ownership, stored values, public types and actual cyclic host binding.
