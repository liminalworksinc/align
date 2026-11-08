'use strict';

function create_v2(resources) {
  const { connection, config, hostAllowed, HttpError, clientNet, getAuth,
    isRecentSignIn, reauthMessage, publicOrigin, deviceFromAccessToken,
    userById, V2Error, badRequest, ready, console } = resources;

  function route(fn) {
    return async function (req, ctx) {
      await connection();
      try {
        await ready();
        const params = await ctx.params;
        const result = await fn(req, params);
        return result instanceof Response ? result : Response.json(result);
      } catch (error) {
        if (error instanceof V2Error) {
          const headers = {};
          if (error.status === 429 && typeof error.extra?.retry_after === 'number') {
            headers['retry-after'] = String(error.extra.retry_after);
          }
          return Response.json({ ...error.extra, error: error.code, message: error.message }, { status: error.status, headers });
        }
        if (error instanceof HttpError) {
          return Response.json({ error: 'bad_request', message: error.message }, { status: error.status });
        }
        if (config().hosted) console.error('Server error:', error?.name ?? 'unknown');
        else console.error(error);
        return Response.json({ error: 'server_error', message: 'Server error' }, { status: 500 });
      }
    };
  }

  function noContent() { return new Response(null, { status: 204 }); }

  function rejectBrowser(req) {
    if (req.headers.get('origin') !== null) throw new V2Error(403, 'browser_not_allowed', 'Device routes do not accept browser requests');
    if (req.headers.get('cookie') !== null) throw new V2Error(403, 'cookies_not_allowed', 'Device routes do not accept cookies');
  }

  function deviceAuth(req) {
    rejectBrowser(req);
    const match = /^Bearer\s+(\S+)$/i.exec((req.headers.get('authorization') || '').trim());
    const principal = match && match[1] ? deviceFromAccessToken(match[1]) : null;
    if (!principal) throw new V2Error(401, 'invalid_token', 'Sign in again with align login');
    return principal;
  }

  async function webAuth(req) {
    if (req.headers.get('authorization') !== null) throw new V2Error(403, 'bearer_not_allowed', 'Web routes do not accept device tokens');
    const session = await getAuth().api.getSession({ headers: req.headers });
    if (!session?.user) throw new V2Error(401, 'unauthorized', 'Sign in first');
    const user = await userById(session.user.id);
    if (!user) throw new V2Error(401, 'unauthorized', 'Sign in first');
    return { kind: 'web', user: { id: user.id, name: user.name, email: user.email },
      emailVerified: user.emailVerified, signedInAt: new Date(session.session.createdAt) };
  }

  function requireRecentSignIn(p, what) {
    if (!isRecentSignIn(p.signedInAt)) {
      throw new V2Error(403, 'reauth_required', what ? reauthMessage(what) : 'Sign in again to approve. Approving needs a sign-in from the last 15 minutes.');
    }
  }

  async function eitherAuth(req) {
    return req.headers.get('authorization') !== null ? deviceAuth(req) : webAuth(req);
  }

  function requireSameSite(req) {
    const refuse = () => { throw new V2Error(403, 'cross_site', 'This request came from another site'); };
    if (config().hosted) {
      const origin = (req.headers.get('origin') || '').toLowerCase();
      const host = (req.headers.get('host') || '').toLowerCase();
      if (!origin || !host || !hostAllowed(host) || origin !== `https://${host}`) refuse();
    } else {
      const origin = req.headers.get('origin');
      if (origin !== null) {
        let host;
        try { host = new URL(origin).host; }
        catch { refuse(); }
        if (host !== req.headers.get('host')) refuse();
      }
    }
    const site = req.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') refuse();
  }

  async function webWrite(req) { requireSameSite(req); return webAuth(req); }
  async function eitherWrite(req) {
    if (req.headers.get('authorization') === null) requireSameSite(req);
    return eitherAuth(req);
  }

  function idParam(v, re) {
    if (!v || !re.test(v)) throw new V2Error(404, 'not_found', 'Not found');
    return v;
  }

  async function readJson(req, max = 64 * 1024) {
    if (Number(req.headers.get('content-length') || 0) > max) throw new V2Error(413, 'too_large', 'This request is too large');
    const chunks = [];
    let size = 0;
    if (req.body) {
      const reader = req.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
          await reader.cancel();
          throw new V2Error(413, 'too_large', 'This request is too large');
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return {};
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw new V2Error(415, 'unsupported_media_type', 'Send this as application/json');
    let body;
    try { body = JSON.parse(text); }
    catch { throw badRequest('Send valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Send a JSON object');
    function visit(value) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw badRequest(`"${key}" is not allowed as a field name`);
          visit(value[key]);
        }
      }
    }
    visit(body);
    return body;
  }

  function originOf(req) { return publicOrigin() || `http://${req.headers.get('host') || '127.0.0.1'}`; }
  function clientKey(req) {
    if (!config().hosted) return 'local';
    return `ip:${clientNet(req.headers.get('fly-client-ip') ?? 'unknown')}`;
  }

  return { route, noContent, rejectBrowser, deviceAuth, webAuth, isRecentSignIn,
    requireRecentSignIn, eitherAuth, requireSameSite, webWrite, eitherWrite,
    idParam, readJson, originOf, clientKey };
}

module.exports = { create_v2 };
