'use strict';

function create_sessions_directives_routes(resources) {
  const { Response, URL } = resources;
  const { RECEIPT_STATES, directivesFor, endedSessionsFor, parseCursor, recordReceipt } = resources.directives;
  const { badRequest } = resources.errors;
  const { deviceAuth, eitherWrite, idParam, noContent, readJson, requireRecentSignIn, route, webAuth, webWrite } = resources.http;
  const { cancelRequest, getHold, holdGoal, listHolds, listRequests, releaseGoal, requireHolder, sendRequest } = resources.requests;
  const { deleteSession, ingestUsage, listSessions, openBindingEpoch, putSession, setAgentStop, stopSharing } = resources.sessions;
  const { ID_RE, SESSION_KEY_RE, iso, oneOf, str } = resources.validate;
  const { enter } = resources.workspaces;
  return {
    'directives': {
      GET: route(async (req) => {
        const device = deviceAuth(req);
        const cursor = parseCursor(new URL(req.url).searchParams.get('cursor'));
        const directives = directivesFor(device, cursor, 100);
        return {
          directives,
          next_cursor: String(directives.length ? directives[directives.length - 1].seq : cursor),
          workspaces: [...device.grants].sort(),
          ended_sessions: endedSessionsFor(device)
        };
      })
    },
    'directives/[id]/receipts': {
      POST: route(async (req, params) => {
        const device = deviceAuth(req);
        const body = await readJson(req, 2048);
        if (body.auto_accepted !== undefined && typeof body.auto_accepted !== 'boolean') {
          throw badRequest('auto_accepted must be true or false');
        }
        return recordReceipt(device, idParam(params.id, ID_RE), str(body, 'session_key', 43),
          oneOf(body, 'state', RECEIPT_STATES), iso(body, 'at'), body.auto_accepted === true);
      })
    },
    'workspaces/[ws]/goals/[goal]/hold': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return getHold(policy, idParam(params.goal, ID_RE));
      }),
      PUT: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        const goal = idParam(params.goal, ID_RE);
        const body = await readJson(req, 4096);
        requireHolder(policy, goal);
        requireRecentSignIn(principal, 'hold agents');
        const result = await holdGoal(policy, goal, body);
        return Response.json(result.body, { status: result.status });
      }),
      DELETE: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        const goal = idParam(params.goal, ID_RE);
        requireHolder(policy, goal);
        requireRecentSignIn(principal, 'release agents');
        return releaseGoal(policy, goal);
      })
    },
    'workspaces/[ws]/goals/[goal]/requests': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return listRequests(policy, idParam(params.goal, ID_RE));
      }),
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        const goal = idParam(params.goal, ID_RE);
        const body = await readJson(req, 4096);
        return Response.json(await sendRequest(policy, goal, body), { status: 201 });
      })
    },
    'workspaces/[ws]/goals/[goal]/requests/[id]': {
      DELETE: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        const goal = idParam(params.goal, ID_RE);
        const id = idParam(params.id, ID_RE);
        return cancelRequest(policy, goal, id);
      })
    },
    'workspaces/[ws]/holds': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return { holds: listHolds(policy) };
      })
    },
    'workspaces/[ws]/sessions': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return listSessions(policy);
      })
    },
    'workspaces/[ws]/sessions/[key]': {
      PUT: route(async (req, params) => {
        const device = deviceAuth(req);
        const policy = enter(device, idParam(params.ws, ID_RE));
        const key = idParam(params.key, SESSION_KEY_RE);
        const body = await readJson(req, 8192);
        return putSession(policy, device, key, body);
      }),
      DELETE: route(async (req, params) => {
        const principal = await eitherWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        const key = idParam(params.key, SESSION_KEY_RE);
        await deleteSession(policy, principal, key);
        return noContent();
      })
    },
    'workspaces/[ws]/sessions/[key]/epochs': {
      POST: route(async (req, params) => {
        const device = deviceAuth(req);
        const policy = enter(device, idParam(params.ws, ID_RE));
        const key = idParam(params.key, SESSION_KEY_RE);
        const body = await readJson(req, 4096);
        return openBindingEpoch(policy, device, key, body);
      })
    },
    'workspaces/[ws]/sessions/[key]/resume': {
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return setAgentStop(policy, idParam(params.key, SESSION_KEY_RE), false);
      })
    },
    'workspaces/[ws]/sessions/[key]/stop': {
      POST: route(async (req, params) => {
        const principal = await webWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return setAgentStop(policy, idParam(params.key, SESSION_KEY_RE), true);
      })
    },
    'workspaces/[ws]/sessions/[key]/stop-sharing': {
      POST: route(async (req, params) => {
        const principal = await eitherWrite(req);
        const policy = enter(principal, idParam(params.ws, ID_RE));
        return stopSharing(policy, principal, idParam(params.key, SESSION_KEY_RE));
      })
    },
    'workspaces/[ws]/sessions/[key]/usage': {
      POST: route(async (req, params) => {
        const device = deviceAuth(req);
        const policy = enter(device, idParam(params.ws, ID_RE));
        const key = idParam(params.key, SESSION_KEY_RE);
        const body = await readJson(req, 256 * 1024);
        return ingestUsage(policy, device, key, body);
      })
    }
  };
}

module.exports = { create_sessions_directives_routes };
