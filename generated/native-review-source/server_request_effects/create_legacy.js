'use strict';

function create_legacy(resources) {
  const { config, hostAllowed, HttpError, console } = resources;

  async function handle(fn) {
    try {
      const result = await fn();
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      if (error instanceof HttpError) {
        const body = { error: error.message };
        if (error.code) body.code = error.code;
        return Response.json(body, { status: error.status });
      }
      if (config().hosted) console.error('Server error:', error?.name ?? 'unknown');
      else console.error(error);
      return Response.json({ error: 'Server error' }, { status: 500 });
    }
  }

  function requireJson(req) {
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'Send this as application/json');
    if (config().hosted) {
      if (!hostAllowed(req.headers.get('host'))) {
        throw new HttpError(403, 'This request came from another site');
      }
    } else {
      const host = req.headers.get('host') || '';
      const name = (host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]).toLowerCase();
      if (!['localhost', '127.0.0.1', '[::1]'].includes(name)) {
        throw new HttpError(403, 'This request must come from this machine');
      }
    }
    const origin = req.headers.get('origin');
    if (config().hosted) {
      const currentOrigin = (req.headers.get('origin') || '').toLowerCase();
      const host = (req.headers.get('host') || '').toLowerCase();
      if (!currentOrigin || !host || currentOrigin !== `https://${host}`) {
        throw new HttpError(403, 'This request came from another site');
      }
    } else if (origin) {
      let host;
      try { host = new URL(origin).host; }
      catch { throw new HttpError(403, 'This request came from another site'); }
      if (!host || host !== req.headers.get('host')) {
        throw new HttpError(403, 'This request came from another site');
      }
    }
  }

  async function cappedJson(req, max = 64 * 1024, tooLarge = 'This request is too large') {
    if (Number(req.headers.get('content-length') || 0) > max) throw new HttpError(413, tooLarge);
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
          throw new HttpError(413, tooLarge);
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return {};
    let body;
    try { body = JSON.parse(text); }
    catch { throw new HttpError(400, 'Send valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a JSON object');
    function visit(value, path) {
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`));
      else if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new HttpError(400, `“${key}” is not allowed as a field name (at ${path})`);
          }
          visit(value[key], `${path}.${key}`);
        }
      }
    }
    visit(body, 'body');
    return body;
  }

  return { handle, requireJson, cappedJson };
}

module.exports = { create_legacy };
