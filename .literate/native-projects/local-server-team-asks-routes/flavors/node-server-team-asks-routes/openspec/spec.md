# Node-Server-Team-Asks-Routes implementation Flavor

## ADDED Requirements

### Requirement: Team asks HTTP routes target binding [authored:node-server-team-asks-routes-ordering-v1]

# Node binding for team asks

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_team_asks_routes` containing exactly two files, `package.json` and `create_team_asks_routes.js`. Put all runtime logic in that JavaScript file and use only the supplied resources. Export only `./create_team_asks_routes`. The named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return a map with `workspaces/[ws]/asks` exposing `GET` and `POST`, `workspaces/[ws]/asks/[id]` exposing `GET`, `workspaces/[ws]/asks/import` exposing `POST`, and `workspaces/[ws]/asks/[id]/[action]` exposing `POST`. Wrap all async route bodies with the supplied `http.route` and return the wrapped handlers. The returned method accepts the original Request and the Next context with a params promise. The callback passed to http.route receives the original Request and the already resolved params object. Read ws and all other path values directly from that second argument. The callback uses no context.params lookup and does not await path params.

Use the supplied `URL` and `Response` constructors. Call supplied free functions with undefined receiver and preserve the receiver on request and URL methods. The resources provide `asks.actOnAsk`, `asks.asksFeed`, `asks.assertAskAction`, `asks.createAsk`, `asks.getAsk`, `asks.importAsks`, `http.eitherAuth`, `http.idParam`, `http.readJson`, `http.route`, `http.webAuth`, `http.webWrite`, `validate.ID_RE` and `workspaces.enter`.

Each handler authenticates before validating `params.ws` with `idParam(params.ws, ID_RE)` and entering the workspace. Supply the resulting policy principal to the domain function.

- `GET workspaces/[ws]/asks` awaits `eitherAuth(req)`. After workspace entry, read the query from the supplied URL constructor. Pass `asksFeed` the policy principal, filters with `state`, `teamId` from `team_id`, and `limit` in that order, then the authenticated device ID for a device or null for a web principal. Pass the raw query values. Quote the returned feed version for the ETag and set `cache-control` to `private, no-cache`. Parse `if-none-match` by splitting on commas, trimming and removing a leading `W/`. A matching tag or `*` returns a bodyless status 304 with the same headers. Otherwise return the feed as JSON with those headers.
- `POST workspaces/[ws]/asks` awaits `webWrite(req)`, enters the workspace and awaits `readJson(req, 16 * 1024)`. Await `createAsk(policyPrincipal, body)` and return JSON with status 201.
- `GET workspaces/[ws]/asks/[id]` awaits `webAuth(req)`, enters the workspace and validates the ask ID with `idParam(params.id, ID_RE)`. Return `getAsk(policyPrincipal, id)`.
- `POST workspaces/[ws]/asks/import` awaits `webWrite(req)`, enters the workspace and awaits `readJson(req, 512 * 1024)`. Await `importAsks(policyPrincipal, body)` and return JSON with status 201.
- `POST workspaces/[ws]/asks/[id]/[action]` awaits `webWrite(req)`, enters the workspace, validates the ask ID with `idParam(params.id, ID_RE)` and calls `assertAskAction(params.action)`. Only then await `readJson(req, 8 * 1024)`. Return `actOnAsk(policyPrincipal, id, action, body)`.

## Synchronous host functions

The following supplied functions return immediate values or throw synchronously. Call them in the original continuation and preserve the original argument evaluation order. The authentication helpers and JSON body reads keep their existing awaits. Preserve each asynchronous domain call specified in the handler clauses.

| Resource | Synchronous members |
| --- | --- |
| `workspaces` | `enter` |
| `asks` | `asksFeed`, `getAsk`, `assertAskAction` |

Call enter with the authenticated principal first and the validated workspace ID second. Read the feed and calculate its response in the same continuation as workspace admission. For writes, invoke the original body read at its specified point after admission.


#### Scenario: Preserve synchronous host checks and composed reads

- **WHEN** the Node library receives a request through its declared wrapper
- **THEN** Keep each original synchronous continuation through the next operation. Preserve original authentication and body-read awaits and the stated asynchronous domain calls.
