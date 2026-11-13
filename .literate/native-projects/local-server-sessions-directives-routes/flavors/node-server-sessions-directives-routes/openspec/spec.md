# Node-Server-Sessions-Directives-Routes implementation Flavor

## ADDED Requirements

### Requirement: Sessions and directives HTTP routes target binding [authored:node-server-sessions-directives-routes-v4]

# Node binding for sessions and directives

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_sessions_directives_routes` containing exactly two files, `package.json` and `create_sessions_directives_routes.js`. Put all runtime logic in the JavaScript file and use only supplied resources. Export only `./create_sessions_directives_routes`. Its named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return the wrapped methods keyed by the paths below relative to the Next `app/api/v2` directory. A route map entry has exactly the method keys named for its path. Use `http.route` to wrap each async route body and return the wrapped function. The returned method accepts the original Request and the Next context with a params promise. The async callback passed to `http.route` receives the original Request and the already resolved params object. Read ws and other path values directly from that second argument, without a context.params lookup or a second await. Preserve the wrapper's mapping of values and errors to responses.

Use the supplied `Response` and `URL` constructors. Call supplied free functions with undefined receiver and preserve method receivers. Use the following resource members.

| Resource | Members |
| --- | --- |
| `directives` | `RECEIPT_STATES`, `directivesFor`, `endedSessionsFor`, `parseCursor`, `recordReceipt` |
| `errors` | `badRequest` |
| `http` | `deviceAuth`, `eitherWrite`, `idParam`, `noContent`, `readJson`, `requireRecentSignIn`, `route`, `webAuth`, `webWrite` |
| `requests` | `cancelRequest`, `getHold`, `holdGoal`, `listHolds`, `listRequests`, `releaseGoal`, `requireHolder`, `sendRequest` |
| `sessions` | `deleteSession`, `ingestUsage`, `listSessions`, `openBindingEpoch`, `putSession`, `setAgentStop`, `stopSharing` |
| `validate` | `ID_RE`, `SESSION_KEY_RE`, `iso`, `oneOf`, `str` |
| `workspaces` | `enter` |

Where a route enters a workspace, obtain the named credential principal first, validate `params.ws` with `idParam(params.ws, ID_RE)`, and call `enter` with the principal and workspace ID. Validate goal and request IDs with `idParam` and `ID_RE`. Validate session path keys with `idParam` and `SESSION_KEY_RE`.

## Directives and delivery receipts

- `GET directives` calls `deviceAuth(req)`, parses the `cursor` query value with the supplied `parseCursor`, and calls `directivesFor(device, cursor, 100)`. Return `directives`, string `next_cursor` from the final directive's sequence or the input cursor when empty, a sorted copy of the device's grants as `workspaces`, and `ended_sessions` from `endedSessionsFor(device)`, in that order.
- `POST directives/[id]/receipts` calls `deviceAuth(req)`, then reads JSON with limit 2048. If `auto_accepted` is defined and is not Boolean, throw `badRequest("auto_accepted must be true or false")`. Call `recordReceipt` with the device, validated directive ID, `str(body, "session_key", 43)`, `oneOf(body, "state", RECEIPT_STATES)`, `iso(body, "at")`, then whether `auto_accepted` is exactly true. Return the service result.

## Goal holds and requests

- `GET workspaces/[ws]/goals/[goal]/hold` awaits `webAuth(req)`, enters the workspace, validates the goal ID and returns `getHold(policyPrincipal, goalId)`.
- `PUT workspaces/[ws]/goals/[goal]/hold` awaits `webWrite(req)`, enters the workspace and validates the goal ID. Read JSON with limit 4096 before calling `requireHolder(policyPrincipal, goalId)`. After the holder check, call `requireRecentSignIn(webPrincipal, "hold agents")`. Await `holdGoal(policyPrincipal, goalId, body)` and return its body as JSON with its status.
- `DELETE workspaces/[ws]/goals/[goal]/hold` awaits `webWrite(req)`, enters the workspace, validates the goal ID, calls `requireHolder(policyPrincipal, goalId)` and then calls `requireRecentSignIn(webPrincipal, "release agents")`. Return `releaseGoal(policyPrincipal, goalId)`.
- `GET workspaces/[ws]/goals/[goal]/requests` awaits `webAuth(req)`, enters the workspace and returns `listRequests(policyPrincipal, goalId)` with the validated goal ID.
- `POST workspaces/[ws]/goals/[goal]/requests` awaits `webWrite(req)` and enters the workspace. Validate the goal ID before reading JSON with limit 4096. Await `sendRequest(policyPrincipal, goalId, body)` and return JSON with status 201.
- `DELETE workspaces/[ws]/goals/[goal]/requests/[id]` awaits `webWrite(req)` and enters the workspace. Validate the goal ID before the request ID. Return `cancelRequest(policyPrincipal, goalId, requestId)`.
- `GET workspaces/[ws]/holds` awaits `webAuth(req)`, enters the workspace and returns an object with `holds` from `listHolds(policyPrincipal)`.

## Sessions

- `GET workspaces/[ws]/sessions` awaits `webAuth(req)`, enters the workspace and returns `listSessions(policyPrincipal)`.
- `PUT workspaces/[ws]/sessions/[key]` calls `deviceAuth(req)` and enters the workspace. Validate the session key before reading JSON with limit 8192. Return `putSession(policyPrincipal, device, key, body)`.
- `DELETE workspaces/[ws]/sessions/[key]` awaits `eitherWrite(req)` and enters the workspace. Validate the session key, await `deleteSession(policyPrincipal, credentialPrincipal, key)` and return `noContent()`.
- `POST workspaces/[ws]/sessions/[key]/epochs` calls `deviceAuth(req)` and enters the workspace. Validate the session key before reading JSON with limit 4096. Return `openBindingEpoch(policyPrincipal, device, key, body)`.
- `POST workspaces/[ws]/sessions/[key]/resume` awaits `webWrite(req)`, enters the workspace and validates the session key. Return `setAgentStop(policyPrincipal, key, false)`.
- `POST workspaces/[ws]/sessions/[key]/stop` awaits `webWrite(req)`, enters the workspace and validates the session key. Return `setAgentStop(policyPrincipal, key, true)`.
- `POST workspaces/[ws]/sessions/[key]/stop-sharing` awaits `eitherWrite(req)`, enters the workspace and validates the session key. Return `stopSharing(policyPrincipal, credentialPrincipal, key)`.
- `POST workspaces/[ws]/sessions/[key]/usage` calls `deviceAuth(req)` and enters the workspace. Validate the session key before reading JSON with limit 256 * 1024. Return `ingestUsage(policyPrincipal, device, key, body)`.

## Synchronous host functions

The following supplied functions return immediate values or throw synchronously. Call them in the original continuation and preserve the original argument evaluation order. The authentication helpers and JSON body reads keep their existing awaits. Preserve each asynchronous domain call specified in the handler clauses.

| Resource | Synchronous members |
| --- | --- |
| `workspaces` | `enter` |
| `http` | `deviceAuth`, `requireRecentSignIn` |
| `requests` | `requireHolder`, `getHold`, `listHolds`, `listRequests` |
| `directives` | `directivesFor`, `endedSessionsFor` |
| `sessions` | `listSessions` |

Preserve the holder check, recent-sign-in check and guarded action invocation in one continuation after the original body read, when that read exists. Read the directive list and ended-session list as one synchronous device snapshot. Workspace admission completes in the caller's continuation before its next validation, domain call or original body read.

## Device authentication continuation

deviceAuth is synchronous. It returns the actual device principal or throws
before returning. Never await it in the directives GET, receipt POST, session
PUT, binding-epoch POST or usage POST handlers. In each case, validation,
workspace entry and the original body-read invocation remain in the same
continuation as device authentication, until an existing await is reached.
For directives GET, cursor parsing, directivesFor, the sorted grants copy and
endedSessionsFor complete before that callback returns its promise. A queued
task after device authentication must not run between those snapshot reads.
Do not model deviceAuth as an async helper in generated examples or tests.

Each returned directive carries its numeric sequence in the field seq. Read
only the final directive's seq for next_cursor, or the input cursor when the
list is empty. Do not invent a sequence alias or a new fallback field.


#### Scenario: Preserve the exact route keys, methods and host effect contract

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve credential choice, directive cursors, receipt shape, session controls, hold authorization and the order of recent sign-in and domain effects.
