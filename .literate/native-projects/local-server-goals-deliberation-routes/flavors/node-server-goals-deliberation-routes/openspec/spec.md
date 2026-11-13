# Node-Server-Goals-Deliberation-Routes implementation Flavor

## ADDED Requirements

### Requirement: Goals and deliberation HTTP routes target binding [authored:node-server-goals-deliberation-routes-free-functions-v4]

# Node binding for goals and deliberation

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_goals_deliberation_routes` containing exactly two files, `package.json` and `create_goals_deliberation_routes.js`. Put all runtime logic in the JavaScript file and use only supplied resources. Export only `./create_goals_deliberation_routes`. Its named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return a route map keyed by the relative Next `app/api/v2` paths below. Expose only the methods listed for each path. Use the supplied `http.route` wrapper around each async handler and return the wrapped function. The returned method accepts the original Request and the Next context with a params promise. The async callback passed to `http.route` receives the original Request and the already resolved params object. Read ws and other path values directly from that second argument, without a context.params lookup or a second await. Use the supplied `Response` and `URL`. Call supplied free functions with undefined receiver and preserve method receivers.

| Resource | Members |
| --- | --- |
| `alignments` | `actOnAlignment`, `assertAction`, `createAlignment`, `getAlignment`, `listAlignments` |
| `changes` | `actOnChangeRequest`, `addEvidence`, `assertChangeRequestAction`, `changeRequestGroups`, `counterBase`, `createChangeRequest`, `dependencyChoices`, `dependencyLoops`, `getChangeRequest`, `listChangeRequests`, `removeEvidence`, `versionLoops` |
| `goals` | `confirmParent`, `createGoal`, `goalDetail`, `goalsFeed`, `newGoalVersion` |
| `http` | `eitherAuth`, `eitherWrite`, `idParam`, `readJson`, `route`, `webAuth`, `webWrite` |
| `limitSuggest` | `suggestLimits` |
| `reallocations` | `actOnReallocation`, `assertReallocationAction`, `createReallocation`, `getReallocation`, `listReallocations` |
| `validate` | `ID_RE`, `str` |
| `value` | `recordValue`, `valueView` |
| `workspaces` | `enter` |

All methods obtain the named credential principal first, then validate `params.ws` with `idParam(params.ws, ID_RE)` and call `enter` with the principal and validated workspace ID. The resulting policy principal is the first argument to each domain call. Validate each named goal, alignment, change request, evidence and reallocation path ID with `idParam` and `ID_RE`. Use the supplied URL constructor for query parsing. Let the wrapper map domain and validation errors to responses.

## Goals and limits

- `GET workspaces/[ws]/goals` awaits `eitherAuth(req)` and enters the workspace. Call `goalsFeed(policyPrincipal)`, quote its version as the ETag and set `cache-control` to `private, no-cache`. Read `if-none-match`, default a falsy value to the empty string, split on commas, trim each part and remove a leading `W/`. Return bodyless status 304 with the same headers for the matching ETag or `*`. Otherwise return the feed as JSON with the same headers.
- `POST workspaces/[ws]/goals` awaits `webWrite(req)`, enters the workspace and reads JSON with limit `32 * 1024`. Await `createGoal(policyPrincipal, body)` and return JSON with status 201.
- `GET workspaces/[ws]/goals/[goal]` awaits `webAuth(req)`, enters the workspace and validates the goal ID. Read `counter` from the query. Validate it as an ID if truthy and use undefined otherwise. Call `goalDetail(policyPrincipal, goalId)`. Spread its result and append `dependency_choices`, `dependency_loops`, `counter_base` and `version_loops` in that order. The first three values call `dependencyChoices`, `dependencyLoops` and `counterBase` with the principal, goal ID and counter. The last calls `versionLoops` with the principal, goal ID and `detail.can_edit`.
- `POST workspaces/[ws]/goals/[goal]/review` awaits `webWrite(req)`, enters the workspace and reads JSON with limit 4096. Validate the goal path, then read `parent_id` using `str(body, "parent_id", 80)` and validate it with `idParam` and `ID_RE`. Return `confirmParent(policyPrincipal, goalId, parentId)`.
- `POST workspaces/[ws]/goals/[goal]/versions` awaits `webWrite(req)` and enters the workspace. Validate the goal ID before reading JSON with limit `32 * 1024`. Await `newGoalVersion(policyPrincipal, goalId, body)` and return JSON with status 201.
- `POST workspaces/[ws]/limits/suggest` awaits `webWrite(req)` and enters the workspace. Read JSON with limit `32 * 1024` and return `suggestLimits(policyPrincipal, body)`.

## Change requests, evidence and value

- `GET workspaces/[ws]/change-requests` awaits `webAuth(req)`, enters the workspace and returns `changeRequestGroups(policyPrincipal, state)` with the raw `state` query value.
- `GET workspaces/[ws]/goals/[goal]/change-requests` awaits `webAuth(req)`, enters the workspace and returns an object with `change_requests` from `listChangeRequests(policyPrincipal, { goalId, state })`. Validate the goal path before reading the raw `state` query value.
- `POST workspaces/[ws]/goals/[goal]/change-requests` awaits `webWrite(req)` and enters the workspace. Validate the goal ID before reading JSON with limit `32 * 1024`. Await `createChangeRequest(policyPrincipal, goalId, body)` and return JSON with status 201.
- `GET workspaces/[ws]/goals/[goal]/change-requests/[id]` awaits `webAuth(req)` and enters the workspace. Validate the change request ID before the goal ID and return `getChangeRequest(policyPrincipal, requestId, goalId)`.
- `POST workspaces/[ws]/goals/[goal]/change-requests/[id]/[action]` awaits `webWrite(req)` and enters the workspace. Call `assertChangeRequestAction(params.action)` before validating the goal and request IDs in that order. Then read JSON with limit `32 * 1024` and return `actOnChangeRequest(policyPrincipal, goalId, requestId, action, body)`.
- `POST workspaces/[ws]/goals/[goal]/change-requests/[id]/evidence` awaits `eitherWrite(req)` and enters the workspace. Read JSON with limit `8 * 1024` before validating the goal and request IDs. Call `addEvidence(policyPrincipal, goalId, requestId, body, source)`, where source is `person` for the web credential kind and `agent` otherwise. Await the result and return JSON with status 201.
- `DELETE workspaces/[ws]/goals/[goal]/change-requests/[id]/evidence/[evidence]` awaits `eitherWrite(req)`, enters the workspace and validates the goal, request and evidence IDs in that order. Return `removeEvidence(policyPrincipal, goalId, requestId, evidenceId)`.
- `GET workspaces/[ws]/goals/[goal]/change-requests/[id]/value` awaits `webAuth(req)`, enters the workspace and validates the goal and request IDs in that order. Return `valueView(policyPrincipal, goalId, requestId)` as JSON with `cache-control: no-store`.
- `POST workspaces/[ws]/goals/[goal]/change-requests/[id]/value` awaits `webWrite(req)`, enters the workspace and validates the goal and request IDs. Then read JSON with limit `4 * 1024` and return `recordValue(policyPrincipal, goalId, requestId, body)`. Preserve the wrapper's rate-limit error and retry header.

## Alignments and reallocations

- `GET workspaces/[ws]/alignments` awaits `webAuth(req)`, enters the workspace and returns `listAlignments(policyPrincipal)`.
- `POST workspaces/[ws]/alignments` awaits `webWrite(req)`, enters the workspace and reads JSON with limit `16 * 1024`. Await `createAlignment(policyPrincipal, body)` and return JSON with status 201.
- `GET workspaces/[ws]/alignments/[id]` awaits `webAuth(req)`, enters the workspace and returns `getAlignment(policyPrincipal, alignmentId)` with the validated path ID.
- `POST workspaces/[ws]/alignments/[id]/[action]` awaits `webWrite(req)`, enters the workspace and validates the alignment path ID. Call `assertAction(params.action)` before reading JSON with limit `16 * 1024`. Return `actOnAlignment(policyPrincipal, alignmentId, action, body)`.
- `GET workspaces/[ws]/reallocations` awaits `webAuth(req)`, enters the workspace and returns `listReallocations(policyPrincipal)`.
- `POST workspaces/[ws]/reallocations` awaits `webWrite(req)`, enters the workspace and reads JSON with limit `16 * 1024`. Await `createReallocation(policyPrincipal, body)` and return JSON with status 201.
- `GET workspaces/[ws]/reallocations/[id]` awaits `webAuth(req)`, enters the workspace and returns `getReallocation(policyPrincipal, reallocationId)` with the validated path ID.
- `POST workspaces/[ws]/reallocations/[id]/[action]` awaits `webWrite(req)`, enters the workspace and validates the reallocation path ID. Call `assertReallocationAction(params.action)` before reading JSON with limit `16 * 1024`. Return `actOnReallocation(policyPrincipal, reallocationId, action, body)`.

## Synchronous host functions

The following supplied functions return immediate values or throw synchronously. Call them in the original continuation and preserve the original argument evaluation order. The authentication helpers and JSON body reads keep their existing awaits. Preserve each asynchronous domain call specified in the handler clauses.

| Resource | Synchronous members |
| --- | --- |
| `workspaces` | `enter` |
| `goals` | `goalsFeed`, `goalDetail` |
| `changes` | `dependencyChoices`, `dependencyLoops`, `counterBase`, `versionLoops`, `listChangeRequests`, `getChangeRequest`, `changeRequestGroups` |
| `alignments` | `listAlignments`, `getAlignment` |
| `reallocations` | `listReallocations`, `getReallocation` |
| `value` | `valueView` |

After authentication, enter the workspace synchronously with the principal first and workspace ID second. Compose each goal detail and its dependency, counter and version projections as one synchronous snapshot. Each read response reaches its domain call in that continuation. For writes, invoke the original body read at the point named in the handler clauses.

## Supplied function receivers

Every function supplied in the named resource groups is a standalone imported function. Invoke each with an undefined receiver, including `http.route` during factory construction and every domain function during a request. Calling `workspaces.enter(...)`, `goals.goalsFeed(...)` or `service[name](...)` would supply the resource object as `this` and violates this requirement. Destructure the functions or use an unbound call such as `(0, service[name])(...)`. This applies equally to synchronous and asynchronous functions, without adding a continuation. `Response.json(...)` remains a method call with the supplied Response object as receiver. The supplied URL constructor remains a constructor call.


#### Scenario: Preserve imported function receivers and request continuation order

- **WHEN** the factory registers handlers or invokes a supplied host function
- **THEN** Call each imported function with an undefined receiver, while preserving the Response method receiver and all original synchronous and asynchronous boundaries.
