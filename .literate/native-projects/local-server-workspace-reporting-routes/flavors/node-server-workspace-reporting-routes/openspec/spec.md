# Node-Server-Workspace-Reporting-Routes implementation Flavor

## ADDED Requirements

### Requirement: Workspace reporting HTTP routes target binding [authored:node-server-workspace-reporting-routes-v3]

# Node binding for workspace reporting

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_workspace_reporting_routes` containing exactly two files, `package.json` and `create_workspace_reporting_routes.js`. Put all runtime logic in that JavaScript file and use only the supplied resources. The package exports `./create_workspace_reporting_routes` only. The named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return a route map keyed by paths relative to the Next `app/api/v2` directory. Each map value exposes only the method keys listed below. The returned method accepts the original Request and the Next context with a params promise. The callback passed to http.route receives the original Request and the already resolved params object. Read ws and all other path values directly from that second argument. The callback uses no context.params lookup and does not await path params. Use the existing `http.route` wrapper and return its wrapped handlers. Call supplied free functions with undefined receiver. Preserve method receivers on the Request, URL, Date and other host objects. Use the supplied `Response`, `URL` and `Date` constructors and the supplied Date static methods. The application supplies the host clock.

| Relative route key | Method keys |
| --- | --- |
| `workspaces/[ws]/activity` | `GET`, `POST` |
| `workspaces/[ws]/allocation` | `GET` |
| `workspaces/[ws]/goals/[goal]/activity` | `GET` |
| `workspaces/[ws]/home` | `GET` |
| `workspaces/[ws]/spend` | `GET` |
| `workspaces/[ws]/steering` | `POST` |

| Resource | Members |
| --- | --- |
| `activity` | `activityFor`, `ingestActivity` |
| `allocation` | `allocation`, `weeklyAllocation` |
| `errors` | `badRequest` |
| `goalActivity` | `ACTIVITY_WINDOW_DAYS`, `goalActivity` |
| `home` | `workspaceHome` |
| `http` | `deviceAuth`, `eitherAuth`, `idParam`, `readJson`, `route`, `webAuth` |
| `spend` | `spend` |
| `steering` | `ingestSteering`, `steeringCounts` |
| `validate` | `ID_RE` |
| `workspaces` | `enter` |

## Handler behavior

The supplied `activityFor`, `allocation`, `weeklyAllocation`, `steeringCounts`, `goalActivity`, `workspaceHome` and `spend` return immediate values. Read and compose these values synchronously. Keep each original body read and its await at the point specified below.

Each route starts its authentication and workspace effects by obtaining its principal. Validate the workspace path with `idParam(params.ws, ID_RE)` and call `enter(principal, workspaceId)` with the authenticated principal first and the validated workspace ID second. Call `enter` synchronously. Use the resulting workspace policy principal for the domain calls. Preserve the call order below and let the supplied route wrapper map returned values and errors to responses.

- `POST workspaces/[ws]/activity` calls `deviceAuth(req)`, enters the workspace, and awaits `readJson(req, 128 * 1024)`. Return `ingestActivity(policyPrincipal, devicePrincipal, body)`.
- `GET workspaces/[ws]/activity` calls `deviceAuth(req)` and enters the workspace. Read `after` from `new URL(req.url).searchParams`, use zero for a falsy value and apply `Number`. Pass the result to `activityFor(policyPrincipal, after)` when it is a nonnegative safe integer, or pass zero otherwise.
- `GET workspaces/[ws]/allocation` awaits `eitherAuth(req)` and enters the workspace. Read and normalize `to` before `from`. Normalize each nonempty time using `Date.parse` and `new Date(parsed).toISOString()`. Invalid times throw `badRequest("<field> must be an ISO 8601 time")`. An absent or empty `to` remains null. If `from` normalizes to null, compute its ISO timestamp seven days before the normalized `to`, or seven days before `Date.now()` when `to` is null. If `weeks` is absent use 6. Otherwise convert the query value with `Number` and require an integer from 1 to 26 inclusive. Invalid values throw `badRequest("weeks must be 1 to 26")`. Return an object with `window` from `allocation(policyPrincipal, from, to)`, `weekly` from `weeklyAllocation(policyPrincipal, weeks)`, and `steering` from `steeringCounts(policyPrincipal, from, to)`, in that order.
- `GET workspaces/[ws]/goals/[goal]/activity` starts the response object with `window_days` from the supplied `ACTIVITY_WINDOW_DAYS` constant. Await `webAuth(req)`, enter the workspace and validate the goal path with `idParam(params.goal, ID_RE)`. Spread the result of `goalActivity(policyPrincipal, goalId)` after `window_days`.
- `GET workspaces/[ws]/home` awaits `webAuth(req)`, enters the workspace and returns `workspaceHome(policyPrincipal)` as a JSON response with `cache-control: no-store`.
- `GET workspaces/[ws]/spend` awaits `webAuth(req)` and enters the workspace. Read the query with the supplied URL constructor. A falsy `by` defaults to `goal`. Normalize `pod` to `team`. Require `goal`, `team` or `session`. Invalid values throw `badRequest("by must be goal, team or session")` before time parsing. Normalize `from` then `to` with the same rules used by allocation, keeping empty or absent values null. Return `spend(policyPrincipal, by, from, to)`.
- `POST workspaces/[ws]/steering` calls `deviceAuth(req)`, enters the workspace and awaits `readJson(req, 32 * 1024)`. Return `ingestSteering(policyPrincipal, devicePrincipal, body)`.


#### Scenario: Preserve the exact route keys, methods and host effect contract

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve workspace admission, credential selection, date and query normalization, body limits, cache headers and the existing domain dispatch. Use the declared host resources.
