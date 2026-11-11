# Node-Server-Connected-Apps-Routes implementation Flavor

## ADDED Requirements

### Requirement: Connected applications HTTP routes target binding [authored:node-server-connected-apps-routes-v3]

# Node binding for connected applications

Use the selected Node 20 or later Standard build and test lifecycle. Emit the CommonJS package `server_connected_apps_routes` containing exactly two files, `package.json` and `create_connected_apps_routes.js`. Put all runtime logic in that JavaScript file and use only the supplied resources. Export only `./create_connected_apps_routes`. Its named synchronous factory takes one resources argument. Emit no Makefile or additional dependency. Import and factory construction perform no request effects.

Return a map with `workspaces/[ws]/apps` exposing only `GET` and `workspaces/[ws]/apps/[grant]` exposing only `DELETE`. Use the supplied `http.route` wrapper for both async route bodies and return the wrapped handlers. The returned method accepts the original Request and the Next context with a params promise. The callback passed to http.route receives the original Request and the already resolved params object. Read ws and all other path values directly from that second argument. The callback uses no context.params lookup and does not await path params.

The `enter`, `idParam`, `originOf`, `listGrants`, `Response.json`
and `noContent` ports are synchronous. After the awaited credential
helper returns, complete the remaining GET operations in the same
continuation. For DELETE, call synchronous workspace entry and grant ID
validation in that order, then invoke revokeGrant before the next
suspension. Await only that asynchronous revocation before noContent.
The callbacks preserve this scheduling even when a synchronous port
enqueues a microtask.

Use the supplied `Response` constructor. Capture and call free functions with undefined receiver. The resources provide `grants.GRANT_ID`, `grants.listGrants`, `grants.revokeGrant`, `oauth.MCP_PATH`, `oauth.originOf`, `http.idParam`, `http.noContent`, `http.route`, `http.webAuth`, `http.webWrite`, `validate.ID_RE` and `workspaces.enter`.

- `GET workspaces/[ws]/apps` awaits `webAuth(req)`, validates `params.ws` with `idParam(params.ws, ID_RE)` and calls `enter` with the authenticated principal and workspace ID. Return `Response.json` with `url` built from `originOf(req)` followed by `MCP_PATH`, then `apps` from `listGrants(policyPrincipal)`. Set `cache-control` to `no-store`.
- `DELETE workspaces/[ws]/apps/[grant]` awaits `webWrite(req)`, validates the workspace ID and enters the workspace as above. Then validate `params.grant` with `idParam(params.grant, GRANT_ID)`. Await `revokeGrant(policyPrincipal, grantId)` and return `noContent()`. Preserve the wrapper's mapping of domain refusals.


#### Scenario: Preserve the exact route keys, methods and host effect contract

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve cookie-only read, same-site write, workspace admission, grant ID validation, OAuth service dispatch and no-store response.
