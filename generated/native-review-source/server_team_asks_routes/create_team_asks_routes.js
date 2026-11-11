'use strict';

function create_team_asks_routes(resources) {
  const { URL, Response } = resources;
  const { actOnAsk, asksFeed, assertAskAction, createAsk, getAsk, importAsks } = resources.asks;
  const { eitherAuth, idParam, readJson, route, webAuth, webWrite } = resources.http;
  const { ID_RE } = resources.validate;
  const { enter } = resources.workspaces;

  return {
    'workspaces/[ws]/asks': {
      GET: route(async (req, params) => {
        const principal = await eitherAuth(req);
        const policyPrincipal = enter(principal, idParam(params.ws, ID_RE));
        const url = new URL(req.url);
        const feed = asksFeed(policyPrincipal, {
          state: url.searchParams.get('state'),
          teamId: url.searchParams.get('team_id'),
          limit: url.searchParams.get('limit'),
        }, principal.kind === 'device' ? principal.deviceId : null);
        const etag = `"${feed.version}"`;
        const headers = { etag, 'cache-control': 'private, no-cache' };
        const condition = req.headers.get('if-none-match');
        if (condition && condition.split(',').some(value => {
          const tag = value.trim().replace(/^W\//, '');
          return tag === '*' || tag === etag;
        })) return new Response(null, { status: 304, headers });
        return Response.json(feed, { headers });
      }),
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policyPrincipal = enter(principal, idParam(params.ws, ID_RE));
        const body = await readJson(req, 16 * 1024);
        const result = await createAsk(policyPrincipal, body);
        return Response.json(result, { status: 201 });
      }),
    },
    'workspaces/[ws]/asks/[id]': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policyPrincipal = enter(principal, idParam(params.ws, ID_RE));
        const id = idParam(params.id, ID_RE);
        return Response.json(getAsk(policyPrincipal, id));
      }),
    },
    'workspaces/[ws]/asks/import': {
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policyPrincipal = enter(principal, idParam(params.ws, ID_RE));
        const body = await readJson(req, 512 * 1024);
        const result = await importAsks(policyPrincipal, body);
        return Response.json(result, { status: 201 });
      }),
    },
    'workspaces/[ws]/asks/[id]/[action]': {
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policyPrincipal = enter(principal, idParam(params.ws, ID_RE));
        const id = idParam(params.id, ID_RE);
        const action = assertAskAction(params.action);
        const body = await readJson(req, 8 * 1024);
        return Response.json(await actOnAsk(policyPrincipal, id, action, body));
      }),
    },
  };
}

module.exports = { create_team_asks_routes };
