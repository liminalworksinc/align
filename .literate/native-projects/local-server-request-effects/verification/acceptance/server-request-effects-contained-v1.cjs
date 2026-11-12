'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"354110bc87ae24f52b2b3f60774da799a9375430f531cf5308a2a949d9b08afb","package":"server_request_effects","package_files":["create_legacy.js","create_v2.js","package.json"],"maximum_cases":46,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Private acceptance assertions, not original implementation or generation input.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),crypto=require('node:crypto');
const CAPABILITIES=['server-request-effects.create-legacy','server-request-effects.create-v2'];
const SYMBOLS=['create_legacy','create_v2'];
const RESOURCE_KEYS=[['config','hostAllowed','HttpError','console'],
 ['connection','config','hostAllowed','HttpError','clientNet','getAuth','isRecentSignIn',
  'reauthMessage','publicOrigin','deviceFromAccessToken','userById','V2Error','badRequest','ready','console']];
const PUBLIC_KEYS=[['handle','requireJson','cappedJson'],
 ['route','noContent','rejectBrowser','deviceAuth','webAuth','isRecentSignIn','requireRecentSignIn',
  'eitherAuth','requireSameSite','webWrite','eitherWrite','idParam','readJson','originOf','clientKey']];
function candidateEntry(root,surface,index){
 const binding=surface?.capabilities.find(item=>item.capability===CAPABILITIES[index]);
 if(surface)assert(binding&&binding.symbols.includes(SYMBOLS[index]),'Missing advertised request capability');
 const module=binding?.module||'server_request_effects/'+SYMBOLS[index];
 assert(typeof module==='string'&&!module.startsWith('/')&&!module.split('/').includes('..'));
 const hits=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
  const file=path.join(dir,entry.name);assert(!entry.isSymbolicLink(),'Candidate symlink');
  if(entry.isDirectory())walk(file);else if(['.js','.mjs','.cjs'].some(ext=>{
   const relative=path.relative(root,file).split(path.sep).join('/');
   return relative===module+ext||relative.endsWith('/'+module+ext);
  }))hits.push(file);
 }}
 walk(root);assert.equal(hits.length,1,'Expected one advertised module per capability');return hits[0];
}
function candidateLoader(root, entry, context, refused, symbol) {
  const common = new Map(), modules = new Map();
  function inside(file) {
    const relative = path.relative(root, file);
    assert(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Candidate import escapes root');
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      assert(!fs.lstatSync(current).isSymbolicLink(), 'Candidate import symlink');
    }
    return file;
  }
  function resolve(specifier, parent) {
    if (!(specifier.startsWith('./') || specifier.startsWith('../'))) return refused('import ' + specifier);
    const stem = path.resolve(path.dirname(parent), specifier);
    const found = [stem, stem + '.js', stem + '.mjs', stem + '.cjs', path.join(stem, 'index.js')]
      .find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    assert(found, 'Missing candidate module: ' + specifier); return inside(found);
  }
  function esm(file, code) {
    if (file.endsWith('.mjs')) return true;
    if (file.endsWith('.cjs')) return false;
    for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) {
        const type = JSON.parse(fs.readFileSync(manifest, 'utf8')).type;
        if (type === 'module') return true;
        if (type === 'commonjs') return false;
      }
      if (directory === root) break;
    }
    return /^\s*(?:import|export)\b/m.test(code);
  }
  function loadCommon(file) {
    if (common.has(file)) return common.get(file).exports;
    const code = fs.readFileSync(inside(file), 'utf8');
    assert(!esm(file, code), 'Synchronous require of ESM is outside this portable verifier');
    const module = {exports: {}}; common.set(file, module);
    const wrapper = new vm.Script('(function(module,exports,require,__filename,__dirname){\n' + code + '\n})', {filename: file, importModuleDynamically: () => refused('dynamic import')}).runInContext(context);
    wrapper(module, module.exports, name => loadCommon(resolve(name, file)), file, path.dirname(file));
    return module.exports;
  }
  function asModule(file) {
    if (modules.has(file)) return modules.get(file);
    const code = fs.readFileSync(inside(file), 'utf8');
    let module;
    if (esm(file, code)) module = new vm.SourceTextModule(code, {
      context, identifier: file,
      importModuleDynamically: () => refused('dynamic import'),
    });
    else {
      const values = loadCommon(file), names = [...new Set([...Object.keys(values), 'default'])];
      module = new vm.SyntheticModule(names, function () {
        for (const key of names) this.setExport(key, key === 'default' ? values : values[key]);
      }, {context, identifier: file});
    }
    modules.set(file, module); return module;
  }
  return async () => {
    const module = asModule(entry);
    if (module.status === 'unlinked') await module.link((name, parent) => asModule(resolve(name, parent.identifier)));
    if (module.status === 'linked') await module.evaluate();
    const values = module.namespace;
    const factory = values[symbol] ?? values.default?.[symbol] ?? values.default;
    assert.equal(typeof factory, 'function', 'Missing readiness factory');
    assert.equal(factory.name, symbol); assert.equal(factory.length, 1); assert.equal(factory.constructor.name, 'Function');
    return factory;
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
const request = (headers = {}) => new Request('http://fixture.invalid/path', { method: 'POST', headers });
const bodyRequest = (body, headers = {}) => new Request('http://fixture.invalid/path', { method: 'POST', headers, body });
const token = Object.freeze({ fixture: 'exact rejection' });

function resources(options = {}) {
  class HttpError extends Error {
    constructor(status, message, code) { super(message); this.status = status; this.code = code; }
  }
  class V2Error extends Error {
    constructor(status, code, message = code, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
  }
  const env = {
    trace: [], logs: [], hosted: false, allowed: true, recent: true, public: null,
    session: { user: { id: 'u1' }, session: { createdAt: '2026-01-02T03:04:05Z' } },
    user: { id: 'u1', name: 'User', email: 'fixture@example.invalid', emailVerified: true, privateField: 'omitted' },
    device: { kind: 'device', id: 'd1' }, ...options,
  };
  const ports = {
    config() { env.trace.push('config'); return { hosted: env.hosted }; },
    hostAllowed(host) { env.trace.push(['hostAllowed', host]); if ('hostError' in env) throw env.hostError; return env.allowed; },
    HttpError, V2Error,
    badRequest(message, code = 'bad_request') { return new V2Error(400, code, message); },
    clientNet(value) { env.trace.push(['clientNet', value]); return `net(${value})`; },
    getAuth() {
      env.trace.push('getAuth');
      if ('authError' in env) throw env.authError;
      const api = { async getSession(input) {
        assert.equal(this, api, 'Session method receiver');
        env.trace.push(['getSession', input.headers]);
        if ('sessionError' in env) throw env.sessionError;
        return env.session;
      } };
      return { api };
    },
    isRecentSignIn(value) { env.trace.push(['isRecentSignIn', value]); return env.recent; },
    reauthMessage(what) { env.trace.push(['reauthMessage', what]); return `Recent sign-in for ${what}`; },
    publicOrigin() { env.trace.push('publicOrigin'); return env.public; },
    deviceFromAccessToken(value) { env.trace.push(['deviceFromAccessToken', value]); return env.device; },
    userById(value) { env.trace.push(['userById', value]); if ('userError' in env) throw env.userError; return env.user; },
    async ready() { env.trace.push('ready'); if ('readyError' in env) throw env.readyError; },
    async connection() { env.trace.push('connection'); if ('connectionError' in env) throw env.connectionError; },
    console: null,
  };
  const logger = { error(...values) { assert.equal(this, logger, 'Console method receiver'); env.logs.push(values); } };
  ports.console = logger;
  for (const name of ['config', 'hostAllowed', 'badRequest', 'clientNet', 'getAuth', 'isRecentSignIn', 'reauthMessage', 'publicOrigin', 'deviceFromAccessToken', 'userById', 'ready', 'connection']) {
    const original = ports[name];
    const checked = function (...args) { assert.equal(this, undefined, `${name} provider receiver`); return Reflect.apply(original, undefined, args); };
    Object.defineProperty(checked, 'name', { value: original.name });
    Object.defineProperty(checked, 'length', { value: original.length });
    ports[name] = checked;
  }
  return { env, ports };
}

function failSync(fn, expected) {
  let caught = false;
  try { fn(); } catch (error) { caught = true; if (arguments.length > 1) assert.equal(error, expected); return error; }
  assert.ok(caught, 'Expected synchronous failure');
}
async function failAsync(fn, expected) {
  let caught = false;
  try { await fn(); } catch (error) { caught = true; if (arguments.length > 1) assert.equal(error, expected); return error; }
  assert.ok(caught, 'Expected asynchronous failure');
}
function errorShape(error, Constructor, status, message, code) {
  assert.ok(error instanceof Constructor);
  assert.equal(error.status, status); assert.equal(error.message, message);
  if (code !== undefined) assert.equal(error.code, code);
  return { status, message, ...(code === undefined ? {} : { code }) };
}
async function jsonResponse(response, status, body, retry = null) {
  assert.ok(response instanceof Response); assert.equal(response.status, status);
  assert.deepEqual(await response.json(), body); assert.equal(response.headers.get('retry-after'), retry);
  return { status, body, retry };
}
function controlledBody(chunks, { readError, cancelError, trace = [] } = {}) {
  let index = 0;
  return { getReader() { trace.push('getReader'); return {
    async read() {
      trace.push(`read:${index}`);
      if (readError !== undefined) throw readError;
      return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true };
    },
    async cancel() { trace.push('cancel:start'); await Promise.resolve(); trace.push('cancel:end'); if (cancelError !== undefined) throw cancelError; },
  }; } };
}
const cases = [];
const add = (id, run) => cases.push({ id, run });

add('public-surface', async load => {
  const { legacy, v2, ports } = await load();
  const expected = { legacy: { handle: 1, requireJson: 1, cappedJson: 1 }, v2: { route: 1, noContent: 0, rejectBrowser: 1, deviceAuth: 1, webAuth: 1, isRecentSignIn: 1, requireRecentSignIn: 2, eitherAuth: 1, requireSameSite: 1, webWrite: 1, eitherWrite: 1, idParam: 2, readJson: 1, originOf: 1, clientKey: 1 } };
  for (const [kind, ns] of Object.entries({ legacy, v2 })) {
    assert.deepEqual(Object.keys(ns).sort(), Object.keys(expected[kind]).sort());
    for (const [name, arity] of Object.entries(expected[kind])) { assert.equal(typeof ns[name], 'function'); assert.equal(ns[name].length, arity); assert.equal(ns[name].name, name); }
  }
  assert.equal(v2.isRecentSignIn, ports.isRecentSignIn);
  return expected;
});
add('legacy-handle-values-and-response', async load => {
  const { legacy, env } = await load();
  const rows = [await jsonResponse(await legacy.handle(async () => ({ ok: true })), 200, { ok: true })];
  const response = new Response('owned', { status: 202 }); assert.equal(await legacy.handle(async () => response), response);
  assert.deepEqual(env.trace, []); assert.deepEqual(env.logs, []); return rows;
});
add('legacy-http-error-code', async load => {
  const { legacy, ports, env } = await load(); const rows = [];
  for (const code of [undefined, '', 'refused']) {
    const e = new ports.HttpError(403, 'owned message', code);
    rows.push(await jsonResponse(await legacy.handle(async () => { throw e; }), 403, code ? { error: 'owned message', code } : { error: 'owned message' }));
  }
  assert.deepEqual(env.trace, []); assert.deepEqual(env.logs, []); return rows;
});
add('legacy-hosted-error-redaction', async load => {
  const { legacy, env } = await load({ hosted: true }); const rows = [];
  for (const e of [{ name: 'OwnedError', message: 'private body', status: 418 }, null, 0]) rows.push(await jsonResponse(await legacy.handle(async () => { throw e; }), 500, { error: 'Server error' }));
  assert.deepEqual(env.logs, [['Server error:', 'OwnedError'], ['Server error:', 'unknown'], ['Server error:', 'unknown']]); return { rows, logs: env.logs };
});
add('legacy-local-error-identity', async load => {
  const { legacy, env } = await load(); await legacy.handle(async () => { throw token; }); assert.equal(env.logs[0][0], token); return { exactLogReference: true };
});
add('legacy-json-content-type', async load => {
  const { legacy, ports, env } = await load(); const rows = [];
  for (const type of ['application/json', ' Application/JSON ; charset=utf-8']) legacy.requireJson(request({ 'content-type': type, host: 'LOCALHOST:1234' }));
  for (const type of ['', 'text/plain', 'application/problem+json']) rows.push(errorShape(failSync(() => legacy.requireJson(request({ 'content-type': type }))), ports.HttpError, 415, 'Send this as application/json'));
  assert.equal(env.trace.length, 4); return rows;
});
add('legacy-loopback-hosts', async load => {
  const { legacy, ports } = await load(); const rows = [];
  for (const host of ['localhost', 'LOCALHOST:91', '127.0.0.1:7', '[::1]:8080']) legacy.requireJson(request({ host, 'content-type': 'application/json' }));
  for (const host of ['', '0.0.0.0', 'fixture.invalid', 'localhost.invalid', '[::2]:9']) rows.push(errorShape(failSync(() => legacy.requireJson(request({ host, 'content-type': 'application/json' }))), ports.HttpError, 403, 'This request must come from this machine'));
  return { accepted: 4, rejected: rows };
});
add('legacy-local-origin', async load => {
  const { legacy, ports } = await load(); const rows = [];
  for (const origin of [undefined, '', 'http://localhost:91', 'https://localhost:91']) legacy.requireJson(request({ host: 'localhost:91', 'content-type': 'application/json', ...(origin === undefined ? {} : { origin }) }));
  for (const origin of ['null', 'garbage', 'http://localhost:92', 'http://fixture.invalid']) rows.push(errorShape(failSync(() => legacy.requireJson(request({ host: 'localhost:91', 'content-type': 'application/json', origin }))), ports.HttpError, 403, 'This request came from another site'));
  return { accepted: 4, rejected: rows };
});
add('legacy-hosted-origin', async load => {
  const { legacy, ports, env } = await load({ hosted: true }); const rows = [];
  legacy.requireJson(request({ host: 'APP.INVALID', origin: 'HTTPS://APP.INVALID', 'content-type': 'application/json' }));
  assert.deepEqual(env.trace, ['config', ['hostAllowed', 'APP.INVALID'], 'config']);
  for (const origin of [undefined, '', 'http://app.invalid', 'https://app.invalid:443', 'https://other.invalid']) rows.push(errorShape(failSync(() => legacy.requireJson(request({ host: 'app.invalid', 'content-type': 'application/json', ...(origin === undefined ? {} : { origin }) }))), ports.HttpError, 403, 'This request came from another site'));
  env.allowed = false; rows.push(errorShape(failSync(() => legacy.requireJson(request({ host: 'app.invalid', origin: 'https://app.invalid', 'content-type': 'application/json' }))), ports.HttpError, 403, 'This request came from another site'));
  return { accepted: 1, rejected: rows };
});
add('legacy-empty-and-utf8', async load => {
  const { legacy } = await load(); assert.deepEqual(plain(await legacy.cappedJson(request())), {});
  assert.deepEqual(plain(await legacy.cappedJson(bodyRequest(' \n\t'))), {});
  const bytes = Buffer.from('{"word":"é"}'); const trace = [];
  const got = await legacy.cappedJson({ headers: new Headers(), body: controlledBody([bytes.subarray(0, 10), bytes.subarray(10)], { trace }) }, bytes.length);
  assert.deepEqual(plain(got), { word: 'é' }); return { bytes: bytes.length, got: plain(got), trace };
});
add('legacy-declared-body-limit', async load => {
  const { legacy, ports } = await load(); const trace = [];
  const error = await failAsync(() => legacy.cappedJson({ headers: new Headers({ 'content-length': '5' }), body: controlledBody([Buffer.from('{}')], { trace }) }, 4, 'Own cap'));
  assert.deepEqual(trace, []); return errorShape(error, ports.HttpError, 413, 'Own cap');
});
add('legacy-stream-limit-cancel', async load => {
  const { legacy, ports } = await load(); const trace = [];
  const error = await failAsync(() => legacy.cappedJson({ headers: new Headers(), body: controlledBody([Buffer.from('{"x":1}')], { trace }) }, 6));
  assert.deepEqual(trace, ['getReader', 'read:0', 'cancel:start', 'cancel:end']); return { error: errorShape(error, ports.HttpError, 413, 'This request is too large'), trace };
});
add('legacy-invalid-json-objects', async load => {
  const { legacy, ports } = await load(); const rows = [];
  for (const text of ['{', 'null', '[]', '42', 'true', '"text"']) rows.push(errorShape(await failAsync(() => legacy.cappedJson(bodyRequest(text))), ports.HttpError, 400, text === '{' ? 'Send valid JSON' : 'Send a JSON object'));
  return rows;
});
add('legacy-reserved-paths', async load => {
  const { legacy, ports } = await load(); const rows = [];
  for (const [text, at, key] of [['{"__proto__":1}', 'body', '__proto__'], ['{"a":[{"constructor":1}]}', 'body.a[0]', 'constructor'], ['{"a":{"prototype":1}}', 'body.a', 'prototype']]) rows.push(errorShape(await failAsync(() => legacy.cappedJson(bodyRequest(text))), ports.HttpError, 400, `“${key}” is not allowed as a field name (at ${at})`));
  return rows;
});
add('body-provider-failure-identity', async load => {
  const { legacy, v2 } = await load();
  for (const [fn, args] of [[legacy.cappedJson, []], [v2.readJson, []]]) {
    await failAsync(() => fn({ headers: new Headers(), body: controlledBody([], { readError: token }) }, ...args), token);
    await failAsync(() => fn({ headers: new Headers(), body: controlledBody([Buffer.from('long')], { cancelError: token }) }, 1), token);
  }
  return { exactReadRejections: 2, exactCancelRejections: 2 };
});
add('v2-route-effect-order', async load => {
  const { v2, env } = await load(); const req = request(); const params = { id: 'owned' };
  const wrapped = v2.route(async (r, p) => { assert.equal(r, req); assert.equal(p, params); env.trace.push('handler'); return { ok: true }; });
  const response = await wrapped(req, { params: { then(resolve) { env.trace.push('params'); resolve(params); } } });
  assert.deepEqual(env.trace, ['connection', 'ready', 'params', 'handler']); return { trace: env.trace, response: await jsonResponse(response, 200, { ok: true }) };
});
add('v2-route-response-identity', async load => {
  const { v2 } = await load(); const response = new Response('owned', { status: 202 });
  assert.equal(await v2.route(async () => response)(request(), { params: Promise.resolve({}) }), response); return { exactResponse: true };
});
add('v2-connection-outside-catch', async load => {
  const { v2, env } = await load({ connectionError: token });
  await failAsync(() => v2.route(async () => { assert.fail('No handler'); })(request(), { params: Promise.resolve({}) }), token);
  assert.deepEqual(env.trace, ['connection']); assert.deepEqual(env.logs, []); return { exactFailure: true, trace: env.trace };
});
add('v2-ready-before-params', async load => {
  const { v2, env } = await load({ readyError: token, hosted: true });
  const response = await v2.route(async () => { assert.fail('No handler'); })(request(), { params: { then() { assert.fail('No params read'); } } });
  assert.deepEqual(env.trace, ['connection', 'ready', 'config']); assert.deepEqual(env.logs, [['Server error:', 'unknown']]); return jsonResponse(response, 500, { error: 'server_error', message: 'Server error' });
});
add('v2-error-extra-and-retry', async load => {
  const { v2, ports } = await load(); const rows = [];
  for (const [status, wait] of [[429, 2], [429, 0], [429, -1], [429, '2'], [403, 2]]) {
    const error = new ports.V2Error(status, 'limit', 'Owned wait', { retry_after: wait, error: 'overridden', message: 'overridden', extra: 'kept' });
    rows.push(await jsonResponse(await v2.route(async () => { throw error; })(request(), { params: Promise.resolve({}) }), status, { retry_after: wait, error: 'limit', message: 'Owned wait', extra: 'kept' }, status === 429 && typeof wait === 'number' ? String(wait) : null));
  }
  return rows;
});
add('v2-http-error-mapping', async load => {
  const { v2, ports } = await load(); return jsonResponse(await v2.route(async () => { throw new ports.HttpError(409, 'Owned message', 'ignored'); })(request(), { params: Promise.resolve({}) }), 409, { error: 'bad_request', message: 'Owned message' });
});
add('v2-unknown-error-logging', async load => {
  const local = await load(); await local.v2.route(async () => { throw token; })(request(), { params: Promise.resolve({}) }); assert.equal(local.env.logs[0][0], token);
  const hosted = await load({ hosted: true }); const error = { name: 'OwnedError', message: 'private body', status: 401 };
  const response = await hosted.v2.route(async () => { throw error; })(request(), { params: Promise.resolve({}) }); assert.deepEqual(hosted.env.logs, [['Server error:', 'OwnedError']]); return { exactLocalLog: true, hosted: await jsonResponse(response, 500, { error: 'server_error', message: 'Server error' }), logs: hosted.env.logs };
});
add('no-content', async load => {
  const { v2 } = await load(); const response = v2.noContent(); assert.equal(response.status, 204); assert.equal(response.body, null); assert.equal(response.headers.get('content-type'), null); return { status: 204, nullBody: true };
});
add('device-browser-refusals', async load => {
  const { v2, ports, env } = await load(); const rows = [];
  for (const headers of [{ origin: '' }, { origin: 'https://fixture.invalid', cookie: 'x=1' }, { cookie: '' }]) rows.push(errorShape(failSync(() => v2.deviceAuth(request({ authorization: 'Bearer own', ...headers }))), ports.V2Error, 403, 'origin' in headers ? 'Device routes do not accept browser requests' : 'Device routes do not accept cookies', 'origin' in headers ? 'browser_not_allowed' : 'cookies_not_allowed'));
  assert.deepEqual(env.trace, []); v2.rejectBrowser(request()); return rows;
});
add('device-bearer-selection', async load => {
  const { v2, ports, env } = await load(); const rows = [];
  for (const value of ['Bearer owned', ' bearer\towned ', 'BEARER owned']) assert.equal(v2.deviceAuth(request({ authorization: value })), env.device);
  assert.deepEqual(env.trace, Array.from({ length: 3 }, () => ['deviceFromAccessToken', 'owned'])); env.trace.length = 0;
  for (const value of [undefined, '', 'Bearer', 'Basic owned', 'Bearer a b']) rows.push(errorShape(failSync(() => v2.deviceAuth(request(value === undefined ? {} : { authorization: value }))), ports.V2Error, 401, 'Sign in again with align login', 'invalid_token'));
  assert.deepEqual(env.trace, []); env.device = null; rows.push(errorShape(failSync(() => v2.deviceAuth(request({ authorization: 'Bearer unknown' }))), ports.V2Error, 401, 'Sign in again with align login', 'invalid_token')); return rows;
});
add('web-authorization-precedence', async load => {
  const { v2, ports, env } = await load(); const e = await failAsync(() => v2.webAuth(request({ authorization: '' })));
  assert.deepEqual(env.trace, []); return errorShape(e, ports.V2Error, 403, 'Web routes do not accept device tokens', 'bearer_not_allowed');
});
add('web-principal-and-provider-order', async load => {
  const { v2, env } = await load(); const req = request({ cookie: 'owned' }); const p = await v2.webAuth(req);
  assert.deepEqual(plain(p), { kind: 'web', user: { id: 'u1', name: 'User', email: 'fixture@example.invalid' }, emailVerified: true, signedInAt: '2026-01-02T03:04:05.000Z' });
  assert.equal(p.signedInAt instanceof Date, true); assert.notEqual(p.user, env.user); assert.equal(env.trace[1][1], req.headers);
  assert.deepEqual(env.trace.map(x => Array.isArray(x) ? x[0] : x), ['getAuth', 'getSession', 'userById']); return { principal: plain(p), trace: ['getAuth', 'getSession', 'userById'] };
});
add('web-missing-and-failed-providers', async load => {
  const rows = [];
  for (const options of [{ session: null }, { session: {} }, { user: null }]) { const { v2, ports } = await load(options); rows.push(errorShape(await failAsync(() => v2.webAuth(request())), ports.V2Error, 401, 'Sign in first', 'unauthorized')); }
  for (const options of [{ authError: token }, { sessionError: token }]) { const { v2 } = await load(options); await failAsync(() => v2.webAuth(request()), token); }
  return { refusals: rows, exactProviderFailures: 2 };
});
add('recent-sign-in-provider', async load => {
  const { v2, ports, env } = await load(); const at = new Date('2026-01-02T00:00:00Z'); const p = { signedInAt: at };
  assert.equal(v2.requireRecentSignIn(p), undefined); assert.equal(env.trace[0][1], at); env.recent = false;
  const rows = [errorShape(failSync(() => v2.requireRecentSignIn(p)), ports.V2Error, 403, 'Sign in again to approve. Approving needs a sign-in from the last 15 minutes.', 'reauth_required'), errorShape(failSync(() => v2.requireRecentSignIn(p, 'delete')), ports.V2Error, 403, 'Recent sign-in for delete', 'reauth_required')];
  assert.deepEqual(env.trace.at(-1), ['reauthMessage', 'delete']); return rows;
});
add('either-auth-header-presence', async load => {
  const { v2, env, ports } = await load(); assert.equal(await v2.eitherAuth(request({ authorization: 'Bearer own' })), env.device);
  errorShape(await failAsync(() => v2.eitherAuth(request({ authorization: '' }))), ports.V2Error, 401, 'Sign in again with align login', 'invalid_token');
  assert.equal((await v2.eitherAuth(request())).kind, 'web'); return { bearerDevice: true, emptyBearerRefused: true, noBearerWeb: true };
});
add('v2-hosted-origin-and-fetch-site', async load => {
  const { v2, ports, env } = await load({ hosted: true }); const rows = [];
  for (const site of [undefined, '', 'same-origin', 'none']) v2.requireSameSite(request({ host: 'APP.INVALID', origin: 'HTTPS://APP.INVALID', ...(site === undefined ? {} : { 'sec-fetch-site': site }) }));
  for (const headers of [{ host: 'app.invalid' }, { host: 'app.invalid', origin: '' }, { host: 'app.invalid', origin: 'http://app.invalid' }, { host: 'app.invalid', origin: 'https://app.invalid:443' }, { host: 'app.invalid', origin: 'https://app.invalid', 'sec-fetch-site': 'cross-site' }, { host: 'app.invalid', origin: 'https://app.invalid', 'sec-fetch-site': 'same-site' }]) rows.push(errorShape(failSync(() => v2.requireSameSite(request(headers))), ports.V2Error, 403, 'This request came from another site', 'cross_site'));
  env.allowed = false; rows.push(errorShape(failSync(() => v2.requireSameSite(request({ host: 'app.invalid', origin: 'https://app.invalid' }))), ports.V2Error, 403, 'This request came from another site', 'cross_site')); return { accepted: 4, refused: rows };
});
add('v2-local-origin-and-fetch-site', async load => {
  const { v2, ports } = await load(); const rows = [];
  for (const headers of [{}, { host: 'any.invalid:9', origin: 'http://any.invalid:9' }, { host: 'any.invalid:9', origin: 'https://any.invalid:9' }, { 'sec-fetch-site': 'none' }]) v2.requireSameSite(request(headers));
  for (const headers of [{ origin: '' }, { origin: 'null' }, { host: 'any.invalid', origin: 'http://other.invalid' }, { 'sec-fetch-site': 'same-site' }]) rows.push(errorShape(failSync(() => v2.requireSameSite(request(headers))), ports.V2Error, 403, 'This request came from another site', 'cross_site')); return { accepted: 4, refused: rows };
});
add('write-auth-effect-order', async load => {
  const { v2, ports, env } = await load({ hosted: true }); const rows = [];
  rows.push(errorShape(await failAsync(() => v2.webWrite(request())), ports.V2Error, 403, 'This request came from another site', 'cross_site')); assert.deepEqual(env.trace, ['config']); env.trace.length = 0;
  let device; await assert.doesNotReject(async () => { device = await v2.eitherWrite(request({ authorization: 'Bearer own' })); }); assert.equal(device, env.device); assert.deepEqual(env.trace, [['deviceFromAccessToken', 'own']]); env.trace.length = 0;
  rows.push(errorShape(await failAsync(() => v2.eitherWrite(request({ authorization: '' }))), ports.V2Error, 401, 'Sign in again with align login', 'invalid_token')); assert.deepEqual(env.trace, []);
  const p = await v2.webWrite(request({ host: 'app.invalid', origin: 'https://app.invalid' })); assert.equal(p.kind, 'web'); assert.deepEqual(env.trace.map(x => Array.isArray(x) ? x[0] : x), ['config', 'hostAllowed', 'getAuth', 'getSession', 'userById']); return { refusals: rows, webOrdering: true, bearerBypassesSameSite: true };
});
add('id-parameter-regexp-state', async load => {
  const { v2, ports } = await load(); const re = /^x$/g; assert.equal(v2.idParam('x', re), 'x'); assert.equal(re.lastIndex, 1);
  const rows = [errorShape(failSync(() => v2.idParam('x', re)), ports.V2Error, 404, 'Not found', 'not_found')]; assert.equal(re.lastIndex, 0);
  for (const value of [undefined, '', 'y']) rows.push(errorShape(failSync(() => v2.idParam(value, re)), ports.V2Error, 404, 'Not found', 'not_found')); return rows;
});
add('v2-empty-body-before-media-check', async load => {
  const { v2 } = await load(); const rows = [];
  for (const req of [request(), bodyRequest(' \n\t', { 'content-type': 'text/plain' }), bodyRequest('', { 'content-type': '' })]) { const value = plain(await v2.readJson(req)); assert.deepEqual(value, {}); rows.push(value); } return rows;
});
add('v2-declared-body-limit', async load => {
  const { v2, ports } = await load(); const trace = [];
  const e = await failAsync(() => v2.readJson({ headers: new Headers({ 'content-length': '5', 'content-type': 'application/json' }), body: controlledBody([Buffer.from('{}')], { trace }) }, 4)); assert.deepEqual(trace, []); return errorShape(e, ports.V2Error, 413, 'This request is too large', 'too_large');
});
add('v2-stream-size-and-utf8', async load => {
  const { v2, ports } = await load(); const bytes = Buffer.from('{"word":"é"}'); const trace = [];
  const got = plain(await v2.readJson({ headers: new Headers({ 'content-type': 'Application/JSON ; charset=utf-8' }), body: controlledBody([bytes.subarray(0, 10), bytes.subarray(10)], { trace }) }, bytes.length)); assert.deepEqual(got, { word: 'é' });
  const cancel = []; const e = await failAsync(() => v2.readJson({ headers: new Headers({ 'content-type': 'application/json' }), body: controlledBody([bytes], { trace: cancel }) }, bytes.length - 1)); assert.deepEqual(cancel, ['getReader', 'read:0', 'cancel:start', 'cancel:end']); return { got, exactBytes: bytes.length, error: errorShape(e, ports.V2Error, 413, 'This request is too large', 'too_large'), cancel };
});
add('v2-media-after-reading', async load => {
  const { v2, ports } = await load(); const trace = [];
  const e = await failAsync(() => v2.readJson({ headers: new Headers({ 'content-type': 'text/plain' }), body: controlledBody([Buffer.from('{}')], { trace }) })); assert.deepEqual(trace, ['getReader', 'read:0', 'read:1']); return { error: errorShape(e, ports.V2Error, 415, 'Send this as application/json', 'unsupported_media_type'), trace };
});
add('v2-json-and-reserved-keys', async load => {
  const { v2, ports } = await load(); const rows = [];
  for (const text of ['{', 'null', '[]', '42', 'true', '"text"']) rows.push(errorShape(await failAsync(() => v2.readJson(bodyRequest(text, { 'content-type': 'application/json' }))), ports.V2Error, 400, text === '{' ? 'Send valid JSON' : 'Send a JSON object', 'bad_request'));
  for (const key of ['__proto__', 'constructor', 'prototype']) rows.push(errorShape(await failAsync(() => v2.readJson(bodyRequest(`{"nested":[{"${key}":1}]}`, { 'content-type': 'application/json' }))), ports.V2Error, 400, `"${key}" is not allowed as a field name`, 'bad_request')); return rows;
});
add('public-origin-provider', async load => {
  const { v2, env } = await load(); const rows = [];
  for (const [pub, host, expected] of [['https://public.invalid/prefix', 'ignored', 'https://public.invalid/prefix'], [null, 'LOCALHOST:9', 'http://LOCALHOST:9'], ['', '', 'http://127.0.0.1'], [null, undefined, 'http://127.0.0.1']]) { env.public = pub; const value = v2.originOf(request(host === undefined ? {} : { host })); assert.equal(value, expected); rows.push(value); } return rows;
});
add('client-network-key', async load => {
  const { v2, env } = await load(); assert.equal(v2.clientKey(request({ 'fly-client-ip': 'own' })), 'local'); assert.deepEqual(env.trace, ['config']); env.trace.length = 0; env.hosted = true; const rows = [];
  for (const value of [undefined, '', '2001:db8::1', '127.0.0.1']) { const got = v2.clientKey(request(value === undefined ? {} : { 'fly-client-ip': value })); assert.equal(got, `ip:net(${value ?? 'unknown'})`); rows.push(got); } return rows;
});
add('serialization-errors-are-mapped', async load => {
  const { legacy, v2, env } = await load({ hosted: true }); const circular = {}; circular.self = circular;
  const first = await jsonResponse(await legacy.handle(async () => circular), 500, { error: 'Server error' });
  const second = await jsonResponse(await v2.route(async () => circular)(request(), { params: Promise.resolve({}) }), 500, { error: 'server_error', message: 'Server error' }); assert.deepEqual(env.logs, [['Server error:', 'TypeError'], ['Server error:', 'TypeError']]); return { first, second, logs: env.logs };
});

add('default-body-cap-and-number-semantics', async load => {
  const { legacy, v2, ports } = await load(); const rows = [];
  for (const [fn, Constructor, code] of [[legacy.cappedJson, ports.HttpError, undefined], [v2.readJson, ports.V2Error, 'too_large']]) {
    const bytes = Buffer.from(`{"x":"${'a'.repeat(65528)}"}`); assert.equal(bytes.length, 65536);
    const got = await fn({ headers: new Headers({ 'content-type': 'application/json' }), body: controlledBody([bytes]) }); assert.equal(got.x.length, 65528);
    const over = Buffer.concat([bytes, Buffer.from(' ')]); const trace = [];
    rows.push(errorShape(await failAsync(() => fn({ headers: new Headers({ 'content-type': 'application/json' }), body: controlledBody([over], { trace }) })), Constructor, 413, 'This request is too large', code));
    assert.deepEqual(trace, ['getReader', 'read:0', 'cancel:start', 'cancel:end']);
    for (const declared of ['NaN', '-1', '0', '']) {
      assert.deepEqual(plain(await fn(bodyRequest('{}', { 'content-type': 'application/json', 'content-length': declared }))), {});
    }
    assert.deepEqual(plain(await fn(bodyRequest('{}', { 'content-type': 'application/json' }), Number.NaN)), {});
    rows.push(errorShape(await failAsync(() => fn(request(), -1)), Constructor, 413, 'This request is too large', code));
  }
  return { exactDefaultBytes: 65536, acceptedBodyBytes: 65536, rejectedStreamBytes: 65537, coercionControlsPerReader: 6, errors: rows };
});
add('malformed-utf8-replacement', async load => {
  const { legacy, v2 } = await load(); const bytes = Buffer.concat([Buffer.from('{"x":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]); const rows = [];
  for (const fn of [legacy.cappedJson, v2.readJson]) { const value = plain(await fn({ headers: new Headers({ 'content-type': 'application/json' }), body: controlledBody([bytes]) })); assert.deepEqual(value, { x: '\ufffd(' }); rows.push(value); } return rows;
});
add('params-rejection-and-error-log-getter', async load => {
  const { legacy, v2, env } = await load({ hosted: true });
  const response = await v2.route(async () => { assert.fail('No handler'); })(request(), { params: { then(resolve, reject) { env.trace.push('params'); reject(token); } } });
  assert.deepEqual(env.trace, ['connection', 'ready', 'params', 'config']);
  const mapped = await jsonResponse(response, 500, { error: 'server_error', message: 'Server error' });
  const error = Object.defineProperty({}, 'name', { get() { throw token; } });
  await failAsync(() => legacy.handle(async () => { throw error; }), token);
  await failAsync(() => v2.route(async () => { throw error; })(request(), { params: Promise.resolve({}) }), token);
  return { mapped, exactLogGetterRejections: 2 };
});
add('provider-failure-and-short-circuit', async load => {
  const one = await load({ hosted: true, hostError: token });
  failSync(() => one.legacy.requireJson(request({ 'content-type': 'application/json', host: 'app.invalid', origin: 'https://app.invalid' })), token);
  failSync(() => one.v2.requireSameSite(request({ host: 'app.invalid', origin: 'https://app.invalid' })), token);
  one.env.trace.length = 0;
  errorShape(failSync(() => one.legacy.requireJson(request())), one.ports.HttpError, 415, 'Send this as application/json');
  assert.deepEqual(one.env.trace, []);
  const two = await load({ userError: token }); await failAsync(() => two.v2.webAuth(request()), token);
  return { exactHostProviderRejections: 2, typeRefusalBeforeProvider: true, exactUserProviderRejection: true };
});

const caseIds = cases.map(x => x.id);
async function observe(load, only) {
  const records = [];
  for (const item of cases) {
    if (only && item.id !== only) continue;
    try { records.push({ id: item.id, observation: await item.run(load) }); }
    catch (error) { error.message = `${item.id}: ${error.message}`; throw error; }
  }
  assert.ok(records.length, 'Unknown or empty case selection');
  return records;
}



const CASE_IDS=caseIds;
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const digest=record=>({sha256:crypto.createHash('sha256').update(JSON.stringify(ordered(record))).digest('hex')});
function generatedBinding(root,surface){
 const entries=CAPABILITIES.map((_,index)=>candidateEntry(root,surface,index)),checks=[];
 const load=async options=>{
  const first=resources(options),second=resources(options),effects=[];
  const refused=name=>{effects.push(name);throw new Error('Undeclared ambient effect: '+name);};
  const context=vm.createContext({Response,Request,Headers,Buffer,URL,Date,__denyRequestEffect:refused});
  // Functional conformance guard. This is not a security sandbox.
  vm.runInContext(
   "Object.defineProperty(Math,'random',{get(){return()=>__denyRequestEffect('Math.random');},set(){return __denyRequestEffect('Math.random mutation');}});"+
   "const RequestDate=Date;const GuardedRequestDate=new Proxy(RequestDate,{apply(){return __denyRequestEffect('Date call');},construct(target,args){if(args.length!==1)return __denyRequestEffect('clock date construction');return Reflect.construct(target,args,target);},get(target,key){return key==='now'?()=>__denyRequestEffect('Date.now'):Reflect.get(target,key);}});"+
   "Object.defineProperty(globalThis,'Date',{get(){return GuardedRequestDate;},set(){return __denyRequestEffect('Date assignment');}});"+
   "for(const label of ['process','console','performance','crypto','WebAssembly']){const denied=new Proxy({}, {get(_target,key){return __denyRequestEffect(label+'.'+String(key));},set(){return __denyRequestEffect(label+' mutation');}});Object.defineProperty(globalThis,label,{get(){return denied;},set(){return __denyRequestEffect(label+' assignment');}});}"+
   "for(const label of ['setTimeout','setInterval','setImmediate','queueMicrotask','fetch','eval','Function'])globalThis[label]=new Proxy(function(){},{apply(){return __denyRequestEffect(label);},construct(){return __denyRequestEffect('new '+label);}});"+
   "globalThis.WebSocket=new Proxy(function(){},{apply(){return __denyRequestEffect('WebSocket');},construct(){return __denyRequestEffect('new WebSocket');}});",
   context);
  const check=()=>assert.deepEqual(effects,[],'Undeclared ambient effects');checks.push(check);
  const namespaces=[];
  for(let index=0;index<2;index++){
   const factory=await candidateLoader(root,entries[index],context,refused,SYMBOLS[index])();check();
   function instantiate(ports){
    const reads=[];
    const input=new Proxy(ports,{get(target,key,receiver){reads.push(key);return Reflect.get(target,key,receiver);}});
    const api=factory(input);check();
    assert(api&&typeof api==='object'&&typeof api.then!=='function','Factory must synchronously return a namespace');
    assert.deepEqual(reads.slice().sort(),RESOURCE_KEYS[index].slice().sort(),'Capture each resource once at construction');
    assert.deepEqual(Object.keys(api).sort(),PUBLIC_KEYS[index].slice().sort());
    if(index===1)assert.equal(api.isRecentSignIn,ports.isRecentSignIn,'Exact freshness provider export');
    return api;
   }
   const one=instantiate(first.ports),two=instantiate(second.ports);assert.notEqual(one,two,'Separate binding namespaces');
   assert.deepEqual(first.env.trace,[],'No construction-time provider invocation');
   assert.deepEqual(second.env.trace,[],'No construction-time provider invocation');
   assert.deepEqual(first.env.logs,[]);assert.deepEqual(second.env.logs,[]);
   namespaces.push(one);
  }
  return {...first,legacy:namespaces[0],v2:namespaces[1]};
 };
 load.check=()=>checks.forEach(check=>check());return load;
}
async function runSelected(root,surface,selected){
 assert(selected.length>0&&selected.length<=CASE_IDS.length);
 const indices=selected.map(item=>{
  assert(CAPABILITIES.includes(item.capability));assert(Array.isArray(item.arguments)&&item.arguments.length===1);
  const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<CASE_IDS.length);return index;
 });
 assert.equal(new Set(indices).size,indices.length,'Duplicate case selectors');
 const load=generatedBinding(root,surface),records=[];
 for(const index of indices){records.push(...await observe(load,CASE_IDS[index]));load.check();}
 assert.equal(records.length,selected.length);
 return selected.map((item,index)=>({case_id:item.case_id,capability:item.capability,result:digest(records[index])}));
}
async function main(){
 const argv=process.argv.slice(2);assert.equal(argv.length,3);
 const cases=await runSelected(path.resolve(argv[0]),JSON.parse(argv[1]),JSON.parse(argv[2]));
 process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,RESOURCE_KEYS,PUBLIC_KEYS,observe,generatedBinding,runSelected,digest,main};
if(require.main===module){
 if(typeof vm.SourceTextModule!=='function'){
  const child=require('node:child_process').spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit',timeout:900000});
  if(child.error)throw child.error;process.exit(child.status??1);
 }
 main().catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
}

function verifierBytes() {
  const text = historicalVerifier.toString();
  const bytes = Buffer.from(text.slice(text.indexOf('{') + 1, -1));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), SETTINGS.inner_sha256,
    'Historical verifier bytes changed');
  return bytes;
}

function directFile(directory, name) {
  assert(/^[a-zA-Z0-9_.-]+$/.test(name) && name !== '.' && name !== '..');
  const file = path.join(directory, name);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Unsafe candidate member');
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

async function runSelected(root, surface, selected) {
  assert(Array.isArray(selected) && selected.length > 0 && selected.length <= SETTINGS.maximum_cases);
  const input = JSON.stringify({surface, selected});
  assert(Buffer.byteLength(input) <= 256 * 1024, 'Oversized oracle request');
  assert(Buffer.byteLength(JSON.stringify(surface)) <= 64 * 1024 &&
    Buffer.byteLength(JSON.stringify(selected)) <= 64 * 1024, 'Oracle argument exceeds portable CLI bound');
  const source = fs.realpathSync(root);
  const candidates = [path.join(source, SETTINGS.package), path.join(source, 'source', SETTINGS.package)]
    .filter(file => fs.existsSync(file));
  assert.equal(candidates.length, 1, 'Expected one candidate package');
  const candidate = candidates[0];
  // Reject symlinks below the resolved caller root, including an intermediate source directory.
  let at = source;
  for (const part of path.relative(source, candidate).split(path.sep)) {
    at = path.join(at, part);
    assert(fs.lstatSync(at).isDirectory() && !fs.lstatSync(at).isSymbolicLink());
  }
  assert.deepEqual(fs.readdirSync(candidate).sort(), [...SETTINGS.package_files].sort());
  // Desktop Docker shares the home directory. Its VM need not share the OS temporary directory.
  const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  const snapshot = fs.mkdtempSync(path.join(fs.realpathSync(cache), 'evaluation-'));
  const name = 'align-oracle-' + crypto.randomUUID();
  assert(!/[\r\n,]/.test(snapshot), 'Unsupported mount path');
  let started = false;
  const dockerEnvironment = {...process.env};
  // Host-side executable configuration must not load application-supplied Node preload hooks.
  delete dockerEnvironment.NODE_OPTIONS;
  delete dockerEnvironment.NODE_PATH;
  try {
    const packageRoot = path.join(snapshot, 'source', SETTINGS.package);
    fs.mkdirSync(packageRoot, {recursive: true, mode: 0o755});
    fs.chmodSync(path.join(snapshot, 'source'), 0o755);
    fs.chmodSync(packageRoot, 0o755);
    for (const file of SETTINGS.package_files) {
      fs.writeFileSync(path.join(packageRoot, file), directFile(candidate, file), {mode: 0o444});
    }
    fs.writeFileSync(path.join(snapshot, 'oracle.cjs'), verifierBytes(), {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'request.json'), input, {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'execute.cjs'), [
      "'use strict';",
      "const input=require('./request.json');",
      "const cp=require('node:child_process');",
      "const result=cp.spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--max-old-space-size=512','/inputs/oracle.cjs','/inputs/source',JSON.stringify(input.surface),JSON.stringify(input.selected)],{encoding:'utf8',timeout:130000,maxBuffer:4*1024*1024});",
      "if(result.error||result.status!==0){console.error(result.error?.code||result.status,result.stderr);process.exitCode=1;}else process.stdout.write(result.stdout);",
    ].join('\n'), {mode: 0o444});
    // Do not depend on the caller's umask for container readability.
    for (const file of SETTINGS.package_files) fs.chmodSync(path.join(packageRoot, file), 0o444);
    for (const file of ['oracle.cjs', 'request.json', 'execute.cjs']) {
      fs.chmodSync(path.join(snapshot, file), 0o444);
    }
    fs.chmodSync(snapshot, 0o755);
    const info=cp.spawnSync('docker',['info','--format','{{.NCPU}}'],{env:dockerEnvironment,encoding:'utf8',timeout:10000});
    if(info.error||info.status!==0)throw Error('Docker runtime unavailable: '+(info.error?.code||info.status));
    const available=Number(info.stdout.trim());
    assert(Number.isInteger(available)&&available>=1&&available<=512,'Invalid Docker CPU capacity');
    const cpus=Math.min(SETTINGS.cpus,available);
    const argv = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
      '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=' + SETTINGS.memory_mib + 'm', '--cpus=' + cpus,
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp',
      '--mount', `type=bind,source=${snapshot},target=/inputs,readonly`,
      '--workdir=/inputs', '--entrypoint=/usr/bin/timeout', SETTINGS.image,
      '--signal=KILL', SETTINGS.worker_seconds + 's', 'node', '--no-warnings', '--max-old-space-size=512', '/inputs/execute.cjs'];
    started = true;
    const result = cp.spawnSync('docker', argv, {env: dockerEnvironment, encoding: 'utf8',
      timeout: 150000, maxBuffer: 4 * 1024 * 1024});
    if (result.error || result.status !== 0) {
      throw Error('Contained oracle failed: ' + (result.error?.code || result.status) + '\n' +
        String(result.stderr || '').slice(0, 1600));
    }
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'literate-ai/library-acceptance-results@1');
    assert(Array.isArray(value.cases) && value.cases.length === selected.length);
    assert.deepEqual(value.cases.map(item => [item.case_id, item.capability]),
      selected.map(item => [item.case_id, item.capability]));
    return value.cases;
  } finally {
    if (started) cp.spawnSync('docker', ['rm', '--force', name], {
      env: dockerEnvironment, stdio: 'ignore', timeout: 10000});
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}

module.exports = {runSelected};
if (require.main === module) {
  assert.equal(process.argv.length, 5);
  runSelected(process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]))
    .then(cases => process.stdout.write(JSON.stringify({schema: 'literate-ai/library-acceptance-results@1', cases}) + '\n'))
    .catch(error => {console.error(error.stack); process.exitCode = 1;});
}
