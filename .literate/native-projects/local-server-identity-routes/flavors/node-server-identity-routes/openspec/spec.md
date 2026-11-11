# Node-Server-Identity-Routes implementation Flavor

## ADDED Requirements

### Requirement: HTTP identity and device admission target binding [authored:node-server-identity-routes-device-ordering-v1]

# Node binding for HTTP identity and device admission

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package
`server_identity_routes` with `package.json` and `create_identity_routes.js`.
The package exports `./create_identity_routes` only. Its named synchronous factory
accepts one resources argument. Import and factory construction perform no request effects.
Emit no Makefile or additional dependency.

Return a route map keyed by the paths below, relative to the Next `app/api/v2` route directory.
Each map value exposes only the listed HTTP method keys. The returned
handler accepts the original Request and the Next context with a params
promise, and returns the original response shape. The Better Auth GET
and POST exports reference the same handler function.

| Relative route key | Method keys |
| --- | --- |
| `access-requests` | `POST` |
| `account/passkey-prompt` | `DELETE` |
| `account/passkeys/[id]` | `DELETE`, `PATCH` |
| `account/passkeys` | `GET` |
| `account/sign-out-everywhere` | `POST` |
| `auth/[...all]` | `GET`, `POST` |
| `device/approve` | `POST` |
| `device/authorize` | `POST` |
| `device/deny` | `POST` |
| `device/refresh` | `POST` |
| `device/requests/[code]` | `GET` |
| `device/token` | `POST` |
| `devices/[id]` | `DELETE` |
| `devices/[id]/workspaces` | `POST` |
| `devices` | `GET` |
| `devices/self` | `DELETE` |
| `invites/[token]/accept` | `POST` |
| `invites/[token]` | `GET` |
| `me` | `DELETE`, `GET` |

Use the exact host resource members below. Keep Next connection and readiness, session access,
request wrapping, body reading, credential and ID validation, and domain effects in the supplied functions.
Preserve the receiver for methods invoked on SDK objects and call imported free functions with an undefined receiver.
Use the supplied web `Response` and `URL` constructors. Use `URL` when reading the optional
device replacement parameter in self-revocation.

| Resource | Members |
| --- | --- |
| `config` | `config` |
| `access` | `createAccessRequest` |
| `account` | `deleteAccount`, `deletePasskey`, `dismissPasskeyPrompt`, `listPasskeys`, `passkeyPromptDue`, `renamePasskey`, `signOutEverywhere` |
| `auth` | `COOKIE_PREFIX`, `getAuth` |
| `devices` | `authorize`, `decideRequest`, `deviceOwnedBy`, `grantWorkspace`, `listDevices`, `lookupRequest`, `refresh`, `revokeDevice`, `token`, `userCodeOf`, `workspaceIdsOf` |
| `errors` | `badRequest`, `notFound` |
| `http` | `clientKey`, `deviceAuth`, `eitherAuth`, `idParam`, `noContent`, `originOf`, `readJson`, `rejectBrowser`, `requireRecentSignIn`, `requireSameSite`, `route`, `webAuth`, `webWrite` |
| `init` | `ready` |
| `validate` | `ID_RE`, `b64url`, `oneLine`, `str`, `strList` |
| `workspaces` | `acceptInvite`, `otherWorkspacesFor`, `previewInvite`, `workspacesFor` |
| `nextServer` | `connection` |

Apply the source-derived route contract for per-method effect order, limits, validation, headers and status.

## Handler behavior

Use `http.route` to wrap each async route body below, apart from the
Better Auth catch-all. Its callback receives two arguments, the original
Request and the already resolved params object. The wrapper is responsible
for awaiting the context's params promise. Read each path parameter
directly from the callback's second argument, such as `params.id`,
`params.code` or `params.token`. Return the wrapped handler itself, and
let the wrapper convert returned values and errors into responses.

### Access, account and Better Auth

- `POST access-requests` calls `requireSameSite(req)`, then awaits `readJson(req, 8192)`. Call `createAccessRequest(req, clientKey(req), body)` and return its awaited value as JSON with status 201. The wrapper handles errors from the service.
- `DELETE account/passkey-prompt` awaits `webWrite(req)`, then `dismissPasskeyPrompt(person.user.id)`, and returns `noContent()`.
- `GET account/passkeys` awaits `webAuth(req)` and returns `passkeys` from `listPasskeys(person.user.id)` and `prompt` from `passkeyPromptDue(person.user.id)`, in that order.
- `PATCH account/passkeys/[id]` awaits `webWrite(req)`, validates the path ID with `idParam` and `/^[a-z2-7]{32}$/`, then reads JSON with limit 4096. Return `renamePasskey(person.user.id, id, str(body, "name", 100))`.
- `DELETE account/passkeys/[id]` awaits `webWrite(req)`, validates the path ID with the same pattern, checks `requireRecentSignIn(person, "delete a passkey")`, then awaits `deletePasskey(person.user.id, id)` and returns `noContent()`.
- `POST account/sign-out-everywhere` awaits `webWrite(req)`, then reads JSON with limit 1024. Read `devices` then `apps`. Each undefined value becomes false. Any other non-Boolean value throws `badRequest` with `"<field> must be true or false"`. Check `requireRecentSignIn(person, "sign out everywhere")`, then await `signOutEverywhere(person.user.id, { devices, apps })`. Read `config.config().hosted` after the domain call. Return the result as JSON with one `set-cookie` header. The value is `<prefix>.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`. On the hosted branch prepend `__Secure-` to the prefix and append `; Secure`. Use `auth.COOKIE_PREFIX` in both branches.
- `GET auth/[...all]` and `POST auth/[...all]` share one async handler with one request parameter. Await `nextServer.connection()`. If `req.headers.get("authorization")` is non-null, return status 403 with JSON fields `error: "bearer_not_allowed"` and `message: "Web routes do not accept device tokens"`. Otherwise await `init.ready()` and return `auth.getAuth().handler(req)` with the auth object as the method receiver.

### Pairing and tokens

- `POST device/approve` awaits `webWrite(req)`, calls `requireRecentSignIn(person)`, then reads JSON with limit 8192. Return `decideRequest(person.user.id, userCodeOf(body), "approve", workspaceIdsOf(body))`.
- `POST device/authorize` calls `rejectBrowser(req)` before reading JSON with limit 4096. Build an object with `device_name` from `oneLine(body, "device_name", 100)` and `public_key` from `b64url(body, "public_key", 43, 43)`. Return `authorize(fields, clientKey(req), originOf(req))`.
- `POST device/deny` awaits `webWrite(req)`, then reads JSON with limit 4096 and returns `decideRequest(person.user.id, userCodeOf(body), "deny", [])`.
- `POST device/refresh` calls `rejectBrowser(req)` before reading JSON with limit 4096. Return `refresh(fields)`. Read fields in order: `device_id` with `str` limit 64, `refresh_token` with `str` limit 200, `ts` with `str` limit 40, then `sig` with `b64url` limits 86 and 88.
- `GET device/requests/[code]` awaits `webAuth(req)` and returns `lookupRequest(person.user.id, code)` with the unmodified path parameter.
- `POST device/token` calls `rejectBrowser(req)` before reading JSON with limit 4096. Require `grant_type` to equal `urn:ietf:params:oauth:grant-type:device_code`. A mismatch throws `badRequest("unsupported grant_type", "unsupported_grant_type")`. If `replaces` is present and non-null, require a string matching the supplied `ID_RE`. Failure throws `badRequest("replaces must be a device id")`. Return `token(b64url(body, "device_code", 43, 128), replacement)` with the string replacement or null.

### Paired devices and invitations

- `DELETE devices/[id]` awaits `webWrite(req)`, validates the path ID with `idParam(params.id, ID_RE)`, then calls `deviceOwnedBy(id, person.user.id)`. If false, throw `notFound()`. Await `revokeDevice(id, "revoked_on_web", person.user.id)` and return `noContent()`.
- `POST devices/[id]/workspaces` awaits `webWrite(req)`, validates the path ID with `idParam(params.id, ID_RE)`, then reads JSON with limit 1024. Read `workspace_id` with `str` limit 80 and require `ID_RE`. On failure throw `badRequest("workspace_id is not a workspace id")`. Check `requireRecentSignIn(person, "give a device this workspace")`, then return `grantWorkspace(person.user.id, id, workspaceId)`.
- `GET devices` awaits `eitherAuth(req)` and reads `listDevices(principal.user.id)`. Return the list as `devices`. For a device principal, copy each row and add `current` based on equality with `principal.deviceId`. For a web principal return the unmodified list as the field value.
- `DELETE devices/self` calls `deviceAuth(req)`, then reads `replaced_by` from `new URL(req.url).searchParams`. Keep the value when truthy and matching `/^dv_[A-Za-z0-9_-]{1,80}$/`, else use null. Await `revokeDevice(device.deviceId, "logout", device.user.id, replacement)` and return `noContent()`.
- `POST invites/[token]/accept` awaits `webWrite(req)`, then reads JSON with limit 4096. If `device_ids` is an array containing a blank string after trim, throw `badRequest("device_ids must be device ids")`. Call `strList(body, "device_ids", { max: 20, itemMax: 64 })` and require each resulting ID to match `ID_RE`, with the same error on failure. Return `acceptInvite(token, person.user, person.emailVerified, deviceIds, callback)`. The callback calls `requireRecentSignIn(person, "give a device this workspace")` only when invoked by the domain service.
- `GET invites/[token]` awaits `webAuth(req)` and returns `previewInvite(token, person.user)` with the original path token.

### Current principal

- `GET me` awaits `eitherAuth(req)`. Return `user`, `device`, and `workspaces` in that order. Set `user` to the principal's user and `workspaces` to `workspacesFor(principal)`. Set `device` to its ID and name for a device principal, or null for a web principal. Only the device result has `other_workspaces`, from `otherWorkspacesFor(principal)`.
- `DELETE me` awaits `webWrite(req)`, checks `requireRecentSignIn(person, "delete your account")`, then reads JSON with limit 4096. Await `deleteAccount(person, str(body, "email", 320))` and return `noContent()`.

## Synchronous host functions

The following supplied functions return immediate values or throw synchronously. Call them in the original continuation and preserve the original argument evaluation order. The asynchronous webAuth, webWrite and eitherAuth helpers and JSON body reads keep their existing awaits. The deviceAuth helper is synchronous: do not await it. Preserve each asynchronous domain call specified in the handler clauses.

| Resource | Synchronous members |
| --- | --- |
| `http` | `deviceAuth`, `clientKey`, `idParam`, `noContent`, `originOf`, `rejectBrowser`, `requireRecentSignIn`, `requireSameSite` |
| `account` | `listPasskeys`, `passkeyPromptDue` |
| `devices` | `listDevices` |
| `workspaces` | `workspacesFor`, `otherWorkspacesFor`, `previewInvite` |

Read the passkey list and prompt flag in one continuation after authentication. Compose the current-principal response and its workspace lists in that same continuation.

In DELETE devices/self, evaluate deviceAuth, construct the URL, validate the replacement and enter revokeDevice in one synchronous continuation. The existing await is on revokeDevice itself. Preserve that boundary even when deviceAuth returns an ordinary value.


#### Scenario: Preserve synchronous device authentication and revocation dispatch

- **WHEN** the device self-revocation handler runs through the declared request wrapper
- **THEN** Keep synchronous device authentication, URL parsing and revocation entry in the original continuation. Preserve all existing handler arguments, guards and asynchronous operations.
