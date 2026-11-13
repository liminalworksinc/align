'use strict';

function create_workspace_admin_routes(resources) {
  const { Response, URL, policy } = resources;
  const { route, webAuth, webWrite, idParam, readJson, noContent, requireRecentSignIn } = resources.http;
  const { ID_RE, oneLine, optStr, oneOf, optOneOf, str } = resources.validate;
  const { createSampleWorkspace } = resources.sample;
  const {
    workspacesFor, deletedWorkspacesFor, createWorkspace, enter, workspaceDetail,
    updateWorkspace, deleteWorkspace, deletedWorkspaceOwnedBy, restoreWorkspace,
    auditTrail, listInvites, createInvite, deleteInvite, setMemberRole,
    removeMember, createTeam, setTeamMember, removeTeamMember
  } = resources.workspaces;
  return {
    'workspaces': {
      GET: route(async (req) => {
        const web = await webAuth(req);
        return Response.json({ workspaces: workspacesFor(web), deleted: deletedWorkspacesFor(web.user.id) });
      }),
      POST: route(async (req) => {
        const web = await webWrite(req);
        const body = await readJson(req, 4096);
        return Response.json(await createWorkspace(req, web, oneLine(body, 'name', 100), optStr(body, 'creation_code', 100)), { status: 201 });
      })
    },
    'workspaces/sample': {
      POST: route(async (req) => {
        const web = await webWrite(req);
        const body = await readJson(req, 4096);
        return Response.json(await createSampleWorkspace(req, web, optStr(body, 'creation_code', 100)), { status: 201 });
      })
    },
    'workspaces/[ws]': {
      GET: route(async (req, params) => {
        const web = await webAuth(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        return Response.json(workspaceDetail(principal));
      }),
      PATCH: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        const body = await readJson(req, 4096);
        return Response.json(await updateWorkspace(principal, body));
      }),
      DELETE: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        if (principal.wsRole === 'owner') requireRecentSignIn(web, 'delete this workspace');
        await deleteWorkspace(principal);
        return noContent();
      })
    },
    'workspaces/[ws]/restore': {
      POST: route(async (req, params) => {
        const web = await webWrite(req);
        const ws = idParam(params.ws, ID_RE);
        deletedWorkspaceOwnedBy(web.user.id, ws);
        requireRecentSignIn(web, 'restore a workspace');
        return Response.json(await restoreWorkspace(web.user.id, ws));
      })
    },
    'workspaces/[ws]/audit': {
      GET: route(async (req, params) => {
        const web = await webAuth(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        return Response.json({ audit: auditTrail(principal) });
      })
    },
    'workspaces/[ws]/invites': {
      GET: route(async (req, params) => {
        const web = await webAuth(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        return Response.json({ invites: listInvites(principal) });
      }),
      POST: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        const body = await readJson(req, 4096);
        const team = { id: optStr(body, 'team_id', 64), role: optOneOf(body, 'team_role', policy.POD_ROLES) };
        const role = oneOf(body, 'role', policy.WS_ROLES);
        if (role === 'owner' && principal.wsRole === 'owner') requireRecentSignIn(web, 'invite an owner');
        return Response.json(await createInvite(principal, str(body, 'email', 254), role, team), { status: 201 });
      })
    },
    'workspaces/[ws]/invites/[id]': {
      DELETE: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        await deleteInvite(principal, idParam(params.id, ID_RE));
        return noContent();
      })
    },
    'workspaces/[ws]/members/[user]': {
      POST: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        if (principal.wsRole === 'owner') requireRecentSignIn(web, 'change a role');
        const body = await readJson(req, 4096);
        return Response.json(await setMemberRole(principal, idParam(params.user, ID_RE), oneOf(body, 'role', policy.WS_ROLES)));
      }),
      DELETE: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        const user = idParam(params.user, ID_RE);
        if (user !== web.user.id && principal.wsRole === 'owner') requireRecentSignIn(web, 'remove a member');
        const deleteSessions = new URL(req.url).searchParams.get('delete_sessions') === '1';
        await removeMember(principal, user, { deleteSessions });
        return noContent();
      })
    },
    'workspaces/[ws]/teams': {
      POST: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        const body = await readJson(req, 4096);
        return Response.json(await createTeam(principal, oneLine(body, 'name', 100)), { status: 201 });
      })
    },
    'workspaces/[ws]/teams/[team]/members': {
      POST: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        const body = await readJson(req, 4096);
        return Response.json(await setTeamMember(principal, idParam(params.team ?? params.pod, ID_RE), str(body, 'user_id', 64), oneOf(body, 'role', policy.POD_ROLES)));
      })
    },
    'workspaces/[ws]/teams/[team]/members/[user]': {
      DELETE: route(async (req, params) => {
        const web = await webWrite(req);
        const principal = enter(web, idParam(params.ws, ID_RE));
        await removeTeamMember(principal, idParam(params.team ?? params.pod, ID_RE), idParam(params.user, ID_RE));
        return noContent();
      })
    }
  };
}

module.exports = { create_workspace_admin_routes };
