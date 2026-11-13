"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normal = normal;
exports.runScenarios = runScenarios;
// Source-independent requests and owned resources. Never includes original code.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const server_auth_fixture_v1_mjs_1 = require("./server-auth-fixture-v1.mjs");
function normal(value, seen = new Set()) {
    if (value === undefined)
        return { $undefined: true };
    if (typeof value === 'function')
        return { $function: true, arity: value.length };
    if (typeof value === 'bigint')
        return { $bigint: String(value) };
    if (typeof value === 'number' && !Number.isFinite(value))
        return { $number: String(value) };
    if (value === null || typeof value !== 'object')
        return value;
    if (value instanceof Date)
        return { $date: Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString() };
    if (value instanceof Error)
        return { $error: value.name, message: value.message, ...Object.fromEntries(['status', 'statusCode', 'body', 'headers'].filter(k => k in value).map(k => [k, normal(value[k])])) };
    if (seen.has(value))
        return { $cycle: true };
    const next = new Set(seen);
    next.add(value);
    if (Array.isArray(value))
        return value.map(x => normal(x, next));
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, normal(value[k], next)]));
}
const SEND = '/email-otp/send-verification-otp', SIGN = '/sign-in/email-otp';
const request = (ip = '192.0.2.5', host = 'localhost:3100') => new Request('http://localhost:3100' + SEND, { method: 'POST', headers: { host, 'fly-client-ip': ip } });
async function runScenarios(load, { labels } = {}) {
    const selected = labels ? new Set(labels) : null;
    if (selected)
        strict_1.default.equal(selected.size, labels.length);
    const records = [];
    async function observe(name, options, action) {
        if (selected && !selected.has(name))
            return;
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)(options), loaded = await load(f), n = loaded.namespace ?? loaded;
        strict_1.default.deepEqual(Object.keys(n).sort(), server_auth_fixture_v1_mjs_1.PUBLIC);
        const initial = normal(f.trace);
        f.trace.length = 0;
        let value, error;
        try {
            value = await action(n, f);
        }
        catch (e) {
            error = e;
        }
        records.push({ name, initial, value: normal(value), error: normal(error), trace: normal(f.trace), files: normal(Object.fromEntries(f.files)) });
        return { value, error, f, n };
    }
    await observe('public-surface', {}, n => Object.fromEntries(Object.keys(n).sort().map(k => [k, n[k]])));
    const now = Date.parse('2026-01-02T03:04:05.000Z');
    for (const [label, input, instant] of [
        ['recent', new Date(now - 1), now], ['edge', new Date(now - 900000), now], ['old', new Date(now - 900001), now],
        ['future', new Date(now + 900001), now], ['invalid', 'not-a-date', now], ['epoch', new Date(0), now],
        ['iso', '2026-01-02T03:04:05.000Z', now], ['no-now', new Date(now - 900000), undefined],
    ])
        await observe('recent:' + label, {}, n => instant === undefined ? n.isRecentSignIn(input) : n.isRecentSignIn(input, instant));
    for (const wait of [-1, 0, 1, 999, 1000, 59999, 60000, 60001, 120000, 3600001, Infinity, NaN]) {
        await observe('code-wait:' + String(wait), {}, n => n.tooManyCodesMessage(wait));
        await observe('ceiling-wait:' + String(wait), {}, n => n.machineCeilingMessage(wait, 60));
    }
    for (const what of ['delete this account', '', null, undefined, 42])
        await observe('reauth:' + String(what), {}, n => n.reauthMessage(what));
    for (const days of [1, 7, 30, 365])
        for (const input of ['2026-01-02T03:04:05.000Z', new Date(now), 'invalid'])
            await observe('cap:' + days + ':' + (input instanceof Date ? 'Date:' + input.toISOString() : String(input)), { maxDays: days }, n => n.sessionCap(input));
    for (const [name, settings] of [
        ['local', {}], ['local-port', { env: { PORT: '7777' } }], ['local-public', { origin: 'https://public.example.test' }],
        ['hosted', { hosted: true, origin: 'https://public.example.test' }], ['hosted-no-origin', { hosted: true }],
        ['hosted-ipv6', { hosted: true, origin: 'https://[2001:db8::1]:8443' }], ['invalid-public', { hosted: true, origin: '%%%' }],
    ])
        await observe('party:' + name, settings, n => n.passkeyParty());
    const common = { env: { BETTER_AUTH_SECRET: 'owned-secret' } };
    for (const [name, settings] of [
        ['local', {}], ['hosted', { hosted: true, origin: 'https://app.example.test' }], ['hosted-no-origin', { hosted: true }],
        ['local-test', { testIdp: true, testOAuth: 'http://127.0.0.1:9999' }], ['hosted-test-refused', { hosted: true, testIdp: true }],
        ['google', { google: true }], ['github', { github: true }], ['both-social', { google: true, github: true }],
        ['email-off', { emailEnabled: false }], ['captcha', { captcha: { id: 'owned-captcha' } }],
    ])
        await observe('options:' + name, { ...common, ...settings, env: { ...common.env, GOOGLE_CLIENT_ID: 'owned-google-id', GOOGLE_CLIENT_SECRET: 'owned-google-secret', GITHUB_CLIENT_ID: 'owned-github-id', GITHUB_CLIENT_SECRET: 'owned-github-secret', PORT: '3100', ...settings.env } }, n => n.authOptions());
    await observe('secret:new', {}, n => n.authOptions().secret);
    await observe('secret:existing', { files: { '/owned/data/v2/.auth-secret': '  preserved-key\n' } }, n => n.authOptions().secret);
    await observe('secret:hosted-missing', { hosted: true }, n => n.authOptions());
    await observe('secret:environment-whitespace', { env: { BETTER_AUTH_SECRET: '  keep-whitespace\n' } }, n => n.authOptions().secret);
    await observe('options:fresh-environment', common, (n, f) => { const a = n.authOptions(); f.env.PORT = '7777'; f.state.hosted = true; f.state.origin = 'https://second.example.test'; return [a, n.authOptions()]; });
    for (const [name, settings, body, req] of [
        ['unrelated', {}, undefined, null], ['wrong-type', {}, { email: 'one@example.test', type: 'verify-email' }, request()],
        ['empty-email', {}, { email: ' ', type: 'sign-in' }, request()], ['non-string-email', {}, { email: 3, type: 'sign-in' }, request()],
        ['local', {}, { email: ' ONE@Example.Test ', type: 'sign-in' }, request()],
        ['local-owner', {}, { email: 'owner@example.test', type: 'sign-in' }, request()],
        ['in-process', {}, { email: 'one@example.test', type: 'sign-in' }, null],
        ['hosted', { hosted: true }, { email: 'one@example.test', type: 'sign-in' }, request()],
        ['hosted-no-ip', { hosted: true }, { email: 'one@example.test', type: 'sign-in' }, new Request('http://localhost:3100')],
        ['memory-refused', { take: false, memoryWait: 60001 }, { email: 'one@example.test', type: 'sign-in' }, request()],
        ['durable-refused', { hosted: true, room: false, durableWait: 120001, memoryWait: 60001 }, { email: 'one@example.test', type: 'sign-in' }, request()],
        ['ceiling-tied', { take: false, memoryWait: 120001, ceilingWait: 120001 }, { email: 'one@example.test', type: 'sign-in' }, request()],
        ['ceiling-shorter', { take: false, memoryWait: 120001, ceilingWait: 60001 }, { email: 'one@example.test', type: 'sign-in' }, request()],
        ['zero-refusal-wait', { take: false, memoryWait: 0 }, { email: 'one@example.test', type: 'sign-in' }, request()],
    ])
        await observe('before-send:' + name, { ...common, ...settings }, async (n, f) => { const options = n.authOptions(); f.trace.length = 0; return options.hooks.before(f.hookContext({ path: name === 'unrelated' ? '/unrelated' : SEND, body, request: req })); });
    for (const route of ['/passkey/generate-register-options', '/passkey/verify-registration', '/link-social'])
        for (const [name, session, body] of [
            ['none', null, {}], ['recent', { session: { createdAt: new Date(now - 900000) } }, {}],
            ['old', { session: { createdAt: new Date(now - 900001) } }, {}], ['long-name', null, { name: 'x'.repeat(101) }],
            ['trimmed-name', null, { name: '  ' + 'x'.repeat(100) + '  ' }], ['non-string-name', null, { name: 1000 }],
        ])
            await observe('recent-route:' + route + ':' + name, { ...common, session }, async (n, f) => { const options = n.authOptions(); f.trace.length = 0; return options.hooks.before(f.hookContext({ path: route, body })); });
    await observe('session:presented-token', { ...common, token: 'owned-token' }, async (n, f) => { const options = n.authOptions(); f.trace.length = 0; return options.hooks.before(f.hookContext()); });
    const code = '123456', hashed = node_crypto_1.default.createHash('sha256').update(code).digest('base64url');
    for (const [name, user, verification, otp] of [
        ['no-user', null, null, code], ['verified', { user: { emailVerified: true } }, null, code],
        ['no-record', { user: { emailVerified: false } }, null, code],
        ['expired', { user: { emailVerified: false } }, { expiresAt: new Date(now - 1), value: hashed }, code],
        ['exact-expiry', { user: { emailVerified: false } }, { expiresAt: new Date(now), value: hashed }, code],
        ['correct', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed }, code],
        ['attempt-two', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed + ':2' }, code],
        ['attempt-three', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed + ':3' }, code],
        ['bad-attempt-value', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed + ':bad' }, code],
        ['wrong-code', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed }, '654321'],
        ['non-string-code', { user: { emailVerified: false } }, { expiresAt: new Date(now + 1), value: hashed }, 123456],
    ])
        await observe('unverified:' + name, { ...common, user, verification }, async (n, f) => { const options = n.authOptions(); f.trace.length = 0; return options.hooks.before(f.hookContext({ path: SIGN, body: { email: ' ONE@Example.Test ', otp } })); });
    for (const path of [SEND, '/passkey/verify-registration', '/unrelated'])
        for (const [index, returned] of [undefined, { id: 'pk_1', userId: 'u_1' }, { id: 42, userId: 'u_1' }, new Error('owned returned error')].entries())
            await observe('after:' + path + ':' + index, common, async (n, f) => { const options = n.authOptions(); f.trace.length = 0; return options.hooks.after(f.hookContext({ path, returned, request: request() })); });
    for (const [name, settings, headers] of [
        ['local', {}, new Headers({ host: 'localhost:3100' })], ['allowed', {}, new Headers({ host: '127.0.0.1:3100' })],
        ['untrusted', {}, new Headers({ host: 'untrusted.example.test' })], ['missing', {}, undefined],
        ['public', { origin: 'https://public.example.test' }, new Headers({ host: 'untrusted.example.test' })],
    ])
        await observe('delivery:' + name, { ...common, ...settings }, async (n, f) => { const options = n.authOptions(), plugin = options.plugins.find(x => x.id === 'emailOTP'); f.trace.length = 0; return plugin.options.sendVerificationOTP({ email: 'one@example.test', otp: code, type: 'sign-in' }, { headers, context: f.hookContext().context }); });
    for (const withRequest of [false, true])
        for (const deletionFails of [false, true])
            await observe('delivery-failure:' + withRequest + ':' + deletionFails, { ...common, sendError: new Error('owned delivery fault'), deleteError: deletionFails ? new Error('owned deletion fault') : null }, async (n, f) => {
                const options = n.authOptions(), plugin = options.plugins.find(x => x.id === 'emailOTP'), req = withRequest ? request() : null, ctx = f.hookContext({ path: SEND, request: req });
                f.trace.length = 0;
                let sendError, afterError;
                try {
                    await plugin.options.sendVerificationOTP({ email: 'one@example.test', otp: code, type: 'sign-in' }, ctx);
                }
                catch (e) {
                    sendError = normal(e);
                }
                try {
                    await options.hooks.after(ctx);
                }
                catch (e) {
                    afterError = normal(e);
                }
                return { sendError, afterError };
            });
    await observe('delivery:wrong-type', common, async (n, f) => { const o = n.authOptions(); f.trace.length = 0; return o.plugins.find(x => x.id === 'emailOTP').options.sendVerificationOTP({ email: 'one@example.test', otp: code, type: 'verify-email' }, f.hookContext()); });
    for (const id of ['credential_1', 42, undefined])
        await observe('passkey-use:' + String(id), common, async (n, f) => { const o = n.authOptions(); f.trace.length = 0; return o.plugins.find(x => x.id === 'passkey').options.authentication.afterVerification({ clientData: { id } }); });
    for (const [name, changes, ctx] of [
        ['create-unbounded', { createdAt: new Date(now), expiresAt: new Date(now + 31 * 86400000) }, null],
        ['create-at-cap', { createdAt: new Date(now), expiresAt: new Date(now + 30 * 86400000) }, null],
        ['create-default-date', { expiresAt: new Date(now + 31 * 86400000) }, null],
        ['create-no-expiry', { createdAt: new Date(now) }, null],
        ['update-cap', { expiresAt: new Date(now + 31 * 86400000) }, { context: { session: { session: { createdAt: new Date(now) } } } }],
        ['update-no-session', { expiresAt: new Date(now + 31 * 86400000) }, undefined],
        ['update-no-expiry', {}, { context: { session: { session: { createdAt: new Date(now) } } } }],
    ])
        await observe('database-session:' + name, common, async (n, f) => { const o = n.authOptions(); f.trace.length = 0; return name.startsWith('create') ? o.databaseHooks.session.create.before(changes) : o.databaseHooks.session.update.before(changes, ctx); });
    for (const [name, settings, record, ctx] of [
        ['non-email', { hosted: true }, { email: 'ONE@Example.Test' }, { path: '/sign-up/email' }],
        ['local', {}, { email: 'ONE@Example.Test', other: 42 }, { path: SIGN }],
        ['named', {}, { email: 'ONE@Example.Test', name: 'Existing' }, { path: SIGN }],
        ['truncate', {}, { email: 'x'.repeat(101) + '@example.test' }, { path: SIGN }],
        ['hosted-refuse', { hosted: true }, { email: 'ONE@Example.Test' }, { path: SIGN }],
        ['hosted-invite', { hosted: true, query: sql => sql.includes('v2_invites') ? { x: 1 } : undefined }, { email: 'ONE@Example.Test' }, { path: SIGN }],
        ['hosted-code', { hosted: true, liveCode: { id: 'owned-code' } }, { email: 'ONE@Example.Test' }, { path: SIGN }],
        ['hosted-first', { hosted: true, env: { BETTER_AUTH_SECRET: 'owned-secret', ALIGN_FIRST_OWNER_EMAIL: ' ONE@Example.Test ' } }, { email: 'ONE@Example.Test' }, { path: SIGN }],
        ['hosted-first-occupied', { hosted: true, env: { BETTER_AUTH_SECRET: 'owned-secret', ALIGN_FIRST_OWNER_EMAIL: 'one@example.test' }, query: sql => sql.includes('ba_user') ? { x: 1 } : undefined }, { email: 'ONE@Example.Test' }, { path: SIGN }],
    ])
        await observe('database-user:' + name, { ...common, ...settings }, async (n, f) => { const o = n.authOptions(); f.trace.length = 0; return o.databaseHooks.user.create.before(record, ctx); });
    for (const model of ['user', 'ba_user', 'notuser', 'session', 'User', ''])
        await observe('generated-id:' + model, common, (n, f) => { const o = n.authOptions(); f.trace.length = 0; return o.advanced.database.generateId({ model }); });
    for (const [name, e] of [['400', { api: 'BAD_REQUEST' }], ['403', { api: 'FORBIDDEN' }], ['500', { api: 'INTERNAL_SERVER_ERROR' }], ['ordinary', new Error('owned runtime fault')], ['unknown', { owned: true }]])
        await observe('api-error:' + name, common, (n, f) => {
            const o = n.authOptions(), error = e.api ? new f.OwnedAPIError(e.api, { message: 'owned refusal' }) : e;
            f.trace.length = 0;
            return o.onAPIError.onError(error, { logger: { error(...args) { f.trace.push(['logger.error', ...args]); } } });
        });
    await observe('singleton:reuse', common, (n, f) => { const a = n.getAuth(), b = n.getAuth(); strict_1.default.equal(a, b); strict_1.default.equal(a, f.auth); return a === b; });
    await observe('migration:ordinary', common, async (n, f) => { await n.migrateAuth(); return f.trace.filter(x => x[0] === 'runMigrations').length; });
    for (const operation of ['cookie-delete', 'migrations', 'database', 'hash', 'filesystem'])
        await observe('provider-failure:' + operation, { ...common, token: 'owned-token' }, async (n, f) => {
            const fault = new Error('owned ' + operation + ' fault');
            if (operation === 'cookie-delete')
                f.state.adapterError = fault;
            if (operation === 'migrations')
                f.state.adapterError = fault;
            if (operation === 'database')
                f.modules['./db'].authDb = () => { throw fault; };
            if (operation === 'hash')
                f.modules['node:crypto'].createHash = () => { throw fault; };
            if (operation === 'filesystem') {
                delete f.env.BETTER_AUTH_SECRET;
                f.modules['node:fs'].existsSync = () => { throw fault; };
            }
            // Imported bindings were captured during evaluation, so modify behavior through
            // captured providers where applicable. Database/hash/filesystem faults use a fresh load.
            const fresh = await load(f), a = fresh.namespace ?? fresh;
            let caught;
            try {
                if (operation === 'migrations')
                    await a.migrateAuth();
                else if (operation === 'cookie-delete') {
                    const o = a.authOptions();
                    await o.hooks.before(f.hookContext());
                }
                else if (operation === 'hash') {
                    f.state.user = { user: { emailVerified: false } };
                    f.state.verification = { expiresAt: new Date(now + 1), value: hashed };
                    const o = a.authOptions();
                    await o.hooks.before(f.hookContext({ path: SIGN, body: { email: 'one@example.test', otp: code } }));
                }
                else
                    a.authOptions();
            }
            catch (e) {
                caught = e;
            }
            strict_1.default.equal(caught, fault);
            return { exact_error_identity: true };
        });
    if (selected)
        strict_1.default.deepEqual(records.map(x => x.name).sort(), [...selected].sort());
    return records;
}
