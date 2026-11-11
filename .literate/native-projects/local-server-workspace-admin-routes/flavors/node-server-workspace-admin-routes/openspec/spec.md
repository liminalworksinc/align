# Node-Server-Workspace-Admin-Routes implementation Flavor

## ADDED Requirements

### Requirement: Workspace administration HTTP routes target binding [authored:node-server-workspace-admin-routes-ordering-v1]

# Node binding for workspace administration

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_workspace_admin_routes` containing exactly two files, `package.json` and `create_workspace_admin_routes.js`. Put all runtime logic in the JavaScript file and use only supplied resources. Export only `./create_workspace_admin_routes`. Its named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return a route map keyed by paths relative to the Next `app/api/v2` directory. Return the named methods below using the supplied `http.route` wrapper around each async body. The returned method accepts the original Request and the Next context with a params promise. The async callback passed to `http.route` receives the original Request and the already resolved params object. Read ws and other path values directly from that second argument, without a context.params lookup or a second await. Use the supplied `Response` and `URL`. Call supplied free functions with undefined receiver and preserve method receivers.

| Resource | Members |
| --- | --- |
| `http` | `idParam`, `noContent`, `readJson`, `requireRecentSignIn`, `route`, `webAuth`, `webWrite` |
| `policy` | `POD_ROLES`, `WS_ROLES` |
| `sample` | `createSampleWorkspace` |
| `validate` | `ID_RE`, `oneLine`, `oneOf`, `optOneOf`, `optStr`, `str` |
| `workspaces` | `auditTrail`, `createInvite`, `createTeam`, `createWorkspace`, `deleteInvite`, `deleteWorkspace`, `deletedWorkspaceOwnedBy`, `deletedWorkspacesFor`, `enter`, `listInvites`, `removeMember`, `removeTeamMember`, `restoreWorkspace`, `setMemberRole`, `setTeamMember`, `updateWorkspace`, `workspaceDetail`, `workspacesFor` |

Use the named credential helper before path validation. Where a route enters a workspace, validate `params.ws` with `idParam(params.ws, ID_RE)` and then call `enter` with the authenticated principal and workspace ID. Use the named path parameter and `ID_RE` for all other `idParam` calls.

## Workspace and restoration

- `GET workspaces` awaits `webAuth(req)`. Return `workspaces` from `workspacesFor(webPrincipal)` and `deleted` from `deletedWorkspacesFor(webPrincipal.user.id)`, in that order.
- `POST workspaces` awaits `webWrite(req)` and reads JSON with limit 4096. Call `createWorkspace(req, webPrincipal, oneLine(body, "name", 100), optStr(body, "creation_code", 100))`. Await the result and return JSON with status 201.
- `POST workspaces/sample` awaits `webWrite(req)` and reads JSON with limit 4096. Call `createSampleWorkspace(req, webPrincipal, optStr(body, "creation_code", 100))`. Await the result and return JSON with status 201.
- `GET workspaces/[ws]` awaits `webAuth(req)`, enters the workspace and returns `workspaceDetail(policyPrincipal)`.
- `PATCH workspaces/[ws]` awaits `webWrite(req)` and enters the workspace. Read JSON with limit 4096 and return `updateWorkspace(policyPrincipal, body)`.
- `DELETE workspaces/[ws]` awaits `webWrite(req)` and enters the workspace. When `policyPrincipal.wsRole` is `owner`, call `requireRecentSignIn(webPrincipal, "delete this workspace")`. Await `deleteWorkspace(policyPrincipal)` and return `noContent()`.
- `POST workspaces/[ws]/restore` awaits `webWrite(req)` and validates the workspace path. Call `deletedWorkspaceOwnedBy(webPrincipal.user.id, workspaceId)` before `requireRecentSignIn(webPrincipal, "restore a workspace")`. Return `restoreWorkspace(webPrincipal.user.id, workspaceId)`.
- `GET workspaces/[ws]/audit` awaits `webAuth(req)`, enters the workspace and returns an object with `audit` from `auditTrail(policyPrincipal)`.

## Invitations, roles and teams

- `GET workspaces/[ws]/invites` awaits `webAuth(req)`, enters the workspace and returns an object with `invites` from `listInvites(policyPrincipal)`.
- `POST workspaces/[ws]/invites` awaits `webWrite(req)`, enters the workspace and reads JSON with limit 4096. Build the team object with `id` from `optStr(body, "team_id", 64)` and `role` from `optOneOf(body, "team_role", POD_ROLES)`. Then read the requested workspace role with `oneOf(body, "role", WS_ROLES)`. When both the requested role and principal's workspace role are owner, call `requireRecentSignIn(webPrincipal, "invite an owner")`. Read the email with `str(body, "email", 254)`, await `createInvite(policyPrincipal, email, role, team)` and return JSON with status 201.
- `DELETE workspaces/[ws]/invites/[id]` awaits `webWrite(req)`, enters the workspace and validates the invite ID. Await `deleteInvite(policyPrincipal, inviteId)` and return `noContent()`.
- `POST workspaces/[ws]/members/[user]` awaits `webWrite(req)` and enters the workspace. If the policy principal is an owner, call `requireRecentSignIn(webPrincipal, "change a role")` before reading JSON with limit 4096. Validate `params.user` and read the role with `oneOf(body, "role", WS_ROLES)`. Return `setMemberRole(policyPrincipal, userId, role)`.
- `DELETE workspaces/[ws]/members/[user]` awaits `webWrite(req)`, enters the workspace and validates the user ID. When the target differs from the signed-in user and the policy principal is an owner, call `requireRecentSignIn(webPrincipal, "remove a member")`. From the original URL set `deleteSessions` to true exactly when `delete_sessions` is `1`. Await `removeMember(policyPrincipal, userId, { deleteSessions })` and return `noContent()`.
- `POST workspaces/[ws]/teams` awaits `webWrite(req)`, enters the workspace and reads JSON with limit 4096. Await `createTeam(policyPrincipal, oneLine(body, "name", 100))` and return JSON with status 201.
- `POST workspaces/[ws]/teams/[team]/members` awaits `webWrite(req)`, enters the workspace and reads JSON with limit 4096. Validate `params.team ?? params.pod`, read the user with `str(body, "user_id", 64)) and read the role with `oneOf(body, "role", POD_ROLES)`. Return `setTeamMember(policyPrincipal, teamId, userId, role)`.
- `DELETE workspaces/[ws]/teams/[team]/members/[user]` awaits `webWrite(req)`, enters the workspace and validates `params.team ?? params.pod` before `params.user`. Await `removeTeamMember(policyPrincipal, teamId, userId)` and return `noContent()`.

The existing v2 pods modules re-export the team handlers at the application layer. Keep the three re-exports and the handlers' nullish fallback from the `team` parameter to `pod`.

## Synchronous host functions

The following supplied functions return immediate values or throw synchronously. Call them in the original continuation and preserve the original argument evaluation order. The authentication helpers and JSON body reads keep their existing awaits. Preserve each asynchronous domain call specified in the handler clauses.

| Resource | Synchronous members |
| --- | --- |
| `http` | `requireRecentSignIn` |
| `workspaces` | `enter`, `workspacesFor`, `deletedWorkspacesFor`, `deletedWorkspaceOwnedBy`, `workspaceDetail`, `auditTrail`, `listInvites` |

Preserve the original workspace admission and any recent-sign-in check through the following action invocation. Restoration performs its ownership check, recent-sign-in check and restoration invocation in one continuation. Read current and deleted workspace lists in one continuation. Keep each original body read and domain await at its specified point.


#### Scenario: Preserve synchronous host checks and composed reads

- **WHEN** the Node library receives a request through its declared wrapper
- **THEN** Keep each original synchronous continuation through the next operation. Preserve original authentication and body-read awaits and the stated asynchronous domain calls.
