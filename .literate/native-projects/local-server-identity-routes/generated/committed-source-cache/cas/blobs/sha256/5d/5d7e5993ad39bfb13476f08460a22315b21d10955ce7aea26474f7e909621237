'use strict';

function create_identity_routes(resources) {
  const { Response, URL } = resources;
  const { config } = resources.config;
  const { createAccessRequest } = resources.access;
  const { deleteAccount, deletePasskey, dismissPasskeyPrompt, listPasskeys,
    passkeyPromptDue, renamePasskey, signOutEverywhere } = resources.account;
  const { COOKIE_PREFIX, getAuth } = resources.auth;
  const { authorize, decideRequest, deviceOwnedBy, grantWorkspace, listDevices,
    lookupRequest, refresh, revokeDevice, token, userCodeOf, workspaceIdsOf } = resources.devices;
  const { badRequest, notFound } = resources.errors;
  const { clientKey, deviceAuth, eitherAuth, idParam, noContent, originOf, readJson,
    rejectBrowser, requireRecentSignIn, requireSameSite, route, webAuth, webWrite } = resources.http;
  const { ready } = resources.init;
  const { ID_RE, b64url, oneLine, str, strList } = resources.validate;
  const { acceptInvite, otherWorkspacesFor, previewInvite, workspacesFor } = resources.workspaces;
  const { connection } = resources.nextServer;
  const passkeyId = /^[a-z2-7]{32}$/;
  const authHandler = async (req) => {
    await connection();
    if (req.headers.get('authorization') !== null) {
      return Response.json({ error: 'bearer_not_allowed', message: 'Web routes do not accept device tokens' }, { status: 403 });
    }
    await ready();
    return getAuth().handler(req);
  };
  return {
    'access-requests': { POST: route(async (req) => {
      requireSameSite(req);
      const body = await readJson(req, 8192);
      return Response.json(await createAccessRequest(req, clientKey(req), body), { status: 201 });
    }) },
    'account/passkey-prompt': { DELETE: route(async (req) => {
      const person = await webWrite(req);
      await dismissPasskeyPrompt(person.user.id);
      return noContent();
    }) },
    'account/passkeys/[id]': {
      DELETE: route(async (req, params) => {
        const person = await webWrite(req);
        const id = idParam(params.id, passkeyId);
        requireRecentSignIn(person, 'delete a passkey');
        await deletePasskey(person.user.id, id);
        return noContent();
      }),
      PATCH: route(async (req, params) => {
        const person = await webWrite(req);
        const id = idParam(params.id, passkeyId);
        const body = await readJson(req, 4096);
        return renamePasskey(person.user.id, id, str(body, 'name', 100));
      })
    },
    'account/passkeys': { GET: route(async (req) => {
      const person = await webAuth(req);
      return { passkeys: listPasskeys(person.user.id), prompt: passkeyPromptDue(person.user.id) };
    }) },
    'account/sign-out-everywhere': { POST: route(async (req) => {
      const person = await webWrite(req);
      const body = await readJson(req, 1024);
      const flags = {};
      for (const field of ['devices', 'apps']) {
        const value = body[field];
        if (value !== undefined && typeof value !== 'boolean') throw badRequest(field + ' must be true or false');
        flags[field] = value === undefined ? false : value;
      }
      requireRecentSignIn(person, 'sign out everywhere');
      const result = await signOutEverywhere(person.user.id, flags);
      const hosted = config().hosted;
      const cookie = (hosted ? '__Secure-' : '') + COOKIE_PREFIX + '.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' + (hosted ? '; Secure' : '');
      return Response.json(result, { headers: { 'set-cookie': cookie } });
    }) },
    'auth/[...all]': { GET: authHandler, POST: authHandler },
    'device/approve': { POST: route(async (req) => {
      const person = await webWrite(req);
      requireRecentSignIn(person);
      const body = await readJson(req, 8192);
      return decideRequest(person.user.id, userCodeOf(body), 'approve', workspaceIdsOf(body));
    }) },
    'device/authorize': { POST: route(async (req) => {
      rejectBrowser(req);
      const body = await readJson(req, 4096);
      const fields = { device_name: oneLine(body, 'device_name', 100), public_key: b64url(body, 'public_key', 43, 43) };
      return authorize(fields, clientKey(req), originOf(req));
    }) },
    'device/deny': { POST: route(async (req) => {
      const person = await webWrite(req);
      const body = await readJson(req, 4096);
      return decideRequest(person.user.id, userCodeOf(body), 'deny', []);
    }) },
    'device/refresh': { POST: route(async (req) => {
      rejectBrowser(req);
      const body = await readJson(req, 4096);
      return refresh({ device_id: str(body, 'device_id', 64), refresh_token: str(body, 'refresh_token', 200), ts: str(body, 'ts', 40), sig: b64url(body, 'sig', 86, 88) });
    }) },
    'device/requests/[code]': { GET: route(async (req, params) => {
      const person = await webAuth(req);
      return lookupRequest(person.user.id, params.code);
    }) },
    'device/token': { POST: route(async (req) => {
      rejectBrowser(req);
      const body = await readJson(req, 4096);
      if (body.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') throw badRequest('unsupported grant_type', 'unsupported_grant_type');
      let replacement = null;
      if (body.replaces !== undefined && body.replaces !== null) {
        if (typeof body.replaces !== 'string' || !ID_RE.test(body.replaces)) throw badRequest('replaces must be a device id');
        replacement = body.replaces;
      }
      return token(b64url(body, 'device_code', 43, 128), replacement);
    }) },
    'devices/[id]': { DELETE: route(async (req, params) => {
      const person = await webWrite(req);
      const id = idParam(params.id, ID_RE);
      if (!deviceOwnedBy(id, person.user.id)) throw notFound();
      await revokeDevice(id, 'revoked_on_web', person.user.id);
      return noContent();
    }) },
    'devices/[id]/workspaces': { POST: route(async (req, params) => {
      const person = await webWrite(req);
      const id = idParam(params.id, ID_RE);
      const body = await readJson(req, 1024);
      const workspaceId = str(body, 'workspace_id', 80);
      if (!ID_RE.test(workspaceId)) throw badRequest('workspace_id is not a workspace id');
      requireRecentSignIn(person, 'give a device this workspace');
      return grantWorkspace(person.user.id, id, workspaceId);
    }) },
    'devices': { GET: route(async (req) => {
      const principal = await eitherAuth(req);
      const devices = listDevices(principal.user.id);
      return { devices: principal.kind === 'device' ? devices.map(row => ({ ...row, current: row.id === principal.deviceId })) : devices };
    }) },
    'devices/self': { DELETE: route(async (req) => {
      const device = deviceAuth(req);
      const value = new URL(req.url).searchParams.get('replaced_by');
      const replacement = value && /^dv_[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
      await revokeDevice(device.deviceId, 'logout', device.user.id, replacement);
      return noContent();
    }) },
    'invites/[token]/accept': { POST: route(async (req, params) => {
      const person = await webWrite(req);
      const body = await readJson(req, 4096);
      if (Array.isArray(body.device_ids) && body.device_ids.some(id => typeof id === 'string' && id.trim() === '')) throw badRequest('device_ids must be device ids');
      const deviceIds = strList(body, 'device_ids', { max: 20, itemMax: 64 });
      if (!deviceIds.every(id => ID_RE.test(id))) throw badRequest('device_ids must be device ids');
      return acceptInvite(params.token, person.user, person.emailVerified, deviceIds, () => requireRecentSignIn(person, 'give a device this workspace'));
    }) },
    'invites/[token]': { GET: route(async (req, params) => {
      const person = await webAuth(req);
      return previewInvite(params.token, person.user);
    }) },
    'me': {
      DELETE: route(async (req) => {
        const person = await webWrite(req);
        requireRecentSignIn(person, 'delete your account');
        const body = await readJson(req, 4096);
        await deleteAccount(person, str(body, 'email', 320));
        return noContent();
      }),
      GET: route(async (req) => {
        const principal = await eitherAuth(req);
        return {
          user: principal.user,
          device: principal.kind === 'device' ? { id: principal.deviceId, name: principal.deviceName } : null,
          workspaces: workspacesFor(principal),
          ...(principal.kind === 'device' ? { other_workspaces: otherWorkspacesFor(principal) } : {})
        };
      })
    }
  };
}

module.exports = { create_identity_routes };
