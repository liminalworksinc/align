'use strict';

function create_connected_apps_routes(resources) {
  const { Response } = resources;
  const { GRANT_ID, listGrants, revokeGrant } = resources.grants;
  const { MCP_PATH, originOf } = resources.oauth;
  const { idParam, noContent, route, webAuth, webWrite } = resources.http;
  const { ID_RE } = resources.validate;
  const { enter } = resources.workspaces;

  return {
    'workspaces/[ws]/apps': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const workspaceId = idParam(params.ws, ID_RE);
        const policyPrincipal = enter(principal, workspaceId);
        return Response.json({
          url: originOf(req) + MCP_PATH,
          apps: listGrants(policyPrincipal)
        }, { headers: { 'cache-control': 'no-store' } });
      })
    },
    'workspaces/[ws]/apps/[grant]': {
      DELETE: route(async (req, params) => {
        const principal = await webWrite(req);
        const workspaceId = idParam(params.ws, ID_RE);
        const policyPrincipal = enter(principal, workspaceId);
        const grantId = idParam(params.grant, GRANT_ID);
        await revokeGrant(policyPrincipal, grantId);
        return noContent();
      })
    }
  };
}

module.exports = { create_connected_apps_routes };
